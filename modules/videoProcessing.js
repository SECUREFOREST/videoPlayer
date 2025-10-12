const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { execAsync, getFFmpegPath, getFFprobePath } = require('./ffmpeg');
const { isVideoFile, isHLSFile, isVideoOrHLSFile, getVideoMimeType, VIDEOS_ROOT } = require('./fileUtils');
const { DURATIONS_CACHE_FILE } = require('./config');

// Duration cache
let durationCache = {};

// Directory structure cache
let directoryCache = new Map();

// Warning cache to prevent duplicate warnings
let warnedFiles = new Set();

// Directory cache TTL (5 minutes)
const DIRECTORY_CACHE_TTL = 5 * 60 * 1000;

// Check if directory cache entry is valid
function isDirectoryCacheValid(entry) {
    return entry && (Date.now() - entry.timestamp) < DIRECTORY_CACHE_TTL;
}

// Get directory contents from cache or filesystem
async function getDirectoryContents(dirPath) {
    const cacheKey = dirPath;
    const cached = directoryCache.get(cacheKey);
    
    if (isDirectoryCacheValid(cached)) {
        return cached.data;
    }
    
    // Cache miss or expired, read from filesystem
    try {
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
        const items = [];
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            let stats;
            let size = 0;
            let modified = new Date();
            
            try {
                stats = await fsPromises.stat(fullPath);
                size = stats.size;
                modified = stats.mtime;
            } catch (error) {
                // Skip files we can't access
                continue;
            }
            
            const ext = path.extname(entry.name).toLowerCase();
            const isHLS = isHLSFile(ext);
            const isVideo = isVideoOrHLSFile(ext);
            
            items.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                isVideo: isVideo,
                isHLS: isHLS,
                size: size,
                modified: modified,
                extension: ext
            });
        }
        
        // Cache the result
        directoryCache.set(cacheKey, {
            data: items,
            timestamp: Date.now()
        });
        
        return items;
    } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error);
        return [];
    }
}

// Invalidate directory cache for a specific path and its parents
function invalidateDirectoryCache(dirPath) {
    // Remove the specific directory
    directoryCache.delete(dirPath);
    
    // Remove parent directories (they might be affected by changes)
    const pathParts = dirPath.split(path.sep);
    for (let i = pathParts.length; i > 0; i--) {
        const parentPath = pathParts.slice(0, i).join(path.sep);
        directoryCache.delete(parentPath);
    }
}

// Clear all directory cache
function clearDirectoryCache() {
    directoryCache.clear();
}

// Load duration cache from file
async function loadDurationCache() {
    try {
        const data = await fsPromises.readFile(DURATIONS_CACHE_FILE, 'utf8');
        durationCache = JSON.parse(data);
        // Duration cache loaded
    } catch (error) {
        // No duration cache found, starting fresh
        durationCache = {};
    }
}

// Save duration cache to file
async function saveDurationCache() {
    try {
        await fsPromises.writeFile(DURATIONS_CACHE_FILE, JSON.stringify(durationCache, null, 2));
    } catch (error) {
        console.error('Error saving duration cache:', error);
    }
}

// Get video duration using cache first, then ffprobe if needed
async function getVideoDuration(videoPath) {
    // Check cache first
    // For HLS files, use hls folder as base, otherwise use videos folder
    const ext = path.extname(videoPath).toLowerCase();
    const isHLS = ext === '.m3u8';
    const basePath = isHLS ? path.join(path.dirname(VIDEOS_ROOT), 'hls') : VIDEOS_ROOT;
    const relativePath = path.relative(basePath, videoPath);
    
    if (durationCache[relativePath]) {
        return durationCache[relativePath];
    }

    // If not in cache, get from ffprobe
    try {
        const ffprobePath = getFFprobePath();
        const command = `"${ffprobePath}" -v quiet -show_entries format=duration -of csv="p=0" "${videoPath}"`;
        const { stdout } = await execAsync(command);
        const duration = parseFloat(stdout.trim());
        
        if (!isNaN(duration) && duration > 0) {
            // Cache the result
            durationCache[relativePath] = duration;
            await saveDurationCache();
            return duration;
        }
    } catch (error) {
        console.error(`Error getting duration for ${videoPath}:`, error.message);
    }
    
    return null;
}

// Get HLS duration from playlist
async function getHLSDuration(masterPlaylistPath) {
    try {
        // Check if this is an HLS file in the videos directory (should be skipped)
        if (masterPlaylistPath.includes(VIDEOS_ROOT) && masterPlaylistPath.endsWith('.m3u8')) {
            if (!warnedFiles.has(masterPlaylistPath)) {
                console.log(`⚠️ Skipping HLS file in videos directory: ${masterPlaylistPath} - HLS files should be in hls directory`);
                warnedFiles.add(masterPlaylistPath);
            }
            return null;
        }
        
        // Check if file exists before trying to read it
        try {
            await fsPromises.access(masterPlaylistPath);
        } catch (error) {
            console.warn(`HLS file not found: ${masterPlaylistPath}`);
            return null;
        }
        
        const content = await fsPromises.readFile(masterPlaylistPath, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('#EXT-X-TARGETDURATION:')) {
                const targetDuration = parseFloat(line.split(':')[1]);
                const segmentCount = lines.filter(l => l.endsWith('.ts')).length;
                return segmentCount * targetDuration;
            }
        }
        
        const hlsInfo = await getHLSInfo(masterPlaylistPath);
        if (hlsInfo.qualities.length > 0) {
            const firstQualityPath = path.join(path.dirname(masterPlaylistPath), hlsInfo.qualities[0].playlist);
            try {
                const qualityContent = await fsPromises.readFile(firstQualityPath, 'utf8');
                const qualityLines = qualityContent.split('\n');
                
                let totalDuration = 0;
                for (const line of qualityLines) {
                    if (line.startsWith('#EXTINF:')) {
                        const duration = parseFloat(line.split(':')[1].split(',')[0]);
                        totalDuration += duration;
                    }
                }
                return totalDuration;
            } catch (e) {
                // Could not read quality playlist for duration
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error getting HLS duration:', error);
        return null;
    }
}

// Get HLS info from master playlist
async function getHLSInfo(masterPlaylistPath) {
    try {
        // Check if file exists before trying to read it
        try {
            await fsPromises.access(masterPlaylistPath);
        } catch (error) {
            console.warn(`HLS file not found: ${masterPlaylistPath}`);
            return {
                isMasterPlaylist: false,
                qualities: [],
                totalQualities: 0
            };
        }
        
        const content = await fsPromises.readFile(masterPlaylistPath, 'utf8');
        const lines = content.split('\n');
        const qualities = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                const nextLine = lines[i + 1]?.trim();
                if (nextLine && !nextLine.startsWith('#')) {
                    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
                    const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                    const codecsMatch = line.match(/CODECS="([^"]+)"/);
                    
                    qualities.push({
                        quality: resolutionMatch ? resolutionMatch[1] : 'unknown',
                        bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0,
                        codecs: codecsMatch ? codecsMatch[1] : '',
                        playlist: nextLine
                    });
                }
            }
        }
        
        return {
            isMasterPlaylist: true,
            qualities: qualities,
            totalQualities: qualities.length
        };
    } catch (error) {
        console.error('Error reading HLS master playlist:', error);
        return {
            isMasterPlaylist: false,
            qualities: [],
            totalQualities: 0
        };
    }
}

// Generate HLS thumbnail
async function getHLSThumbnail(masterPlaylistPath) {
    try {
        // Get HLS thumbnail
        
        // Check if thumbnail already exists
        // For HLS files, calculate relative path from hls folder instead of videos folder
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        const relativePath = path.relative(hlsRootPath, masterPlaylistPath);
        const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
        const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
        
        // Check if thumbnail exists
        
        if (fs.existsSync(thumbnailPath)) {
            const thumbnailUrl = `/thumbnails/${encodeURIComponent(safeName + '.jpg')}`;
            // HLS thumbnail found
            return thumbnailUrl;
        }
        
        // HLS thumbnail not found
        return null;
    } catch (error) {
        console.error('❌ Error getting HLS thumbnail:', error);
        return null;
    }
}

// Generate HLS thumbnail (for background generation)
async function generateHLSThumbnail(masterPlaylistPath) {
    try {
        console.log('🔄 Generating HLS thumbnail for:', masterPlaylistPath);
        console.log('🔄 HLS thumbnail generation started at:', new Date().toISOString());
        
        // For HLS files, calculate relative path from hls folder instead of videos folder
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        const relativePath = path.relative(hlsRootPath, masterPlaylistPath);
        const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
        const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
        
        console.log('🔄 HLS thumbnail details:');
        console.log('  📁 Safe name:', safeName);
        
        // Check if existing thumbnail needs updating
        if (fs.existsSync(thumbnailPath)) {
            const stats = fs.statSync(thumbnailPath);
            const fileAge = Date.now() - stats.mtime.getTime();
            const isOldThumbnail = fileAge > 24 * 60 * 60 * 1000; // Older than 24 hours
            const isSmallThumbnail = stats.size < 5000; // Smaller than 5KB
            
            if (isOldThumbnail || isSmallThumbnail) {
                console.log('🔄 HLS thumbnail needs updating');
                fs.unlinkSync(thumbnailPath);
            } else {
                const thumbnailUrl = `/thumbnails/${encodeURIComponent(safeName + '.jpg')}`;
                return thumbnailUrl; // Return existing thumbnail
            }
        }
        
        // Try to generate thumbnail from first quality segment
        const hlsInfo = await getHLSInfo(masterPlaylistPath);
        
        if (hlsInfo.qualities.length > 0) {
            const firstQualityPath = path.join(path.dirname(masterPlaylistPath), hlsInfo.qualities[0].playlist);
            
            // Get HLS duration to determine optimal thumbnail time
            let duration = null;
            try {
                duration = await getHLSDuration(masterPlaylistPath);
            } catch (error) {
                // Use default time if duration unavailable
            }
            
            const optimalTime = getOptimalThumbnailTime(duration);
            const seekTime = duration && duration > 0 ? Math.min(optimalTime, duration - 1) : optimalTime;
            const success = await generateThumbnailAsync(firstQualityPath, thumbnailPath);
            
            if (success && fs.existsSync(thumbnailPath)) {
                const thumbnailUrl = `/thumbnails/${encodeURIComponent(safeName + '.jpg')}`;
                // HLS thumbnail generated successfully
                return thumbnailUrl;
            } else {
                // HLS thumbnail generation failed
                return null;
            }
        } else {
            // No HLS qualities found for thumbnail generation
            return null;
        }
    } catch (error) {
        console.error('❌ Error generating HLS thumbnail:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            path: masterPlaylistPath
        });
        return null;
    }
}

// Get thumbnail URL (only returns existing thumbnails)
function getThumbnailUrl(videoPath) {
    try {
        const ext = path.extname(videoPath).toLowerCase();
        if (!isVideoOrHLSFile(ext)) {
            console.log(`  Not a video or HLS file: ${ext}`);
            return null;
        }

        // Skip HLS files in videos directory - they should only be in hls directory
        const isHLS = isHLSFile(ext);
        if (isHLS && videoPath.includes(VIDEOS_ROOT)) {
            if (!warnedFiles.has(videoPath)) {
                console.log(`⚠️ Skipping HLS file in videos directory: ${videoPath} - HLS files should be in hls directory`);
                warnedFiles.add(videoPath);
            }
            return null;
        }

        // For HLS files, use hls folder as base, otherwise use videos folder
        const basePath = isHLS ? path.join(path.dirname(VIDEOS_ROOT), 'hls') : VIDEOS_ROOT;
        const relativePath = path.relative(basePath, videoPath);
        const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
        const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
        
        // Check if thumbnail exists
        
        if (fs.existsSync(thumbnailPath)) {
            const thumbnailUrl = `/thumbnails/${encodeURIComponent(safeName + '.jpg')}`;
            return thumbnailUrl;
        }
        
        console.log('❌ Thumbnail not found for:', videoPath);
        return null;
    } catch (error) {
        console.error('❌ Error getting thumbnail URL:', error);
        return null;
    }
}

// Get optimal thumbnail time based on video duration
function getOptimalThumbnailTime(duration) {
    if (!duration || duration <= 0) {
        return 15; // Default to 15 seconds if duration is unknown
    }
    
    if (duration >= 300) { // 5 minutes or longer
        return 30;
    } else if (duration >= 120) { // 2 minutes or longer
        return 20;
    } else if (duration >= 60) { // 1-2 minutes
        return 15;
    } else if (duration >= 30) { // 30 seconds to 1 minute
        return 15;
    } else if (duration >= 15) { // 15-30 seconds
        return 15;
    } else {
        return Math.max(1, Math.floor(duration / 2)); // For very short videos, use middle
    }
}

// Generate thumbnail asynchronously
async function generateThumbnailAsync(videoPath, thumbnailPath) {
    try {
        console.log('🔄 Generating thumbnail for:', videoPath);
        
        // Force delete existing thumbnail to ensure regeneration
        if (fs.existsSync(thumbnailPath)) {
            const stats = fs.statSync(thumbnailPath);
            const fileAge = Date.now() - stats.mtime.getTime();
            const isOldThumbnail = fileAge > 24 * 60 * 60 * 1000; // Older than 24 hours
            const isSmallThumbnail = stats.size < 5000; // Smaller than 5KB
            
            if (isOldThumbnail || isSmallThumbnail) {
                console.log('🔄 Updating thumbnail');
                fs.unlinkSync(thumbnailPath);
            } else {
                return true; // Skip regeneration
            }
        }
        
        // Get video duration and determine optimal thumbnail time
        let duration = null;
        try {
            duration = await getVideoDuration(videoPath);
        } catch (error) {
            // Use default time if duration unavailable
        }
        
        const optimalTime = getOptimalThumbnailTime(duration);
        let seekTime = duration && duration > 0 ? Math.min(optimalTime, duration - 1) : optimalTime;
        seekTime = Math.max(15, seekTime);
        
        const ffmpegPath = getFFmpegPath();
        
        // Try multiple time points if the first attempt fails
        const timePoints = [seekTime, 15, 20, 25, 30].filter(time => time >= 15 && time <= (duration || 60));
        if (timePoints.length === 0) {
            timePoints.push(15);
        }
        
        // Special handling for very short videos
        if (duration && duration < 15) {
            const middleTime = Math.max(1, Math.floor(duration / 2));
            timePoints.unshift(middleTime);
        }
        
        for (let i = 0; i < timePoints.length; i++) {
            const currentTime = timePoints[i];
            const timeString = currentTime.toString();
            
            const isHLS = videoPath.includes('.m3u8');
            const command = isHLS ? 
                `"${ffmpegPath}" -accurate_seek -ss ${timeString} -i "${videoPath}" -vframes 1 -q:v 2 -live_start_index -1 "${thumbnailPath}"` :
                `"${ffmpegPath}" -accurate_seek -ss ${timeString} -i "${videoPath}" -vframes 1 -q:v 2 "${thumbnailPath}"`;
            
            console.log(`🔄 FFmpeg attempt ${i + 1}/${timePoints.length} at ${currentTime}s`);
            
            const startTime = Date.now();
            try {
                await execAsync(command);
                const endTime = Date.now();
                const executionTime = endTime - startTime;
                
                // Check if thumbnail was created
                if (fs.existsSync(thumbnailPath)) {
                    const stats = fs.statSync(thumbnailPath);
                    console.log('✅ Thumbnail generated successfully!');
                    
                    // Check if thumbnail is not just a black frame
                    if (stats.size < 1000) {
                        console.log('⚠️ Thumbnail too small, trying next time point...');
                        continue;
                    }
                    
                    return true;
                } else {
                    console.log(`❌ Thumbnail not created, trying next time point...`);
                }
            } catch (error) {
                console.log(`❌ FFmpeg failed, trying next time point...`);
            }
            
            // If we've tried all time points, give up
            if (i === timePoints.length - 1) {
                console.log('❌ All thumbnail generation attempts failed');
                return false;
            }
        }
        
        console.log('❌ All thumbnail generation attempts failed');
        return false;
    } catch (error) {
        console.error(`❌ Error generating thumbnail for ${videoPath}:`, error.message);
        return false;
    }
}


// Function to scan all directories and find videos without thumbnails
async function findVideosWithoutThumbnails(dirPath, videoList = [], maxVideos = 10000) {
    if (!dirPath) {
        console.log('Warning: findVideosWithoutThumbnails called with undefined dirPath');
        return videoList;
    }
    
    try {
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            if (videoList.length >= maxVideos) break;
            
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Skip hidden directories and system directories
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await findVideosWithoutThumbnails(fullPath, videoList, maxVideos);
                }
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (isVideoOrHLSFile(ext)) {
                    // For HLS files, only process master.m3u8 files, not quality playlist files
                    const isHLS = isHLSFile(ext);
                    if (isHLS && entry.name !== 'master.m3u8') {
                        continue; // Skip quality playlist files
                    }
                    
                    // Skip HLS files in videos directory - they should only be in hls directory
                    if (isHLS && fullPath.includes(VIDEOS_ROOT)) {
                        if (!warnedFiles.has(fullPath)) {
                            console.log(`⚠️ Skipping HLS file in videos directory: ${entry.name} - HLS files should be in hls directory`);
                            warnedFiles.add(fullPath);
                        }
                        continue;
                    }
                    
                    // For HLS files, use hls folder as base, otherwise use videos folder
                    const basePath = isHLS ? path.join(path.dirname(VIDEOS_ROOT), 'hls') : VIDEOS_ROOT;
                    const relativePath = path.relative(basePath, fullPath);
                    const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
                    const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
                    
                    // Check if HLS thumbnail exists
                    
                    if (!fs.existsSync(thumbnailPath)) {
                        videoList.push({
                            path: fullPath,
                            relativePath: relativePath,
                            name: entry.name,
                            extension: ext,
                            isHLS: isHLSFile(ext)
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.log(`Skipping directory ${dirPath || 'unknown'}: ${error.message}`);
    }
    
    return videoList;
}

// Function to generate all missing thumbnails on startup
async function generateAllMissingThumbnails() {
    console.log('🔍 Scanning for videos without thumbnails...');
    
    try {
        // Always start with HLS directory first
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        let hlsVideosWithoutThumbnails = [];
        if (fs.existsSync(hlsRootPath)) {
            hlsVideosWithoutThumbnails = await findVideosWithoutThumbnails(hlsRootPath);
        }
        
        // Then scan videos directory
        const videosWithoutThumbnails = await findVideosWithoutThumbnails(VIDEOS_ROOT);
        
        // Combine with HLS first, then regular videos
        const allVideosWithoutThumbnails = [...hlsVideosWithoutThumbnails, ...videosWithoutThumbnails];
        
        if (allVideosWithoutThumbnails.length === 0) {
            console.log('✅ All videos already have thumbnails');
            return;
        }
        
        console.log(`📸 Found ${allVideosWithoutThumbnails.length} videos without thumbnails (${hlsVideosWithoutThumbnails.length} HLS, ${videosWithoutThumbnails.length} regular)`);
        console.log('🔄 Generating thumbnails in background (HLS FIRST)...');
        const startTime = new Date().toISOString();
        console.log('🔄 Background generation started at:', startTime);
        
        // Log HLS files that need thumbnails (PRIORITY)
        if (hlsVideosWithoutThumbnails.length > 0) {
            console.log('📸 HLS files needing thumbnails (PRIORITY):');
            hlsVideosWithoutThumbnails.forEach((video, index) => {
                console.log(`  ${index + 1}. ${video.name} (${video.path})`);
            });
        }
        
        // Log regular videos that need thumbnails (SECONDARY)
        if (videosWithoutThumbnails.length > 0) {
            console.log('📸 Regular videos needing thumbnails (SECONDARY):');
            videosWithoutThumbnails.forEach((video, index) => {
                console.log(`  ${index + 1}. ${video.name} (${video.path})`);
            });
        }
        
        let generated = 0;
        let failed = 0;
        
        for (const video of allVideosWithoutThumbnails) {
            try {
                let relativePath, safeName;
                
                if (video.isHLS && video.extension === '.m3u8') {
                    // For HLS files, calculate relative path from hls folder
                    const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                    relativePath = path.relative(hlsRootPath, video.path);
                } else {
                    // For regular video files, calculate relative path from videos folder
                    relativePath = path.relative(VIDEOS_ROOT, video.path);
                }
                
                const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
                safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
                const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
                
                // For HLS files, use the same logic as generateHLSThumbnail
                if (video.isHLS && video.extension === '.m3u8') {
                    console.log(`🔄 Processing HLS file (PRIORITY): ${video.name}`);
                    const result = await generateHLSThumbnail(video.path);
                    if (result && typeof result === 'string') {
                        generated++;
                        console.log(`✅ Generated HLS thumbnail for: ${video.name}`);
                    } else {
                        failed++;
                        console.log(`❌ Failed to generate HLS thumbnail for: ${video.name}`);
                    }
                } else {
                    // Regular video file
                    console.log(`🔄 Processing regular video (SECONDARY): ${video.name}`);
                    const success = await generateThumbnailAsync(video.path, thumbnailPath);
                    if (success) {
                        generated++;
                        console.log(`✅ Generated thumbnail for: ${video.name}`);
                    } else {
                        failed++;
                        console.log(`❌ Failed to generate thumbnail for: ${video.name}`);
                    }
                }
                
                // Log progress every 10 videos
                if ((generated + failed) % 10 === 0) {
                    console.log(`📸 Progress: ${generated + failed}/${allVideosWithoutThumbnails.length} processed`);
                }
                
            } catch (error) {
                console.error(`Error generating thumbnail for ${video.name}:`, error.message);
                failed++;
            }
        }
        
        const endTime = new Date().toISOString();
        const totalTime = Date.now() - new Date(startTime).getTime();
        
        console.log(`✅ Thumbnail generation complete: ${generated} generated, ${failed} failed`);
        console.log('📊 Generation summary:');
        console.log('  ⏱️ Start time:', startTime);
        console.log('  ⏱️ End time:', endTime);
        console.log('  ⏱️ Total time:', totalTime, 'ms');
        console.log('  📸 Generated:', generated);
        console.log('  ❌ Failed:', failed);
        console.log('  📊 Success rate:', `${Math.round((generated / (generated + failed)) * 100)}%`);
        
    } catch (error) {
        console.error('❌ Error during thumbnail generation:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
    }
}

// Function to find all videos (regardless of thumbnail status)
async function findAllVideos(dirPath, videoList = [], maxVideos = 50000) {
    if (!dirPath) {
        console.log('Warning: findAllVideos called with undefined dirPath');
        return videoList;
    }
    
    try {
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            if (videoList.length >= maxVideos) break;
            
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Skip hidden directories and system directories
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await findAllVideos(fullPath, videoList, maxVideos);
                }
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (isVideoOrHLSFile(ext)) {
                    // Skip HLS files in videos directory - they should only be in hls directory
                    if (isHLSFile(ext) && fullPath.includes(VIDEOS_ROOT)) {
                        if (!warnedFiles.has(fullPath)) {
                            console.log(`⚠️ Skipping HLS file in videos directory: ${entry.name} - HLS files should be in hls directory`);
                            warnedFiles.add(fullPath);
                        }
                        continue;
                    }
                    
                    // Determine the correct base path for relative path calculation
                    const isHLS = isHLSFile(ext);
                    const basePath = isHLS ? path.join(path.dirname(VIDEOS_ROOT), 'hls') : VIDEOS_ROOT;
                    const relativePath = path.relative(basePath, fullPath);
                    
                    videoList.push({
                        path: fullPath,
                        relativePath: relativePath,
                        name: entry.name,
                        extension: ext,
                        isHLS: isHLS
                    });
                }
            }
        }
    } catch (error) {
        console.log(`Skipping directory ${dirPath || 'unknown'}: ${error.message}`);
    }
    
    return videoList;
}

// Function to scan all videos and build duration cache
async function buildDurationCache() {
    console.log('🚀 Building video duration cache...');
    
    try {
        const allVideos = [];
        await findAllVideos(VIDEOS_ROOT, allVideos, 50000);
        
        // Also scan HLS directory for HLS videos
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        if (fs.existsSync(hlsRootPath)) {
            console.log('📁 Scanning HLS directory for videos...');
            await findAllVideos(hlsRootPath, allVideos, 50000);
        }
        
        console.log(`📊 Found ${allVideos.length} videos to process`);
        
        let processed = 0;
        let cached = 0;
        
        for (const video of allVideos) {
            try {
                // For HLS files, use hls folder as base, otherwise use videos folder
                const isHLS = video.isHLS && video.extension === '.m3u8';
                const basePath = isHLS ? path.join(path.dirname(VIDEOS_ROOT), 'hls') : VIDEOS_ROOT;
                const relativePath = path.relative(basePath, video.path);
                
                // Check if already in cache
                if (durationCache[relativePath]) {
                    cached++;
                    continue;
                }
                
                // Get duration
                let duration = null;
                if (video.isHLS && video.extension === '.m3u8') {
                    duration = await getHLSDuration(video.path);
                } else {
                    duration = await getVideoDuration(video.path);
                }
                
                if (duration && duration > 0) {
                    durationCache[relativePath] = duration;
                    processed++;
                }
                
                // Log progress every 50 videos
                if ((processed + cached) % 50 === 0) {
                    console.log(`📊 Duration cache progress: ${processed + cached}/${allVideos.length} processed`);
                }
                
            } catch (error) {
                console.error(`Error processing ${video.name}:`, error.message);
            }
        }
        
        // Save the updated cache
        await saveDurationCache();
        
        console.log(`✅ Duration cache complete: ${processed} new entries, ${cached} already cached`);
        
    } catch (error) {
        console.error('Error building duration cache:', error);
    }
}

module.exports = {
    loadDurationCache,
    saveDurationCache,
    getVideoDuration,
    getHLSDuration,
    getHLSInfo,
    getHLSThumbnail,
    generateHLSThumbnail,
    getThumbnailUrl,
    generateThumbnailAsync,
    findVideosWithoutThumbnails,
    generateAllMissingThumbnails,
    buildDurationCache,
    durationCache,
    getDirectoryContents,
    invalidateDirectoryCache,
    clearDirectoryCache,
    directoryCache
};
