const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 4000;
const VIDEOS_ROOT = path.join(__dirname, 'videos');

// Supported video formats
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.flv', '.wmv', '.3gp', '.ogv'];

function resolveSafePath(requestedPath) {
    // Handle empty or undefined path
    if (!requestedPath || requestedPath === '') {
        return VIDEOS_ROOT;
    }
    
    // Normalize the requested path to prevent directory traversal
    let normalizedPath = path.normalize(requestedPath);
    
    // Remove leading slash if present to make it relative
    if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.substring(1);
    }
    
    // Check for directory traversal attempts - reject any path with '..'
    if (normalizedPath.includes('..')) {
        throw new Error('Access denied: Invalid path');
    }
    
    // Check if path tries to go above the videos directory
    if (normalizedPath.startsWith('..') || normalizedPath.includes('/..') || normalizedPath.includes('\\..')) {
        throw new Error('Access denied: Cannot browse above main folder');
    }
    
    // Resolve the absolute path
    const fullPath = path.resolve(VIDEOS_ROOT, normalizedPath);
    
    // Ensure the resolved path is inside VIDEOS_ROOT and not the same as VIDEOS_ROOT parent
    if (!fullPath.startsWith(VIDEOS_ROOT) || fullPath === path.dirname(VIDEOS_ROOT)) {
        throw new Error('Access denied: Path outside video directory');
    }
    
    // Additional check: ensure we're not at the exact VIDEOS_ROOT level trying to go up
    if (path.dirname(fullPath) === path.dirname(VIDEOS_ROOT)) {
        throw new Error('Access denied: Cannot browse above main folder');
    }
    
    return fullPath;
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory on root path
app.use('/', express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// Serve static files on root path
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));

// Helper function to check if file is video
function isVideoFile(extension) {
    return VIDEO_EXTENSIONS.includes(extension.toLowerCase());
}

// Helper function to get MIME type
function getVideoMimeType(extension) {
    const mimeTypes = {
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.m4v': 'video/mp4',
        '.flv': 'video/x-flv',
        '.wmv': 'video/x-ms-wmv',
        '.3gp': 'video/3gpp',
        '.ogv': 'video/ogg'
    };
    return mimeTypes[extension.toLowerCase()] || 'video/mp4';
}

// API endpoint to get directory contents
app.get('/api/browse', (req, res) => {
    const relativePath = req.query.path || '';
    let directoryPath;
    try {
        directoryPath = resolveSafePath(relativePath);
    } catch (err) {
        console.log(err)
        return res.status(403).json({ error: 'Access denied' });
    }
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder || 'asc';
    const filterType = req.query.filterType || 'all';

    try {
        const items = fs.readdirSync(directoryPath, { withFileTypes: true });

        let result = items
            .filter(item => !item.name.startsWith('._'))
            .map(item => {
            const fullPath = path.join(directoryPath, item.name);
            const stats = fs.statSync(fullPath);
            const extension = path.extname(item.name).toLowerCase();
            return {
                name: item.name,
                path: path.relative(VIDEOS_ROOT, fullPath), // <-- RELATIVE path
                isDirectory: item.isDirectory(),
                isFile: item.isFile(),
                size: stats.size,
                modified: stats.mtime,
                extension: extension,
                isVideo: isVideoFile(extension),
                mimeType: isVideoFile(extension) ? getVideoMimeType(extension) : null
            };
        });

        // Apply search filter
        if (search) {
            result = result.filter(item =>
                item.name.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Apply type filter
        if (filterType !== 'all') {
            if (filterType === 'videos') {
                result = result.filter(item => item.isVideo);
            } else if (filterType === 'directories') {
                result = result.filter(item => item.isDirectory);
            } else if (filterType === 'files') {
                result = result.filter(item => item.isFile && !item.isVideo);
            }
        }

        // Apply sorting
        result.sort((a, b) => {
            let comparison = 0;

            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'size') {
                comparison = a.size - b.size;
            } else if (sortBy === 'modified') {
                comparison = new Date(a.modified) - new Date(b.modified);
            } else if (sortBy === 'type') {
                comparison = a.extension.localeCompare(b.extension);
            }

            // Sort directories first, then files
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;

            return sortOrder === 'desc' ? -comparison : comparison;
        });

        // Calculate parent path - only if we're not at the root level
        let parentPath = '';
        if (directoryPath !== VIDEOS_ROOT) {
            const parentDir = path.dirname(directoryPath);
            if (parentDir !== VIDEOS_ROOT) {
                parentPath = path.relative(VIDEOS_ROOT, parentDir);
            } else {
                parentPath = ''; // We're one level down from root, parent is root
            }
        }
        
        res.json({
            currentPath: path.relative(VIDEOS_ROOT, directoryPath),
            parentPath: parentPath,
            items: result,
            totalItems: result.length
        });
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: 'Unable to read directory' });
    }
});

// API endpoint to get video info
app.get('/api/video-info', (req, res) => {
    const relativePath = req.query.path;

    if (!relativePath) {
        return res.status(400).json({ error: 'Video path is required' });
    }

    try {
        const videoPath = resolveSafePath(relativePath);
        const stats = fs.statSync(videoPath);
        const ext = path.extname(videoPath).toLowerCase();

        if (!isVideoFile(ext)) {
            return res.status(400).json({ error: 'File is not a supported video format' });
        }

        res.json({
            path: path.relative(VIDEOS_ROOT, videoPath), // Return relative path
            size: stats.size,
            modified: stats.mtime,
            name: path.basename(videoPath),
            extension: ext,
            mimeType: getVideoMimeType(ext)
        });
    } catch (error) {
        console.error('Video info error:', error);
        if (error.message.includes('Access denied')) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(500).json({ error: 'Unable to read video file' });
    }
});

// API endpoint to generate video thumbnail
app.get('/api/thumbnail', async (req, res) => {
    const relativePath = req.query.path;
    const timestamp = req.query.timestamp || '00:00:05';

    if (!relativePath) {
        return res.status(400).json({ error: 'Video path is required' });
    }

    try {
        // Use secure path resolution
        const videoPath = resolveSafePath(relativePath);
        const ext = path.extname(videoPath).toLowerCase();
        
        if (!isVideoFile(ext)) {
            return res.status(400).json({ error: 'File is not a supported video format' });
        }

        // Create thumbnails directory if it doesn't exist
        const thumbnailsDir = path.join(__dirname, 'thumbnails');
        if (!fs.existsSync(thumbnailsDir)) {
            fs.mkdirSync(thumbnailsDir, { recursive: true });
        }

        const videoName = path.basename(videoPath, ext);
        const thumbnailPath = path.join(thumbnailsDir, `${videoName}_thumb.jpg`);

        // Check if thumbnail already exists
        if (fs.existsSync(thumbnailPath)) {
            return res.json({ thumbnailUrl: `/thumbnails/${path.basename(thumbnailPath)}` });
        }

        // Generate thumbnail using ffmpeg
        const command = `ffmpeg -i "${videoPath}" -ss ${timestamp} -vframes 1 -q:v 2 "${thumbnailPath}"`;

        try {
            await execAsync(command);
            res.json({ thumbnailUrl: `/thumbnails/${path.basename(thumbnailPath)}` });
        } catch (ffmpegError) {
            // If ffmpeg fails, return a default thumbnail
            res.json({ thumbnailUrl: null });
        }
    } catch (error) {
        if (error.message.includes('Access denied')) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(500).json({ error: 'Unable to generate thumbnail' });
    }
});

// API endpoint to search files recursively
app.get('/api/search', (req, res) => {
    const searchTerm = req.query.q;
    const relativePath = req.query.path || '';
    let searchPath;
  
    try {
      searchPath = resolveSafePath(relativePath);
    } catch (err) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const fileType = req.query.type || 'all';

    if (!searchTerm) {
        return res.status(400).json({ error: 'Search term is required' });
    }

    try {
        const results = [];

        function searchDirectory(dirPath) {
            try {
                const items = fs.readdirSync(dirPath, { withFileTypes: true });

                items.forEach(item => {
                    const fullPath = path.join(dirPath, item.name);

                    if (item.isDirectory()) {
                        searchDirectory(fullPath);
                    } else {
                        const ext = path.extname(item.name).toLowerCase();
                        const stats = fs.statSync(fullPath);

                        const isVideo = isVideoFile(ext);
                        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());

                        if (matchesSearch) {
                            if (fileType === 'all' ||
                                (fileType === 'videos' && isVideo) ||
                                (fileType === 'files' && !isVideo)) {
                                results.push({
                                    name: item.name,
                                    path: path.relative(VIDEOS_ROOT, fullPath), // Return relative path
                                    isDirectory: false,
                                    isFile: true,
                                    size: stats.size,
                                    modified: stats.mtime,
                                    extension: ext,
                                    isVideo: isVideo,
                                    mimeType: isVideo ? getVideoMimeType(ext) : null,
                                    relativePath: path.relative(searchPath, fullPath)
                                });
                            }
                        }
                    }
                });
            } catch (error) {
                // Skip directories we can't read
            }
        }

        searchDirectory(searchPath);

        res.json({
            results: results,
            totalResults: results.length,
            searchTerm: searchTerm
        });
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// API endpoint to manage playlists
app.get('/api/playlists', (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        if (fs.existsSync(playlistsFile)) {
            const data = fs.readFileSync(playlistsFile, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json({ playlists: [] });
        }
    } catch (error) {
        res.status(500).json({ error: 'Unable to load playlists' });
    }
});

app.post('/api/playlists', (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        const { name, videos } = req.body;

        // Validate input
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Playlist name is required' });
        }

        if (name.trim().length > 100) {
            return res.status(400).json({ error: 'Playlist name is too long (max 100 characters)' });
        }

        let playlists = { playlists: [] };
        if (fs.existsSync(playlistsFile)) {
            const data = fs.readFileSync(playlistsFile, 'utf8');
            playlists = JSON.parse(data);
        }

        // Check for duplicate playlist names
        const trimmedName = name.trim();
        const duplicateExists = playlists.playlists.some(p => p.name.toLowerCase() === trimmedName.toLowerCase());
        if (duplicateExists) {
            return res.status(400).json({ error: 'A playlist with this name already exists' });
        }

        const newPlaylist = {
            id: Date.now().toString(),
            name: trimmedName,
            videos: videos || [],
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };

        playlists.playlists.push(newPlaylist);
        fs.writeFileSync(playlistsFile, JSON.stringify(playlists, null, 2));

        res.json(newPlaylist);
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ error: 'Unable to save playlist' });
    }
});

app.delete('/api/playlists/:id', (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        const { id } = req.params;

        // Validate ID
        if (!id || typeof id !== 'string' || id.trim().length === 0) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }

        let playlists = { playlists: [] };
        if (fs.existsSync(playlistsFile)) {
            const data = fs.readFileSync(playlistsFile, 'utf8');
            playlists = JSON.parse(data);
        }

        const initialLength = playlists.playlists.length;
        playlists.playlists = playlists.playlists.filter(playlist => playlist.id !== id);
        
        if (playlists.playlists.length === initialLength) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        fs.writeFileSync(playlistsFile, JSON.stringify(playlists, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting playlist:', error);
        res.status(500).json({ error: 'Unable to delete playlist' });
    }
});

// API endpoint to update playlist
app.put('/api/playlists/:id', (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        const { id } = req.params;
        const { name, videos } = req.body;

        // Validate ID
        if (!id || typeof id !== 'string' || id.trim().length === 0) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }

        // Validate input
        if (name !== undefined && (!name || typeof name !== 'string' || name.trim().length === 0)) {
            return res.status(400).json({ error: 'Playlist name is required' });
        }

        if (name && name.trim().length > 100) {
            return res.status(400).json({ error: 'Playlist name is too long (max 100 characters)' });
        }

        let playlists = { playlists: [] };
        if (fs.existsSync(playlistsFile)) {
            const data = fs.readFileSync(playlistsFile, 'utf8');
            playlists = JSON.parse(data);
        }

        const playlist = playlists.playlists.find(p => p.id === id);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        // Check for duplicate playlist names (excluding current playlist)
        if (name) {
            const trimmedName = name.trim();
            const duplicateExists = playlists.playlists.some(p => 
                p.id !== id && p.name.toLowerCase() === trimmedName.toLowerCase()
            );
            if (duplicateExists) {
                return res.status(400).json({ error: 'A playlist with this name already exists' });
            }
            playlist.name = trimmedName;
        }

        if (videos !== undefined) {
            playlist.videos = videos;
        }

        playlist.modified = new Date().toISOString();

        fs.writeFileSync(playlistsFile, JSON.stringify(playlists, null, 2));
        res.json({ success: true, playlist: playlist });
    } catch (error) {
        console.error('Error updating playlist:', error);
        res.status(500).json({ error: 'Unable to update playlist' });
    }
});

// API endpoint to add video to existing playlist
app.post('/api/playlists/:id/add-video', (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        const { id } = req.params;
        const { video } = req.body;

        if (!video) {
            return res.status(400).json({ error: 'Video data is required' });
        }

        let playlists = { playlists: [] };
        if (fs.existsSync(playlistsFile)) {
            const data = fs.readFileSync(playlistsFile, 'utf8');
            playlists = JSON.parse(data);
        }

        const playlist = playlists.playlists.find(p => p.id === id);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        // Check if video already exists in playlist
        const videoExists = playlist.videos.some(v => v.path === video.path);
        if (videoExists) {
            return res.status(400).json({ error: 'Video already exists in playlist' });
        }

        // Add video to playlist
        playlist.videos.push(video);
        playlist.modified = new Date().toISOString();

        fs.writeFileSync(playlistsFile, JSON.stringify(playlists, null, 2));
        res.json({ success: true, playlist: playlist });
    } catch (error) {
        res.status(500).json({ error: 'Unable to add video to playlist' });
    }
});

// API endpoint to remove video from playlist
app.delete('/api/playlists/:id/videos/:videoPath', (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        const { id, videoPath } = req.params;

        // Validate ID
        if (!id || typeof id !== 'string' || id.trim().length === 0) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }

        if (!videoPath) {
            return res.status(400).json({ error: 'Video path is required' });
        }

        // URL decode the video path
        const decodedVideoPath = decodeURIComponent(videoPath);
        console.log('Remove video request - Original path:', videoPath);
        console.log('Remove video request - Decoded path:', decodedVideoPath);

        let playlists = { playlists: [] };
        if (fs.existsSync(playlistsFile)) {
            const data = fs.readFileSync(playlistsFile, 'utf8');
            playlists = JSON.parse(data);
        }

        const playlist = playlists.playlists.find(p => p.id === id);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        console.log('Playlist videos:', playlist.videos.map(v => v.path));
        console.log('Looking for video with path:', decodedVideoPath);

        const initialLength = playlist.videos.length;
        playlist.videos = playlist.videos.filter(video => video.path !== decodedVideoPath);
        
        if (playlist.videos.length === initialLength) {
            return res.status(404).json({ error: 'Video not found in playlist' });
        }

        playlist.modified = new Date().toISOString();

        fs.writeFileSync(playlistsFile, JSON.stringify(playlists, null, 2));
        res.json({ success: true, playlist: playlist });
    } catch (error) {
        console.error('Error removing video from playlist:', error);
        res.status(500).json({ error: 'Unable to remove video from playlist' });
    }
});

// API endpoint to manage favorites
app.get('/api/favorites', (req, res) => {
    try {
        const favoritesFile = path.join(__dirname, 'favorites.json');
        if (fs.existsSync(favoritesFile)) {
            const data = fs.readFileSync(favoritesFile, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json({ favorites: [] });
        }
    } catch (error) {
        res.status(500).json({ error: 'Unable to load favorites' });
    }
});

app.post('/api/favorites', (req, res) => {
    try {
        const favoritesFile = path.join(__dirname, 'favorites.json');
        const { path: filePath, name } = req.body;

        let favorites = { favorites: [] };
        if (fs.existsSync(favoritesFile)) {
            const data = fs.readFileSync(favoritesFile, 'utf8');
            favorites = JSON.parse(data);
        }

        // Check if already favorited
        const exists = favorites.favorites.find(fav => fav.path === filePath);
        if (exists) {
            return res.status(400).json({ error: 'Already in favorites' });
        }

        const newFavorite = {
            id: Date.now().toString(),
            name: name,
            path: filePath,
            added: new Date().toISOString()
        };

        favorites.favorites.push(newFavorite);
        fs.writeFileSync(favoritesFile, JSON.stringify(favorites, null, 2));

        res.json(newFavorite);
    } catch (error) {
        res.status(500).json({ error: 'Unable to save favorite' });
    }
});

app.delete('/api/favorites/:id', (req, res) => {
    try {
        const favoritesFile = path.join(__dirname, 'favorites.json');
        const { id } = req.params;

        let favorites = { favorites: [] };
        if (fs.existsSync(favoritesFile)) {
            const data = fs.readFileSync(favoritesFile, 'utf8');
            favorites = JSON.parse(data);
        }

        favorites.favorites = favorites.favorites.filter(fav => fav.id !== id);
        fs.writeFileSync(favoritesFile, JSON.stringify(favorites, null, 2));

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Unable to remove favorite' });
    }
});

// Serve the main HTML file on root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Browse files and watch MP4 videos!`);
});
