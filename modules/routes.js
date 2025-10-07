const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { resolveSafePath, isVideoFile, isHLSFile, isVideoOrHLSFile, getVideoMimeType } = require('./fileUtils');
const { VIDEOS_ROOT } = require('./config');
const { 
    getVideoDuration, 
    getHLSDuration, 
    getHLSInfo, 
    getHLSThumbnail, 
    generateHLSThumbnail,
    getThumbnailUrl,
    generateThumbnailAsync,
    findVideosWithoutThumbnails,
    durationCache
} = require('./videoProcessing');

const router = express.Router();

// API endpoint to get directory contents
router.get('/api/browse', async (req, res) => {
    const relativePath = req.query.path || '';
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder || 'asc';
    const filterType = req.query.filterType || 'all';

    // Validate path parameter
    if (relativePath === 'undefined' || relativePath === 'null') {
        console.warn('Invalid path parameter received:', relativePath);
        return res.status(400).json({ error: 'Invalid path parameter' });
    }

    try {
        const fullPath = resolveSafePath(relativePath);
        const items = [];

        // Check if the path exists and is accessible
        try {
            await fsPromises.access(fullPath);
        } catch (error) {
            console.warn(`Path not accessible: ${fullPath}`, error.message);
            console.warn(`Requested path: ${relativePath}`);
            console.warn(`Resolved path: ${fullPath}`);
            return res.status(404).json({ error: 'Directory not found or not accessible' });
        }

        let entries = await fsPromises.readdir(fullPath, { withFileTypes: true });
        
        // If videos directory is empty and we're at root, also scan HLS directory
        if (relativePath === '' && entries.length === 0) {
            const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
            try {
                const hlsEntries = await fsPromises.readdir(hlsRootPath, { withFileTypes: true });
                // Add HLS entries with a special prefix to distinguish them
                for (const hlsEntry of hlsEntries) {
                    const hlsItem = {
                        ...hlsEntry,
                        name: hlsEntry.name + ' (HLS)',
                        isHLSDirectory: true,
                        originalName: hlsEntry.name
                    };
                    entries.push(hlsItem);
                }
            } catch (hlsError) {
                console.log('HLS directory not found or not accessible:', hlsError.message);
            }
        }
        
        // If we're browsing an HLS directory, scan it directly
        if (relativePath.startsWith('hls/')) {
            const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
            const hlsRelativePath = relativePath.substring(4); // Remove 'hls/' prefix
            const hlsFullPath = path.join(hlsRootPath, hlsRelativePath);
            
            try {
                const hlsEntries = await fsPromises.readdir(hlsFullPath, { withFileTypes: true });
                entries = hlsEntries;
            } catch (hlsError) {
                console.log('HLS subdirectory not found or not accessible:', hlsError.message);
                return res.status(404).json({ error: 'HLS directory not found or not accessible' });
            }
        }

        for (const entry of entries) {
            let itemPath, ext, isHLS, basePath, relativeItemPath;
            
            // Handle HLS directories specially
            if (entry.isHLSDirectory) {
                const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                itemPath = path.join(hlsRootPath, entry.originalName);
                ext = '';
                isHLS = false;
                basePath = hlsRootPath;
                relativeItemPath = entry.originalName;
            } else if (relativePath.startsWith('hls/')) {
                // We're browsing inside an HLS directory
                const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                const hlsRelativePath = relativePath.substring(4); // Remove 'hls/' prefix
                itemPath = path.join(hlsRootPath, hlsRelativePath, entry.name);
                ext = path.extname(entry.name).toLowerCase();
                isHLS = isHLSFile(ext);
                basePath = hlsRootPath;
                relativeItemPath = path.join(hlsRelativePath, entry.name);
            } else {
                itemPath = path.join(fullPath, entry.name);
                ext = path.extname(entry.name).toLowerCase();
                isHLS = isHLSFile(ext);
                basePath = isHLS ? path.join(path.dirname(VIDEOS_ROOT), 'hls') : VIDEOS_ROOT;
                relativeItemPath = path.relative(basePath, itemPath);
            }
            
            let stats;
            let size = 0;
            let modified = new Date();
            
            try {
                stats = await fsPromises.stat(itemPath);
                size = stats.size || 0;
                modified = stats.mtime || new Date();
            } catch (error) {
                console.warn(`Warning: Could not get stats for ${itemPath}:`, error.message);
                // Use fallback values for corrupted files
                size = 0;
                modified = new Date();
            }
            
            let fileCount = null;
            if (entry.isDirectory()) {
                try {
                    const dirEntries = await fsPromises.readdir(itemPath);
                    // Count regular files first
                    let regularFileCount = dirEntries.length;
                    
                    // Count HLS versions for video files in this directory
                    let hlsCount = 0;
                    for (const dirEntry of dirEntries) {
                        if (dirEntry.isFile()) {
                            const dirEntryExt = path.extname(dirEntry.name).toLowerCase();
                            if (isVideoFile(dirEntryExt)) {
                                // Check if HLS version exists
                                const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                                const hlsPath = path.join(hlsRootPath, path.relative(VIDEOS_ROOT, path.join(itemPath, dirEntry.name)).replace(dirEntryExt, ''));
                                const masterPlaylistPath = path.join(hlsPath, 'master.m3u8');
                                
                                try {
                                    const hlsStats = await fsPromises.stat(masterPlaylistPath);
                                    if (hlsStats.isFile()) {
                                        hlsCount++;
                                    }
                                } catch (error) {
                                    // HLS version doesn't exist
                                }
                            }
                        }
                    }
                    
                    fileCount = regularFileCount + hlsCount;
                } catch (error) {
                    // Directory might not be accessible
                }
            }

            const item = {
                name: entry.name,
                path: entry.isHLSDirectory ? 'hls/' + relativeItemPath : 
                      relativePath.startsWith('hls/') ? 'hls/' + relativeItemPath : relativeItemPath,
                size: size,
                modified: modified,
                extension: ext,
                isDirectory: entry.isDirectory(),
                isVideo: isVideoOrHLSFile(ext),
                isHLS: isHLSFile(ext),
                isHLSDirectory: entry.isHLSDirectory || false,
                mimeType: isVideoOrHLSFile(ext) ? getVideoMimeType(ext) : null,
                fileCount: fileCount
            };

            // Add thumbnail URL and duration for video files
            if (isVideoOrHLSFile(ext)) {
                try {
                    // Skip HLS files in videos directory - they should only be in hls directory
                    if (isHLSFile(ext) && ext === '.m3u8') {
                        // Note: We can't use the warnedFiles cache here since it's in a different module
                        console.log(`⚠️ Skipping HLS file in videos directory: ${itemPath} - HLS files should be in hls directory`);
                        continue; // Skip this item entirely
                    } else if (isVideoFile(ext)) {
                        // For regular video files, get thumbnail and duration
                        item.thumbnailUrl = getThumbnailUrl(itemPath);
                        item.duration = await getVideoDuration(itemPath);
                    }
                    
                    // Check if thumbnail exists
                    if (!item.thumbnailUrl) {
                        // No thumbnail available
                    }
                } catch (error) {
                    console.warn(`Warning: Could not get thumbnail for ${itemPath}:`, error.message);
                    item.thumbnailUrl = null;
                }
            }

            // Check for HLS version if this is a video file
            if (entry.isFile() && isVideoFile(ext)) {
                // Look for HLS files in the separate hls folder at root level
                const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                const hlsPath = path.join(hlsRootPath, relativeItemPath.replace(ext, ''));
                const masterPlaylistPath = path.join(hlsPath, 'master.m3u8');
                
                try {
                    const hlsStats = await fsPromises.stat(masterPlaylistPath);
                    if (hlsStats.isFile()) {
                        // Add HLS version as a separate item
                        // Use the same relative path structure as the original video for consistency
                        const hlsRelativePath = relativeItemPath.replace(ext, '') + '/master.m3u8';
                        const hlsItem = {
                            name: entry.name.replace(ext, '') + ' (HLS)',
                            path: hlsRelativePath,
                            size: hlsStats.size,
                            modified: hlsStats.mtime,
                            extension: '.m3u8',
                            isVideo: true,
                            isHLS: true,
                            mimeType: 'application/vnd.apple.mpegurl',
                            fileCount: null,
                            originalVideo: relativeItemPath // Reference to original video
                        };
                        
                        // Add thumbnail URL and duration for HLS item
                        try {
                            hlsItem.thumbnailUrl = await getHLSThumbnail(masterPlaylistPath);
                            hlsItem.duration = await getHLSDuration(masterPlaylistPath);
                        } catch (error) {
                            console.warn(`Warning: Could not get HLS info for ${masterPlaylistPath}:`, error.message);
                            hlsItem.thumbnailUrl = null;
                            hlsItem.duration = null;
                        }
                        
                        items.push(hlsItem);
                    }
                } catch (error) {
                    // HLS version doesn't exist, continue with original file
                }
            }

            // Apply search filter
            if (search && !item.name.toLowerCase().includes(search.toLowerCase())) {
                continue;
            }

            // Apply type filter
            if (filterType === 'videos' && !item.isVideo) {
                continue;
            } else if (filterType === 'directories' && !entry.isDirectory()) {
                continue;
            }

            items.push(item);
        }

        // Sort items
        items.sort((a, b) => {
            let comparison = 0;
            
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'size') {
                comparison = a.size - b.size;
            } else if (sortBy === 'modified') {
                comparison = new Date(a.modified) - new Date(b.modified);
            }
            
            return sortOrder === 'desc' ? -comparison : comparison;
        });

        res.json({ 
            items,
            currentPath: relativePath,
            parentPath: relativePath ? path.dirname(relativePath) : null
        });
    } catch (error) {
        console.error('Browse error:', error);
        console.error('Request details:', {
            relativePath: req.query.path,
            search: req.query.search,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder,
            filterType: req.query.filterType
        });
        
        if (error.message.includes('Access denied')) {
            res.status(403).json({ error: error.message });
        } else if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Directory not found' });
        } else {
            res.status(500).json({ error: 'Failed to browse directory' });
        }
    }
});

// API endpoint to get video info
router.get('/api/video-info', async (req, res) => {
    const relativePath = req.query.path;

    if (!relativePath) {
        return res.status(400).json({ error: 'Path parameter is required' });
    }

    try {
        let videoPath;
        const ext = path.extname(relativePath).toLowerCase();
        
        // Check if this is an HLS file and resolve to hls folder
        if (isHLSFile(ext)) {
            // For HLS files, resolve to the hls folder at root level
            const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
            const normalizedPath = path.normalize(relativePath);
            
            // Remove leading slash if present
            const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath;
            
            // Check for directory traversal attempts
            if (cleanPath.includes('..')) {
                throw new Error('Access denied: Invalid path');
            }
            
            videoPath = path.resolve(hlsRootPath, cleanPath);
            
            // Ensure the resolved path is inside hls folder
            if (!videoPath.startsWith(hlsRootPath)) {
                throw new Error('Access denied: Path outside hls directory');
            }
        } else {
            // For regular video files, use the standard path resolution
            videoPath = resolveSafePath(relativePath);
        }
        
        let stats;
        try {
            stats = await fsPromises.stat(videoPath);
        } catch (error) {
            console.warn(`Warning: Could not get stats for ${videoPath}:`, error.message);
            return res.status(404).json({ error: 'File not found or inaccessible' });
        }
        
        // Get video info for the requested path

        if (!isVideoOrHLSFile(ext)) {
            return res.status(400).json({ error: 'File is not a supported video or HLS format' });
        }

        // For HLS files, use the directory name as the video name instead of master.m3u8
        let videoName;
        if (isHLSFile(ext) && ext === '.m3u8') {
            // For HLS master playlists, use the parent directory name
            const parentDir = path.basename(path.dirname(videoPath));
            videoName = parentDir;
        } else {
            // For regular video files, use the filename
            videoName = path.basename(videoPath);
        }

        const result = {
            name: videoName,
            extension: ext,
            mimeType: getVideoMimeType(ext),
            isVideo: isVideoOrHLSFile(ext),
            isHLS: isHLSFile(ext)
        };

        // For HLS files, check if it's a master playlist and get available qualities
        if (isHLSFile(ext) && ext === '.m3u8') {
            try {
                result.hlsInfo = await getHLSInfo(videoPath);
            } catch (error) {
                console.warn(`Warning: Could not get HLS info for ${videoPath}:`, error.message);
                result.hlsInfo = {
                    isMasterPlaylist: false,
                    qualities: [],
                    totalQualities: 0
                };
            }
        }

        // For regular video files, get duration and thumbnail
        if (isVideoFile(ext)) {
            try {
                result.duration = await getVideoDuration(videoPath);
                result.thumbnailUrl = getThumbnailUrl(videoPath);
            } catch (error) {
                console.warn(`Warning: Could not get video info for ${videoPath}:`, error.message);
                result.duration = null;
                result.thumbnailUrl = null;
            }
        } else if (isHLSFile(ext) && ext === '.m3u8') {
            // For HLS master playlists, try to get duration from first quality
            try {
                result.duration = await getHLSDuration(videoPath);
                result.thumbnailUrl = await getHLSThumbnail(videoPath);
            } catch (error) {
                console.warn(`Warning: Could not get HLS info for ${videoPath}:`, error.message);
                result.duration = null;
                result.thumbnailUrl = null;
            }
        }

        res.json(result);
    } catch (error) {
        // Only log errors that aren't "file not found" to reduce spam
        if (error.code !== 'ENOENT') {
            console.error('Video info error:', error);
        }
        if (error.message.includes('Access denied')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to get video info' });
        }
    }
});

// API endpoint to check server status
router.get('/api/server-status', (req, res) => {
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        generatingThumbnails: false
    });
});

// API endpoint to search files recursively
router.get('/api/search', async (req, res) => {
    const searchTerm = req.query.q;
    const type = req.query.type || 'all';

    if (!searchTerm) {
        return res.status(400).json({ error: 'Search term is required' });
    }

    try {
        const results = [];
        await searchDirectory(VIDEOS_ROOT, searchTerm, type, results);
        
        // Also search HLS directory for HLS files
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        if (fs.existsSync(hlsRootPath)) {
            await searchDirectory(hlsRootPath, searchTerm, type, results);
        }
        
        // Apply type filter to search results
        let filteredResults = results;
        if (type === 'videos') {
            filteredResults = results.filter(item => item.isVideo);
        } else if (type === 'directories') {
            filteredResults = results.filter(item => item.isDirectory);
        }
        
        res.json({
            results: filteredResults,
            totalResults: filteredResults.length,
            searchTerm: searchTerm
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Recursive search function
async function searchDirectory(dirPath, searchTerm, type, results) {
    try {
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            // Determine if this is the HLS directory or videos directory
            const isHLSDirectory = dirPath.includes(path.join(path.dirname(VIDEOS_ROOT), 'hls'));
            const relativePath = isHLSDirectory ? 
                path.relative(path.join(path.dirname(VIDEOS_ROOT), 'hls'), fullPath) :
                path.relative(VIDEOS_ROOT, fullPath);
            
            if (entry.isDirectory()) {
                // Skip hidden directories and system directories
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    // Check if directory name matches search term
                    const matchesSearch = entry.name.toLowerCase().includes(searchTerm.toLowerCase());
                    
                    if (matchesSearch) {
                        try {
                            const stats = await fsPromises.stat(fullPath);
                            const dirEntries = await fsPromises.readdir(fullPath);
                            
                            // Count HLS versions for video files in this directory
                            let hlsCount = 0;
                            for (const dirEntry of dirEntries) {
                                if (dirEntry.isFile()) {
                                    const dirEntryExt = path.extname(dirEntry.name).toLowerCase();
                                    if (isVideoFile(dirEntryExt)) {
                                        // Check if HLS version exists
                                        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                                        const hlsPath = path.join(hlsRootPath, path.relative(VIDEOS_ROOT, path.join(fullPath, dirEntry.name)).replace(dirEntryExt, ''));
                                        const masterPlaylistPath = path.join(hlsPath, 'master.m3u8');
                                        
                                        try {
                                            const hlsStats = await fsPromises.stat(masterPlaylistPath);
                                            if (hlsStats.isFile()) {
                                                hlsCount++;
                                            }
                                        } catch (error) {
                                            // HLS version doesn't exist
                                        }
                                    }
                                }
                            }
                            
                            const result = {
                                name: entry.name,
                                path: relativePath,
                                size: 0,
                                modified: stats.mtime,
                                extension: '',
                                isVideo: false,
                                isHLS: false,
                                isDirectory: true,
                                fileCount: dirEntries.length + hlsCount,
                                mimeType: null,
                                relativePath: relativePath
                            };
                            
                            results.push(result);
                        } catch (error) {
                            // Directory might not be accessible
                        }
                    }
                    
                    // Continue searching in subdirectories
                    await searchDirectory(fullPath, searchTerm, type, results);
                }
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                const stats = await fsPromises.stat(fullPath);

                const isVideo = isVideoOrHLSFile(ext);
                const matchesSearch = entry.name.toLowerCase().includes(searchTerm.toLowerCase());

                if (matchesSearch && isVideo) {
                    // Skip HLS files in videos directory - they should only be in hls directory
                    if (isHLSFile(ext) && !isHLSDirectory) {
                        continue;
                    }
                    
                    const result = {
                        name: entry.name,
                        path: relativePath,
                        size: stats.size,
                        modified: stats.mtime,
                        extension: ext,
                        isVideo: true,
                        isHLS: isHLSFile(ext),
                        mimeType: getVideoMimeType(ext),
                        relativePath: relativePath
                    };

                    // Add duration and thumbnail for video files
                    try {
                        if (isVideoFile(ext)) {
                            result.duration = await getVideoDuration(fullPath);
                            result.thumbnailUrl = getThumbnailUrl(fullPath);
                        } else if (isHLSFile(ext)) {
                            try {
                                result.duration = await getHLSDuration(fullPath);
                                result.thumbnailUrl = await getHLSThumbnail(fullPath);
                            } catch (hlsError) {
                                console.warn(`Warning: Could not get HLS info for ${fullPath}:`, hlsError.message);
                                result.duration = null;
                                result.thumbnailUrl = null;
                            }
                        }
                    } catch (error) {
                        console.warn(`Warning: Could not get duration/thumbnail for ${fullPath}:`, error.message);
                    }

                    results.push(result);
                }
            }
        }
    } catch (error) {
        // Skip directories we can't access
    }
}

// Playlist management routes
router.get('/api/playlists', async (req, res) => {
    try {
        const playlistsData = await fsPromises.readFile(path.join(__dirname, '..', 'playlists.json'), 'utf8');
        const playlistsJson = JSON.parse(playlistsData);
        const playlists = playlistsJson.playlists || [];
        
        // Add thumbnail URLs and duration to videos in playlists
        for (const playlist of playlists) {
            if (playlist.videos) {
                await Promise.all(playlist.videos.map(async item => {
                    if (item.path) {
                        const ext = path.extname(item.path).toLowerCase();
                        if (isVideoOrHLSFile(ext)) {
                            // Convert relative path to absolute path for thumbnail generation
                            const absolutePath = path.isAbsolute(item.path) ? item.path : path.join(VIDEOS_ROOT, item.path);
                            item.thumbnailUrl = getThumbnailUrl(absolutePath);
                            
                            // Add duration for video files
                            if (isVideoFile(ext)) {
                                try {
                                    item.duration = await getVideoDuration(absolutePath);
                                } catch (error) {
                                    console.warn(`Warning: Could not get duration for ${absolutePath}:`, error.message);
                                    item.duration = null;
                                }
                            } else if (isHLSFile(ext)) {
                                try {
                                    item.duration = await getHLSDuration(absolutePath);
                                } catch (error) {
                                    console.warn(`Warning: Could not get HLS duration for ${absolutePath}:`, error.message);
                                    item.duration = null;
                                }
                            }
                        } else if (item.isDirectory) {
                            // Handle directory items
                            const absolutePath = path.isAbsolute(item.path) ? item.path : path.join(VIDEOS_ROOT, item.path);
                            try {
                                const stats = await fsPromises.stat(absolutePath);
                                if (stats.isDirectory()) {
                                    // Get file count for directory
                                    const dirEntries = await fsPromises.readdir(absolutePath);
                                    let hlsCount = 0;
                                    for (const dirEntry of dirEntries) {
                                        if (dirEntry.isFile()) {
                                            const dirEntryExt = path.extname(dirEntry.name).toLowerCase();
                                            if (isVideoFile(dirEntryExt)) {
                                                // Check if HLS version exists
                                                const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                                                const hlsPath = path.join(hlsRootPath, path.relative(VIDEOS_ROOT, path.join(absolutePath, dirEntry.name)).replace(dirEntryExt, ''));
                                                const masterPlaylistPath = path.join(hlsPath, 'master.m3u8');
                                                
                                                try {
                                                    const hlsStats = await fsPromises.stat(masterPlaylistPath);
                                                    if (hlsStats.isFile()) {
                                                        hlsCount++;
                                                    }
                                                } catch (error) {
                                                    // HLS version doesn't exist
                                                }
                                            }
                                        }
                                    }
                                    item.fileCount = dirEntries.length + hlsCount;
                                    item.modified = stats.mtime;
                                }
                            } catch (error) {
                                console.warn(`Warning: Could not get directory info for ${item.path}:`, error.message);
                            }
                        }
                    }
                }));
            }
        }
        
        res.json({ playlists });
    } catch (error) {
        console.error('Error loading playlists:', error);
        res.json({ playlists: [] });
    }
});

router.post('/api/playlists', async (req, res) => {
    try {
        const { name, videos } = req.body;
        
        if (!name || !videos || !Array.isArray(videos)) {
            return res.status(400).json({ error: 'Name and videos array are required' });
        }

        const playlistsData = await fsPromises.readFile(path.join(__dirname, '..', 'playlists.json'), 'utf8');
        const playlistsJson = JSON.parse(playlistsData);
        const playlists = playlistsJson.playlists || [];
        
        const newPlaylist = {
            id: Date.now().toString(),
            name: name,
            videos: videos,
            createdAt: new Date().toISOString()
        };
        
        playlists.push(newPlaylist);
        
        await fsPromises.writeFile(
            path.join(__dirname, '..', 'playlists.json'), 
            JSON.stringify({ playlists }, null, 2)
        );
        
        res.json({ success: true, playlist: newPlaylist });
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ error: 'Failed to create playlist' });
    }
});

// API endpoint to expand directory in playlist (get all videos from directory)
router.get('/api/expand-directory', async (req, res) => {
    const relativePath = req.query.path;
    
    if (!relativePath) {
        return res.status(400).json({ error: 'Path parameter is required' });
    }
    
    try {
        const fullPath = resolveSafePath(relativePath);
        const videos = [];
        
        // Check if it's a directory
        const stats = await fsPromises.stat(fullPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }
        
        // Get all video files from directory
        const entries = await fsPromises.readdir(fullPath, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (isVideoFile(ext)) {
                    const videoPath = path.join(fullPath, entry.name);
                    const relativeVideoPath = path.relative(VIDEOS_ROOT, videoPath);
                    
                    try {
                        const videoStats = await fsPromises.stat(videoPath);
                        const video = {
                            name: entry.name,
                            path: relativeVideoPath,
                            size: videoStats.size,
                            modified: videoStats.mtime,
                            extension: ext,
                            isVideo: true,
                            isHLS: false,
                            mimeType: getVideoMimeType(ext),
                            thumbnailUrl: getThumbnailUrl(videoPath),
                            duration: await getVideoDuration(videoPath)
                        };
                        
                        videos.push(video);
                        
                        // Also add HLS version if it exists
                        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                        const hlsPath = path.join(hlsRootPath, relativeVideoPath.replace(ext, ''));
                        const masterPlaylistPath = path.join(hlsPath, 'master.m3u8');
                        
                        try {
                            const hlsStats = await fsPromises.stat(masterPlaylistPath);
                            if (hlsStats.isFile()) {
                                const hlsVideo = {
                                    name: entry.name.replace(ext, '') + ' (HLS)',
                                    path: relativeVideoPath.replace(ext, '') + '/master.m3u8',
                                    size: hlsStats.size,
                                    modified: hlsStats.mtime,
                                    extension: '.m3u8',
                                    isVideo: true,
                                    isHLS: true,
                                    mimeType: 'application/vnd.apple.mpegurl',
                                    thumbnailUrl: await getHLSThumbnail(masterPlaylistPath),
                                    duration: await getHLSDuration(masterPlaylistPath)
                                };
                                videos.push(hlsVideo);
                            }
                        } catch (error) {
                            // HLS version doesn't exist
                        }
                    } catch (error) {
                        console.warn(`Warning: Could not process video ${entry.name}:`, error.message);
                    }
                }
            }
        }
        
        res.json({ videos });
    } catch (error) {
        console.error('Error expanding directory:', error);
        res.status(500).json({ error: 'Failed to expand directory' });
    }
});

// Favorites management routes
router.get('/api/favorites', async (req, res) => {
    try {
        const favoritesData = await fsPromises.readFile(path.join(__dirname, '..', 'favorites.json'), 'utf8');
        const favoritesJson = JSON.parse(favoritesData);
        const favorites = favoritesJson.favorites || [];
        
        // Add thumbnail URLs to favorites
        for (const favorite of favorites) {
            if (favorite.path) {
                const ext = path.extname(favorite.path).toLowerCase();
                if (isVideoOrHLSFile(ext)) {
                    const absolutePath = path.isAbsolute(favorite.path) ? favorite.path : path.join(VIDEOS_ROOT, favorite.path);
                    favorite.thumbnailUrl = getThumbnailUrl(absolutePath);
                    favorite.duration = await getVideoDuration(absolutePath);
                } else if (favorite.isDirectory) {
                    // Handle directory favorites
                    const absolutePath = path.isAbsolute(favorite.path) ? favorite.path : path.join(VIDEOS_ROOT, favorite.path);
                    try {
                        const stats = await fsPromises.stat(absolutePath);
                        if (stats.isDirectory()) {
                            // Get file count for directory
                            const dirEntries = await fsPromises.readdir(absolutePath);
                            let hlsCount = 0;
                            for (const dirEntry of dirEntries) {
                                if (dirEntry.isFile()) {
                                    const dirEntryExt = path.extname(dirEntry.name).toLowerCase();
                                    if (isVideoFile(dirEntryExt)) {
                                        // Check if HLS version exists
                                        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
                                        const hlsPath = path.join(hlsRootPath, path.relative(VIDEOS_ROOT, path.join(absolutePath, dirEntry.name)).replace(dirEntryExt, ''));
                                        const masterPlaylistPath = path.join(hlsPath, 'master.m3u8');
                                        
                                        try {
                                            const hlsStats = await fsPromises.stat(masterPlaylistPath);
                                            if (hlsStats.isFile()) {
                                                hlsCount++;
                                            }
                                        } catch (error) {
                                            // HLS version doesn't exist
                                        }
                                    }
                                }
                            }
                            favorite.fileCount = dirEntries.length + hlsCount;
                            favorite.modified = stats.mtime;
                        }
                    } catch (error) {
                        console.warn(`Warning: Could not get directory info for ${favorite.path}:`, error.message);
                    }
                }
            }
        }
        
        res.json({ favorites });
    } catch (error) {
        console.error('Error loading favorites:', error);
        res.json({ favorites: [] });
    }
});

router.post('/api/favorites', (req, res) => {
    try {
        const { name, path: videoPath } = req.body;
        
        if (!name || !videoPath) {
            return res.status(400).json({ error: 'Name and path are required' });
        }

        const favoritesData = fs.readFileSync(path.join(__dirname, '..', 'favorites.json'), 'utf8');
        const favoritesJson = JSON.parse(favoritesData);
        const favorites = favoritesJson.favorites || [];
        
        const newFavorite = {
            id: Date.now().toString(),
            name: name,
            path: videoPath,
            addedAt: new Date().toISOString()
        };
        
        favorites.push(newFavorite);
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'favorites.json'), 
            JSON.stringify({ favorites }, null, 2)
        );
        
        res.json({ success: true, favorite: newFavorite });
    } catch (error) {
        console.error('Error adding favorite:', error);
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});

router.delete('/api/favorites/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        const favoritesData = fs.readFileSync(path.join(__dirname, '..', 'favorites.json'), 'utf8');
        const favoritesJson = JSON.parse(favoritesData);
        const favorites = favoritesJson.favorites || [];
        
        const favoriteIndex = favorites.findIndex(fav => fav.id === id);
        if (favoriteIndex === -1) {
            return res.status(404).json({ error: 'Favorite not found' });
        }
        
        favorites.splice(favoriteIndex, 1);
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'favorites.json'), 
            JSON.stringify({ favorites }, null, 2)
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing favorite:', error);
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});

router.put('/api/favorites', (req, res) => {
    try {
        const { favorites } = req.body;
        
        if (!Array.isArray(favorites)) {
            return res.status(400).json({ error: 'Favorites array is required' });
        }
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'favorites.json'), 
            JSON.stringify({ favorites }, null, 2)
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating favorites order:', error);
        res.status(500).json({ error: 'Failed to update favorites order' });
    }
});

// Additional playlist routes
router.put('/api/playlists/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, videos } = req.body;
        
        if (!name || !videos || !Array.isArray(videos)) {
            return res.status(400).json({ error: 'Name and videos array are required' });
        }

        const playlistsData = fs.readFileSync(path.join(__dirname, '..', 'playlists.json'), 'utf8');
        const playlistsJson = JSON.parse(playlistsData);
        const playlists = playlistsJson.playlists || [];
        
        const playlistIndex = playlists.findIndex(playlist => playlist.id === id);
        if (playlistIndex === -1) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        
        playlists[playlistIndex] = {
            ...playlists[playlistIndex],
            name: name,
            videos: videos,
            updatedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'playlists.json'), 
            JSON.stringify({ playlists }, null, 2)
        );
        
        res.json({ success: true, playlist: playlists[playlistIndex] });
    } catch (error) {
        console.error('Error updating playlist:', error);
        res.status(500).json({ error: 'Failed to update playlist' });
    }
});

router.delete('/api/playlists/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        const playlistsData = fs.readFileSync(path.join(__dirname, '..', 'playlists.json'), 'utf8');
        const playlistsJson = JSON.parse(playlistsData);
        const playlists = playlistsJson.playlists || [];
        
        const playlistIndex = playlists.findIndex(playlist => playlist.id === id);
        if (playlistIndex === -1) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        
        playlists.splice(playlistIndex, 1);
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'playlists.json'), 
            JSON.stringify({ playlists }, null, 2)
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting playlist:', error);
        res.status(500).json({ error: 'Failed to delete playlist' });
    }
});

router.put('/api/playlists', (req, res) => {
    try {
        const { playlists } = req.body;
        
        if (!Array.isArray(playlists)) {
            return res.status(400).json({ error: 'Playlists array is required' });
        }
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'playlists.json'), 
            JSON.stringify({ playlists }, null, 2)
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating playlists order:', error);
        res.status(500).json({ error: 'Failed to update playlists order' });
    }
});

router.post('/api/playlists/:id/add-video', (req, res) => {
    try {
        const { id } = req.params;
        const { video } = req.body;
        
        if (!video) {
            return res.status(400).json({ error: 'Video data is required' });
        }

        const playlistsData = fs.readFileSync(path.join(__dirname, '..', 'playlists.json'), 'utf8');
        const playlistsJson = JSON.parse(playlistsData);
        const playlists = playlistsJson.playlists || [];
        
        const playlistIndex = playlists.findIndex(playlist => playlist.id === id);
        if (playlistIndex === -1) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        
        if (!playlists[playlistIndex].videos) {
            playlists[playlistIndex].videos = [];
        }
        
        playlists[playlistIndex].videos.push(video);
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'playlists.json'), 
            JSON.stringify({ playlists }, null, 2)
        );
        
        res.json({ success: true, playlist: playlists[playlistIndex] });
    } catch (error) {
        console.error('Error adding video to playlist:', error);
        res.status(500).json({ error: 'Failed to add video to playlist' });
    }
});

router.post('/api/playlists/:id/remove-video', (req, res) => {
    try {
        const { id } = req.params;
        const { videoPath } = req.body;
        
        if (!videoPath) {
            return res.status(400).json({ error: 'Video path is required' });
        }

        const playlistsData = fs.readFileSync(path.join(__dirname, '..', 'playlists.json'), 'utf8');
        const playlistsJson = JSON.parse(playlistsData);
        const playlists = playlistsJson.playlists || [];
        
        const playlistIndex = playlists.findIndex(playlist => playlist.id === id);
        if (playlistIndex === -1) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        
        if (playlists[playlistIndex].videos) {
            playlists[playlistIndex].videos = playlists[playlistIndex].videos.filter(
                video => video.path !== videoPath
            );
        }
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'playlists.json'), 
            JSON.stringify({ playlists }, null, 2)
        );
        
        res.json({ success: true, playlist: playlists[playlistIndex] });
    } catch (error) {
        console.error('Error removing video from playlist:', error);
        res.status(500).json({ error: 'Failed to remove video from playlist' });
    }
});

router.delete('/api/playlists/:id/videos/:videoPath', (req, res) => {
    try {
        const { id, videoPath } = req.params;
        const decodedVideoPath = decodeURIComponent(videoPath);
        
        const playlistsData = fs.readFileSync(path.join(__dirname, '..', 'playlists.json'), 'utf8');
        const playlistsJson = JSON.parse(playlistsData);
        const playlists = playlistsJson.playlists || [];
        
        const playlistIndex = playlists.findIndex(playlist => playlist.id === id);
        if (playlistIndex === -1) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        
        if (playlists[playlistIndex].videos) {
            playlists[playlistIndex].videos = playlists[playlistIndex].videos.filter(
                video => video.path !== decodedVideoPath
            );
        }
        
        fs.writeFileSync(
            path.join(__dirname, '..', 'playlists.json'), 
            JSON.stringify({ playlists }, null, 2)
        );
        
        res.json({ success: true, playlist: playlists[playlistIndex] });
    } catch (error) {
        console.error('Error removing video from playlist:', error);
        res.status(500).json({ error: 'Failed to remove video from playlist' });
    }
});

// Additional video info routes
router.get('/api/video-stream-info', async (req, res) => {
    const relativePath = req.query.path;

    if (!relativePath) {
        return res.status(400).json({ error: 'Path parameter is required' });
    }

    try {
        const videoPath = resolveSafePath(relativePath);
        let stats;
        try {
            stats = await fsPromises.stat(videoPath);
        } catch (error) {
            console.warn(`Warning: Could not get stats for ${videoPath}:`, error.message);
            return res.status(404).json({ error: 'File not found or inaccessible' });
        }
        const ext = path.extname(videoPath).toLowerCase();

        if (!isVideoOrHLSFile(ext)) {
            return res.status(400).json({ error: 'File is not a supported video or HLS format' });
        }

        const result = {
            name: path.basename(videoPath),
            size: stats.size,
            extension: ext,
            mimeType: getVideoMimeType(ext),
            isVideo: isVideoOrHLSFile(ext),
            isHLS: isHLSFile(ext),
            supportsRangeRequests: true,
            canStream: true
        };

        res.json(result);
    } catch (error) {
        console.error('Video stream info error:', error);
        if (error.message.includes('Access denied')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to get video stream info' });
        }
    }
});

router.get('/api/thumbnail-status', (req, res) => {
    const relativePath = req.query.path;

    if (!relativePath) {
        return res.status(400).json({ error: 'Path parameter is required' });
    }

    try {
        const videoPath = resolveSafePath(relativePath);
        const ext = path.extname(videoPath).toLowerCase();

        if (!isVideoOrHLSFile(ext)) {
            return res.status(400).json({ error: 'File is not a supported video or HLS format' });
        }

        const thumbnailUrl = getThumbnailUrl(videoPath);
        const hasThumbnail = thumbnailUrl !== null;

        res.json({
            hasThumbnail: hasThumbnail,
            thumbnailUrl: thumbnailUrl,
            canGenerate: true
        });
    } catch (error) {
        console.error('Thumbnail status error:', error);
        if (error.message.includes('Access denied')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to get thumbnail status' });
        }
    }
});

// API endpoint to clean up incorrectly named HLS thumbnails
router.post('/api/cleanup-hls-thumbnails', async (req, res) => {
    try {
        const thumbnailsDir = path.join(__dirname, '..', 'thumbnails');
        const files = await fsPromises.readdir(thumbnailsDir);
        
        let cleaned = 0;
        const incorrectFiles = files.filter(file => file.startsWith('.._hls_'));
        
        for (const file of incorrectFiles) {
            const filePath = path.join(thumbnailsDir, file);
            try {
                await fsPromises.unlink(filePath);
                cleaned++;
            } catch (error) {
                console.error(`Error deleting ${file}:`, error.message);
            }
        }
        
        res.json({ 
            success: true, 
            message: `Cleaned up ${cleaned} incorrectly named HLS thumbnails`,
            cleaned: cleaned
        });
        
    } catch (error) {
        console.error('Error cleaning up HLS thumbnails:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to clean up HLS thumbnails' 
        });
    }
});

// API endpoint to clean up and regenerate HLS thumbnails
router.post('/api/fix-hls-thumbnails', async (req, res) => {
    try {
        
        // Step 1: Clean up incorrectly named thumbnails
        const thumbnailsDir = path.join(__dirname, '..', 'thumbnails');
        const files = await fsPromises.readdir(thumbnailsDir);
        const incorrectFiles = files.filter(file => file.startsWith('.._hls_'));
        
        let cleaned = 0;
        for (const file of incorrectFiles) {
            const filePath = path.join(thumbnailsDir, file);
            try {
                await fsPromises.unlink(filePath);
                cleaned++;
            } catch (error) {
                console.error(`Error deleting ${file}:`, error.message);
            }
        }
        
        
        // Step 2: Generate HLS thumbnails with correct names
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        
        if (!fs.existsSync(hlsRootPath)) {
            return res.json({ 
                success: false, 
                message: 'HLS directory not found' 
            });
        }
        
        const hlsVideosWithoutThumbnails = await findVideosWithoutThumbnails(hlsRootPath);
        
        if (hlsVideosWithoutThumbnails.length === 0) {
            return res.json({ 
                success: true, 
                message: 'All HLS videos already have correct thumbnails',
                cleaned: cleaned,
                generated: 0
            });
        }
        
        
        let generated = 0;
        let failed = 0;
        
        for (const video of hlsVideosWithoutThumbnails) {
            try {
                const result = await generateHLSThumbnail(video.path);
                if (result && typeof result === 'string') {
                    generated++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.error(`Error generating thumbnail for ${video.name}:`, error.message);
                failed++;
            }
        }
        
        res.json({ 
            success: true, 
            message: `HLS thumbnail fix complete: ${cleaned} cleaned, ${generated} generated, ${failed} failed`,
            cleaned: cleaned,
            generated: generated,
            failed: failed
        });
        
    } catch (error) {
        console.error('Error fixing HLS thumbnails:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fix HLS thumbnails' 
        });
    }
});

// API endpoint to generate HLS thumbnails
router.post('/api/generate-hls-thumbnails', async (req, res) => {
    try {
        
        const hlsRootPath = path.join(path.dirname(VIDEOS_ROOT), 'hls');
        
        if (!fs.existsSync(hlsRootPath)) {
            return res.json({ 
                success: false, 
                message: 'HLS directory not found' 
            });
        }
        
        // Find all HLS files without thumbnails
        const hlsVideosWithoutThumbnails = await findVideosWithoutThumbnails(hlsRootPath);
        
        if (hlsVideosWithoutThumbnails.length === 0) {
            return res.json({ 
                success: true, 
                message: 'All HLS videos already have thumbnails',
                generated: 0
            });
        }
        
        
        let generated = 0;
        let failed = 0;
        
        for (const video of hlsVideosWithoutThumbnails) {
            try {
                const result = await generateHLSThumbnail(video.path);
                if (result && typeof result === 'string') {
                    generated++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.error(`Error generating thumbnail for ${video.name}:`, error.message);
                failed++;
            }
        }
        
        res.json({ 
            success: true, 
            message: `HLS thumbnail generation complete: ${generated} generated, ${failed} failed`,
            generated: generated,
            failed: failed
        });
        
    } catch (error) {
        console.error('Error generating HLS thumbnails:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate HLS thumbnails' 
        });
    }
});

// API endpoint to generate video thumbnail
router.get('/api/thumbnail', async (req, res) => {
    const relativePath = req.query.path;

    if (!relativePath) {
        return res.status(400).json({ error: 'Path parameter is required' });
    }

    try {
        const videoPath = resolveSafePath(relativePath);
        const ext = path.extname(videoPath).toLowerCase();

        if (!isVideoOrHLSFile(ext)) {
            return res.status(400).json({ error: 'File is not a supported video or HLS format' });
        }

        // Check if thumbnail already exists
        const thumbnailUrl = getThumbnailUrl(videoPath);
        if (thumbnailUrl) {
            return res.json({ 
                success: true, 
                thumbnailUrl: thumbnailUrl,
                message: 'Thumbnail already exists'
            });
        }

        // Generate thumbnail
        // For HLS files, use hls folder as base, otherwise use videos folder
        const isHLS = isHLSFile(ext);
        const basePath = isHLS ? path.join(path.dirname(VIDEOS_ROOT), 'hls') : VIDEOS_ROOT;
        const relativePathForThumb = path.relative(basePath, videoPath);
        const pathWithoutExt = relativePathForThumb.replace(/\.[^/.]+$/, '');
        const safeName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', safeName + '.jpg');

        let success = false;
        
        // For HLS files, try to generate from first quality
        if (isHLSFile(ext) && ext === '.m3u8') {
            const hlsInfo = await getHLSInfo(videoPath);
            if (hlsInfo.qualities.length > 0) {
                const firstQualityPath = path.join(path.dirname(videoPath), hlsInfo.qualities[0].playlist);
                success = await generateThumbnailAsync(firstQualityPath, thumbnailPath);
            }
        } else {
            // Regular video file
            success = await generateThumbnailAsync(videoPath, thumbnailPath);
        }

        if (success && fs.existsSync(thumbnailPath)) {
            const newThumbnailUrl = `/thumbnails/${encodeURIComponent(safeName + '.jpg')}`;
            res.json({ 
                success: true, 
                thumbnailUrl: newThumbnailUrl,
                message: 'Thumbnail generated successfully'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'Failed to generate thumbnail' 
            });
        }

    } catch (error) {
        console.error('Thumbnail generation error:', error);
        if (error.message.includes('Access denied')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to generate thumbnail' });
        }
    }
});

module.exports = router;
