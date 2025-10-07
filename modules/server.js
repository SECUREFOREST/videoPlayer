const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cluster = require('cluster');
const os = require('os');
const { APP_CONFIG, VIDEOS_ROOT } = require('./config');
const { validateFFmpegInstallation } = require('./ffmpeg');
const { requireAuth, getLoginPageHTML } = require('./auth');
const { ensureDirectoryExists } = require('./fileUtils');
const { loadDurationCache, generateAllMissingThumbnails, buildDurationCache } = require('./videoProcessing');
const routes = require('./routes');

// Helper function to ensure JSON file exists with default structure
async function ensureJsonFile(filePath, defaultStructure) {
    try {
        await fs.promises.access(filePath);
        // File exists, no need to create it
        console.log(`✅ JSON file exists: ${path.basename(filePath)}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, create it with default structure
            console.log(`📝 Creating missing JSON file: ${path.basename(filePath)}`);
            await fs.promises.writeFile(filePath, JSON.stringify(defaultStructure, null, 2));
            console.log(`✅ Created JSON file: ${path.basename(filePath)}`);
        } else {
            // Other error (permission, etc.)
            throw error;
        }
    }
}

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

// ===== STATIC FILE SERVING =====

// Custom thumbnail serving with URL decoding
app.get('/thumbnails/*', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params[0]);
        const thumbnailPath = path.join(__dirname, '..', 'thumbnails', filename);
        
        // Check if thumbnail exists

        if (fs.existsSync(thumbnailPath)) {
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.sendFile(thumbnailPath);
        } else {
            // Try with quotes around the filename (ffmpeg sometimes adds quotes)
            const quotedFilename = `'${filename}'`;
            const quotedThumbnailPath = path.join(__dirname, '..', 'thumbnails', quotedFilename);
            
            if (fs.existsSync(quotedThumbnailPath)) {
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                res.sendFile(quotedThumbnailPath);
            } else {
                res.status(404).send('Thumbnail not found');
            }
        }
    } catch (error) {
        console.error('❌ Error serving thumbnail:', error);
        res.status(500).send('Error serving thumbnail');
    }
});

// Serve static files from the public directory
app.use('/', express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Serve video files with large file support
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

// ===== HLS STREAMING =====

// HLS configuration
const HLS_ROOT = path.join(path.dirname(VIDEOS_ROOT), 'hls');
const masterPlaylistStore = new Map();

// Route to capture master playlist access and store the path
app.get('/hls/*/master.m3u8', (req, res, next) => {
    const masterPath = req.path;
    const sessionId = req.sessionID || req.ip;
    
    // Store the master playlist path for this session
    masterPlaylistStore.set(sessionId, masterPath);
    
    // Continue to static file serving
    next();
});

// HLS quality playlist proxy middleware
app.get('/hls/:quality/playlist.m3u8', async (req, res) => {
    const quality = req.params.quality;
    const sessionId = req.sessionID || req.ip;
    const masterPath = masterPlaylistStore.get(sessionId);
    
    if (!masterPath) {
        return res.status(404).json({ error: 'No master playlist path found for session' });
    }
    
    // Convert master playlist path to directory path
    const masterDir = decodeURIComponent(masterPath.replace('/hls/', '').replace('/master.m3u8', ''));
    
    try {
        const correctPath = path.join(HLS_ROOT, masterDir, quality, 'playlist.m3u8');
        
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
        
        res.sendFile(correctPath);
    } catch (error) {
        console.error('Error processing HLS quality playlist:', error);
        res.status(500).json({ error: 'Failed to serve quality playlist' });
    }
});

// General HLS request handler
app.get('/hls/*', (req, res, next) => {
    next();
});

// HLS video segment proxy middleware
app.get('/hls/:quality/:segment', async (req, res) => {
    const quality = req.params.quality;
    const segmentFile = req.params.segment;
    const sessionId = req.sessionID || req.ip;
    const masterPath = masterPlaylistStore.get(sessionId);
    
    if (!masterPath) {
        return res.status(404).json({ error: 'No master playlist path found for session' });
    }
    
    // Convert master playlist path to directory path
    const masterDir = decodeURIComponent(masterPath.replace('/hls/', '').replace('/master.m3u8', ''));
    
    try {
        const correctPath = path.join(HLS_ROOT, masterDir, quality, segmentFile);
        
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
        
        res.sendFile(correctPath);
    } catch (error) {
        console.error('Error processing HLS video segment:', error);
        res.status(500).json({ error: 'Failed to serve video segment' });
    }
});

// Static file serving for HLS files - MUST come after proxy middleware
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

// ===== API ROUTES =====

// Use API routes
app.use(routes);

// Serve the main HTML file on root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize server
async function startServer() {
    try {
        // Cluster-specific optimizations
        if (cluster.isMaster) {
            console.log(`🚀 Master process ${process.pid} is running`);
            console.log(`💻 CPU cores available: ${os.cpus().length}`);
            
            // Set process title for better monitoring
            process.title = 'video-player-master';
        } else {
            console.log(`⚡ Worker process ${process.pid} started`);
            process.title = `video-player-worker-${process.pid}`;
        }

        // Validate FFmpeg installation (only once per worker)
        const ffmpegValid = await validateFFmpegInstallation();
        if (!ffmpegValid) {
            console.error('❌ FFmpeg validation failed. Please install FFmpeg before starting the server.');
            process.exit(1);
        }

        // Ensure required directories exist (only once per worker)
        await ensureDirectoryExists(VIDEOS_ROOT);
        await ensureDirectoryExists(path.join(__dirname, '..', 'thumbnails'));

        // Ensure JSON files exist (only once per worker)
        console.log('🔧 Checking JSON files...');
        await ensureJsonFile(path.join(__dirname, '..', 'favorites.json'), { favorites: [] });
        await ensureJsonFile(path.join(__dirname, '..', 'playlists.json'), { playlists: [] });

        // Load duration cache (per worker for better performance)
        await loadDurationCache();

        // Start the server
        const server = app.listen(APP_CONFIG.port, () => {
            console.log(`🚀 Server running on http://localhost:${APP_CONFIG.port}`);
            console.log(`📁 Videos directory: ${VIDEOS_ROOT}`);
            console.log(`🔐 Authentication: ${APP_CONFIG.password ? 'Enabled' : 'Disabled'}`);
            console.log(`⚡ Process ID: ${process.pid}`);
            console.log(`💾 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        });

        // Server optimizations for video streaming
        server.keepAliveTimeout = 65000; // 65 seconds
        server.headersTimeout = 66000; // 66 seconds
        server.maxConnections = 1000; // Max concurrent connections

        // Generate missing thumbnails in background (only on master or first worker)
        if (cluster.isMaster || process.env.WORKER_ID === '0') {
            console.log('🔄 Starting background thumbnail generation...');
            generateAllMissingThumbnails().then(() => {
                console.log('✅ Background thumbnail generation completed');
            }).catch(error => {
                console.error('❌ Error generating thumbnails:', error.message);
            });

            // Build duration cache in background
            buildDurationCache().catch(error => {
                console.error('Error building duration cache:', error);
            });
        }

        // Graceful shutdown handling
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            server.close(() => {
                console.log('✅ Process terminated');
                process.exit(0);
            });
        });

        process.on('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            server.close(() => {
                console.log('✅ Process terminated');
                process.exit(0);
            });
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

module.exports = { app, startServer };
