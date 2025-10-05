const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { execAsync, getFFmpegPath, getFFprobePath } = require('./ffmpeg');
const { isVideoFile, isHLSFile, isVideoOrHLSFile, getVideoMimeType, VIDEOS_ROOT } = require('./fileUtils');
const { DURATIONS_CACHE_FILE } = require('./config');

// Duration cache
let durationCache = {};

// Load duration cache from file
async function loadDurationCache() {
    try {
        const data = await fsPromises.readFile(DURATIONS_CACHE_FILE, 'utf8');
        durationCache = JSON.parse(data);
        console.log(`📊 Loaded duration cache with ${Object.keys(durationCache).length} entries`);
    } catch (error) {
        console.log('📊 No duration cache found, starting fresh');
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
                console.log('Could not read quality playlist for duration');
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
        console.log('🔍 Getting HLS thumbnail for:', masterPlaylistPath);
        
        // Check if thumbnail already exists
        // For HLS files, calculate relative path from hls folder instead of videos folder
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        const relativePath = path.relative(hlsRootPath, masterPlaylistPath);
        const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
        const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
        
        console.log('🔍 HLS thumbnail path:', thumbnailPath);
        console.log('🔍 HLS thumbnail exists:', fs.existsSync(thumbnailPath));
        
        if (fs.existsSync(thumbnailPath)) {
            const thumbnailUrl = `/thumbnails/${encodeURIComponent(safeName + '.jpg')}`;
            console.log('✅ HLS thumbnail found:', thumbnailUrl);
            return thumbnailUrl;
        }
        
        console.log('❌ HLS thumbnail not found for:', masterPlaylistPath);
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
        
        // For HLS files, calculate relative path from hls folder instead of videos folder
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        const relativePath = path.relative(hlsRootPath, masterPlaylistPath);
        const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
        const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
        
        // Try to generate thumbnail from first quality segment
        const hlsInfo = await getHLSInfo(masterPlaylistPath);
        if (hlsInfo.qualities.length > 0) {
            const firstQualityPath = path.join(path.dirname(masterPlaylistPath), hlsInfo.qualities[0].playlist);
            
            console.log('🔄 Generating from first quality:', firstQualityPath);
            
            // Get HLS duration to determine optimal thumbnail time
            let duration = null;
            try {
                duration = await getHLSDuration(masterPlaylistPath);
                console.log('🔄 HLS duration:', duration, 'seconds');
            } catch (error) {
                console.log('⚠️ Could not get HLS duration, using default time');
            }
            
            const optimalTime = getOptimalThumbnailTime(duration);
            console.log('🔄 Using HLS thumbnail time:', optimalTime, 'seconds');
            
            // Generate thumbnail from first segment
            const ffmpegPath = getFFmpegPath();
            const timeString = `${Math.floor(optimalTime / 60)}:${(optimalTime % 60).toString().padStart(2, '0')}:01`;
            const command = `"${ffmpegPath}" -i "${firstQualityPath}" -ss ${timeString} -vframes 1 -q:v 2 "${thumbnailPath}"`;
            
            console.log('🔄 FFmpeg command:', command);
            await execAsync(command);
            
            if (fs.existsSync(thumbnailPath)) {
                const thumbnailUrl = `/thumbnails/${encodeURIComponent(safeName + '.jpg')}`;
                console.log('✅ HLS thumbnail generated:', thumbnailUrl);
                return thumbnailUrl;
            } else {
                console.log('❌ HLS thumbnail generation failed - file not created');
                return null;
            }
        } else {
            console.log('❌ No HLS qualities found for thumbnail generation');
            return null;
        }
    } catch (error) {
        console.error('❌ Error generating HLS thumbnail:', error);
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

        const relativePath = path.relative(VIDEOS_ROOT, videoPath);
        const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
        const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
        
        console.log('🔍 Checking thumbnail for:', videoPath);
        console.log('🔍 Safe name:', safeName);
        console.log('🔍 Thumbnail path:', thumbnailPath);
        console.log('🔍 Thumbnail exists:', fs.existsSync(thumbnailPath));
        
        if (fs.existsSync(thumbnailPath)) {
            const thumbnailUrl = `/thumbnails/${encodeURIComponent(safeName + '.jpg')}`;
            console.log('✅ Thumbnail URL:', thumbnailUrl);
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
        return 10; // Default to 10 seconds if duration is unknown
    }
    
    if (duration >= 300) { // 5 minutes or longer
        return 30;
    } else if (duration >= 120) { // 2 minutes or longer
        return 20;
    } else {
        return 10; // Less than 2 minutes
    }
}

// Generate thumbnail asynchronously
async function generateThumbnailAsync(videoPath, thumbnailPath) {
    try {
        console.log('🔄 Generating thumbnail for:', videoPath);
        console.log('🔄 Thumbnail will be saved to:', thumbnailPath);
        
        // Get video duration first to determine optimal thumbnail time
        let duration = null;
        try {
            duration = await getVideoDuration(videoPath);
            console.log('🔄 Video duration:', duration, 'seconds');
        } catch (error) {
            console.log('⚠️ Could not get video duration, using default time');
        }
        
        const optimalTime = getOptimalThumbnailTime(duration);
        console.log('🔄 Using thumbnail time:', optimalTime, 'seconds');
        
        const ffmpegPath = getFFmpegPath();
        const timeString = `${Math.floor(optimalTime / 60)}:${(optimalTime % 60).toString().padStart(2, '0')}:01`;
        const command = `"${ffmpegPath}" -i "${videoPath}" -ss ${timeString} -vframes 1 -q:v 2 "${thumbnailPath}"`;
        
        console.log('🔄 FFmpeg command:', command);
        await execAsync(command);
        
        // Verify the thumbnail was created
        if (fs.existsSync(thumbnailPath)) {
            console.log('✅ Thumbnail generated successfully:', thumbnailPath);
            return true;
        } else {
            console.log('❌ Thumbnail file was not created:', thumbnailPath);
            return false;
        }
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
                    const relativePath = path.relative(VIDEOS_ROOT, fullPath);
                    const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
                    const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');
                    
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
        // Scan both videos directory and HLS directory
        const videosWithoutThumbnails = await findVideosWithoutThumbnails(VIDEOS_ROOT);
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        
        let hlsVideosWithoutThumbnails = [];
        if (fs.existsSync(hlsRootPath)) {
            console.log('🔍 Scanning HLS directory for missing thumbnails...');
            hlsVideosWithoutThumbnails = await findVideosWithoutThumbnails(hlsRootPath);
        }
        
        const allVideosWithoutThumbnails = [...videosWithoutThumbnails, ...hlsVideosWithoutThumbnails];
        
        if (allVideosWithoutThumbnails.length === 0) {
            console.log('✅ All videos already have thumbnails');
            return;
        }
        
        console.log(`📸 Found ${allVideosWithoutThumbnails.length} videos without thumbnails (${videosWithoutThumbnails.length} regular, ${hlsVideosWithoutThumbnails.length} HLS)`);
        console.log('🔄 Generating thumbnails in background...');
        
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
                
                // For HLS files, try to generate from first quality
                if (video.isHLS && video.extension === '.m3u8') {
                    const hlsInfo = await getHLSInfo(video.path);
                    if (hlsInfo.qualities.length > 0) {
                        const firstQualityPath = path.join(path.dirname(video.path), hlsInfo.qualities[0].playlist);
                        const success = await generateThumbnailAsync(firstQualityPath, thumbnailPath);
                        if (success) {
                            generated++;
                        } else {
                            failed++;
                        }
                    } else {
                        failed++;
                    }
                } else {
                    // Regular video file
                    const success = await generateThumbnailAsync(video.path, thumbnailPath);
                    if (success) {
                        generated++;
                    } else {
                        failed++;
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
        
        console.log(`✅ Thumbnail generation complete: ${generated} generated, ${failed} failed`);
        
    } catch (error) {
        console.error('Error during thumbnail generation:', error);
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
                    const relativePath = path.relative(VIDEOS_ROOT, fullPath);
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
    durationCache
};
