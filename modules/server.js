const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { APP_CONFIG, VIDEOS_ROOT } = require('./config');
const { validateFFmpegInstallation } = require('./ffmpeg');
const { requireAuth, getLoginPageHTML } = require('./auth');
const { ensureDirectoryExists } = require('./fileUtils');
const { loadDurationCache, generateAllMissingThumbnails, buildDurationCache } = require('./videoProcessing');
const routes = require('./routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session middleware
app.use(session({
    secret: 'video-player-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Login page
app.get('/login', (req, res) => {
    res.send(getLoginPageHTML(req.query.error));
});

// Login API endpoint
app.post('/api/login', (req, res) => {
    const { password } = req.body;

    if (password === APP_CONFIG.password) {
        req.session.authenticated = true;
        res.redirect('/');
    } else {
        res.redirect('/login?error=1');
    }
});

// Programmatic login API endpoint (for testing/API access)
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;

    if (password === APP_CONFIG.password) {
        req.session.authenticated = true;
        res.json({ success: true, message: 'Authentication successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Serve app configuration
app.get('/api/config', (req, res) => {
    res.json({
        name: APP_CONFIG.name,
        description: APP_CONFIG.description
    });
});

// Apply authentication to all routes except login and config
app.use(requireAuth);

// Custom thumbnail serving with URL decoding (MUST come before static file serving)
app.get('/thumbnails/*', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params[0]);
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', filename);

        if (fs.existsSync(thumbnailPath)) {
            res.sendFile(thumbnailPath);
        } else {
            // Try with quotes around the filename (ffmpeg sometimes adds quotes)
            const quotedFilename = `'${filename}'`;
            const quotedThumbnailPath = path.join(__dirname, '..', 'thumbnails', quotedFilename);
            
            if (fs.existsSync(quotedThumbnailPath)) {
                res.sendFile(quotedThumbnailPath);
            } else {
                console.log('Thumbnail file not found:', thumbnailPath);
                res.status(404).send('Thumbnail not found');
            }
        }
    } catch (error) {
        console.error('Error serving thumbnail:', error);
        res.status(500).send('Error serving thumbnail');
    }
});

// Serve static files from the public directory on root path
app.use('/', express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Serve static files on root path with large file support
app.use('/videos', express.static(VIDEOS_ROOT, {
    setHeaders: (res, filePath) => {
        if (filePath.match(/\.(mp4|avi|mov|mkv|webm|m4v|flv|wmv|3gp|ogv|m3u8|ts)$/i)) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            
            if (filePath.match(/\.(m3u8|ts)$/i)) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range');
                res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
            }
        }
    },
    maxAge: '1y'
}));

// Serve HLS files from the separate hls directory
const HLS_ROOT = path.join(path.dirname(VIDEOS_ROOT), 'hls');

// HLS quality playlist proxy middleware - more specific pattern
app.get('/hls/:quality/playlist.m3u8', async (req, res) => {
    console.log('🔍 HLS Quality Playlist Proxy triggered:', req.path);
    console.log('🔍 Referer:', req.get('Referer'));
    
    // Extract the quality from the URL (e.g., /hls/720p/playlist.m3u8 -> 720p)
    const quality = req.params.quality; // Should be like "720p"
    
    // Get the referer to find the original master playlist path
    const referer = req.get('Referer');
    if (!referer) {
        console.log('❌ No referer header found');
        return res.status(400).json({ error: 'No referer header found' });
    }
    
    try {
        // Extract the master playlist path from referer
        // e.g., https://domain.com/hls/Active%20Bottoming%2FActive%20Facedown%20Introduction%2Fmaster.m3u8
        const refererUrl = new URL(referer);
        const masterPath = decodeURIComponent(refererUrl.pathname);
        
        // Convert master playlist path to directory path
        // e.g., /hls/Active Bottoming/Active Facedown Introduction/master.m3u8 -> /hls/Active Bottoming/Active Facedown Introduction/
        const masterDir = masterPath.replace('/master.m3u8', '');
        
        // Construct the correct quality playlist path
        const correctPath = path.join(HLS_ROOT, masterDir, quality, 'playlist.m3u8');
        
        // Check if the file exists
        if (!fs.existsSync(correctPath)) {
            return res.status(404).json({ error: 'Quality playlist not found' });
        }
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
        
        // Serve the file
        res.sendFile(correctPath);
    } catch (error) {
        console.error('Error processing HLS quality playlist:', error);
        res.status(500).json({ error: 'Failed to serve quality playlist' });
    }
});

// HLS video segment proxy middleware
app.get('/hls/:quality/:segment', async (req, res) => {
    console.log('🔍 HLS Video Segment Proxy triggered:', req.path);
    console.log('🔍 Referer:', req.get('Referer'));
    
    // Extract the quality and segment from the URL (e.g., /hls/720p/segment_001.ts -> 720p, segment_001.ts)
    const quality = req.params.quality; // Should be like "720p"
    const segmentFile = req.params.segment; // Should be like "segment_001.ts"
    
    // Get the referer to find the original master playlist path
    const referer = req.get('Referer');
    if (!referer) {
        console.log('❌ No referer header found for segment');
        return res.status(400).json({ error: 'No referer header found' });
    }
    
    try {
        // Extract the master playlist path from referer
        const refererUrl = new URL(referer);
        const masterPath = decodeURIComponent(refererUrl.pathname);
        
        // Convert master playlist path to directory path
        const masterDir = masterPath.replace('/master.m3u8', '');
        
        // Construct the correct segment path
        const correctPath = path.join(HLS_ROOT, masterDir, quality, segmentFile);
        
        // Check if the file exists
        if (!fs.existsSync(correctPath)) {
            return res.status(404).json({ error: 'Video segment not found' });
        }
        
        // Set appropriate headers for video segments
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
        
        // Serve the file
        res.sendFile(correctPath);
    } catch (error) {
        console.error('Error processing HLS video segment:', error);
        res.status(500).json({ error: 'Failed to serve video segment' });
    }
});

app.use('/hls', express.static(HLS_ROOT, {
    setHeaders: (res, filePath) => {
        if (filePath.match(/\.(m3u8|ts)$/i)) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
        }
    },
    maxAge: '1y'
}));

// Use API routes
app.use(routes);

// Serve the main HTML file on root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize server
async function startServer() {
    try {
        // Validate FFmpeg installation
        const ffmpegValid = await validateFFmpegInstallation();
        if (!ffmpegValid) {
            console.error('❌ FFmpeg validation failed. Please install FFmpeg before starting the server.');
            process.exit(1);
        }

        // Ensure required directories exist
        await ensureDirectoryExists(VIDEOS_ROOT);
        await ensureDirectoryExists(path.join(__dirname, '..', 'thumbnails'));

        // Load duration cache
        await loadDurationCache();

        // Start the server
        app.listen(APP_CONFIG.port, () => {
            console.log(`🚀 Server running on http://localhost:${APP_CONFIG.port}`);
            console.log(`📁 Videos directory: ${VIDEOS_ROOT}`);
            console.log(`🔐 Authentication: ${APP_CONFIG.password ? 'Enabled' : 'Disabled'}`);
        });

        // Generate missing thumbnails in background
        generateAllMissingThumbnails().catch(error => {
            console.error('Error generating thumbnails:', error);
        });

        // Build duration cache in background
        buildDurationCache().catch(error => {
            console.error('Error building duration cache:', error);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

module.exports = { app, startServer };
