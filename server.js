const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const session = require('express-session');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 4000;
const VIDEOS_ROOT = path.join(__dirname, 'videos');
const DURATIONS_CACHE_FILE = path.join(__dirname, 'video-durations.json');

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

// Password protection middleware
const PASSWORD = 'bringbeerforpassword';

// Check if user is authenticated
function requireAuth(req, res, next) {
    // Skip auth for login endpoint and static files
    if (req.path === '/login' || req.path.startsWith('/api/login') || req.path.startsWith('/static/')) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
        const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('ascii');
        const [username, password] = credentials.split(':');

        if (password === PASSWORD) {
            return next();
        }
    }

    // Check for session-based auth
    if (req.session && req.session.authenticated) {
        return next();
    }

    // Return 401 for API requests, redirect for page requests
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
    } else {
        return res.redirect('/login');
    }
}

// Login page
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en" data-bs-theme="dark">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="description" content="Login to access the Video Player">
            <meta name="theme-color" content="#000000">
            <title>Login - Tie them up!</title>
            
            <!-- Bootstrap 5 CSS -->
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
            <!-- Bootstrap Icons -->
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
            <!-- Font Awesome -->
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <!-- Google Fonts -->
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <!-- Custom CSS -->
            <link rel="stylesheet" href="style-bootstrap.css?v=6">
            
            <style>
                body { 
                    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); 
                    min-height: 100vh; 
                    font-family: 'Inter', sans-serif;
                }
                .login-container { 
                    min-height: 100vh; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                }
                .login-card { 
                    background: rgba(33, 37, 41, 0.95); 
                    backdrop-filter: blur(10px); 
                    border-radius: 20px; 
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    border: 1px solid #495057;
                }
                .login-header { 
                    background: linear-gradient(135deg, #B91C1C 0%, #DC2626 100%); 
                    color: white; 
                    border-radius: 20px 20px 0 0; 
                    border: none;
                }
                /* Login-specific styles - main styles come from style-bootstrap.css */
                .login-card {
                    background: rgba(33, 37, 41, 0.95) !important;
                }
                .navbar-brand {
                    font-weight: 700;
                    font-size: 1.5rem;
                }
            </style>
        </head>
        <body class="bg-dark text-light">
            <!-- Navigation -->
            <nav class="navbar navbar-expand-lg navbar-dark bg-dark border-bottom">
                <div class="container-fluid">
                    <a class="navbar-brand d-flex align-items-center" href="#">
                        <i class="fas fa-link me-2" style="color: #B91C1C;"></i>
                        <span class="fw-bold">Tie them up!</span>
                    </a>
                </div>
            </nav>

            <div class="container">
                <div class="row justify-content-center">
                    <div class="col-md-6 col-lg-4">
                        <div class="card login-card mt-5">
                            <div class="card-header login-header text-center py-4">
                                <h3 class="mb-0"><i class="fas fa-lock me-2"></i>Access Required</h3>
                                <p class="mb-0 mt-2">Enter password to continue</p>
                            </div>
                            <div class="card-body p-4">
                                <form method="POST" action="/api/login">
                                    <div class="mb-3">
                                        <label for="password" class="form-label">
                                            <i class="fas fa-key me-2"></i>Password
                                        </label>
                                        <input type="password" 
                                               class="form-control bg-dark" 
                                               id="password" 
                                               name="password" 
                                               placeholder="Enter your password..."
                                               required 
                                               autofocus>
                                    </div>
                                    <button type="submit" class="btn btn-primary w-100">
                                        <i class="fas fa-sign-in-alt me-2"></i>Login
                                    </button>
                                </form>
                                ${req.query.error ? '<div class="alert alert-danger mt-3"><i class="fas fa-exclamation-triangle me-2"></i>Invalid password</div>' : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Login API endpoint
app.post('/api/login', (req, res) => {
    const { password } = req.body;

    if (password === PASSWORD) {
        req.session.authenticated = true;
        res.redirect('/');
    } else {
        res.redirect('/login?error=1');
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Apply authentication to all routes except login
app.use(requireAuth);

// Debug route to catch all requests
app.use((req, res, next) => {
    if (req.url.startsWith('/thumbnails/')) {
        // console.log('=== THUMBNAIL REQUEST INTERCEPTED ===');
        // console.log('URL:', req.url);
        // console.log('Method:', req.method);
    }
    next();
});

// Custom thumbnail serving with URL decoding (MUST come before static file serving)
app.get('/thumbnails/*', (req, res) => {
    // console.log('=== THUMBNAIL REQUEST RECEIVED ===');
    // console.log('URL:', req.url);
    // console.log('Params:', req.params);
    // console.log('Original URL:', req.originalUrl);

    try {
        const filename = decodeURIComponent(req.params[0]);
        const thumbnailPath = path.join(__dirname, 'thumbnails', filename);

        // console.log('Thumbnail request - Original:', req.params[0]);
        // console.log('Thumbnail request - Decoded:', filename);
        // console.log('Thumbnail request - Full path:', thumbnailPath);

        if (fs.existsSync(thumbnailPath)) {
            res.sendFile(thumbnailPath);
        } else {
            // Try with quotes around the filename (ffmpeg sometimes adds quotes)
            const quotedFilename = `'${filename}'`;
            const quotedThumbnailPath = path.join(__dirname, 'thumbnails', quotedFilename);
            console.log('Trying quoted filename:', quotedFilename);
            console.log('Trying quoted path:', quotedThumbnailPath);

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

// Serve static files from the public directory on root path (AFTER custom routes)
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

// Serve static files on root path with large file support
app.use('/videos', express.static(path.join(__dirname, 'videos'), {
    setHeaders: (res, filePath) => {
        // Set appropriate headers for video files
        if (filePath.match(/\.(mp4|avi|mov|mkv|webm|m4v|flv|wmv|3gp|ogv)$/i)) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
    },
    maxAge: '1y' // Cache for 1 year
}));

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

// Helper function to get thumbnail URL (only returns existing thumbnails)
function getThumbnailUrl(videoPath) {
    try {
        const ext = path.extname(videoPath).toLowerCase();
        if (!isVideoFile(ext)) {
            console.log(`  Not a video file: ${ext}`);
            return null;
        }

        // Handle both absolute and relative paths
        let relativePath;
        if (path.isAbsolute(videoPath)) {
            // Absolute path - convert to relative
            relativePath = path.relative(VIDEOS_ROOT, videoPath);
        } else {
            // Already relative path - use as is
            relativePath = videoPath;
        }

        // Remove file extension before creating safe name
        const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
        const safeThumbnailName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_') + '_thumb.jpg';
        const thumbnailPath = path.join(__dirname, 'thumbnails', safeThumbnailName);

        // Check if thumbnail exists
        if (fs.existsSync(thumbnailPath)) {
            const thumbnailFilename = path.basename(thumbnailPath);
            return `/thumbnails/${encodeURIComponent(thumbnailFilename)}`;
        }

        // Thumbnail doesn't exist (should have been generated on startup)
        return null;
    } catch (error) {
        console.error('Error getting thumbnail URL:', error);
        return null;
    }
}

// Duration cache management
let durationCache = {};

// Load duration cache from file
async function loadDurationCache() {
    try {
        await fsPromises.access(DURATIONS_CACHE_FILE);
        const data = await fsPromises.readFile(DURATIONS_CACHE_FILE, 'utf8');
        durationCache = JSON.parse(data);
        console.log(`📊 Loaded ${Object.keys(durationCache).length} video durations from cache`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            durationCache = {};
            console.log('📊 No duration cache found, starting fresh');
        } else {
            console.error('Error loading duration cache:', error);
            durationCache = {};
        }
    }
}

// Save duration cache to file
async function saveDurationCache() {
    try {
        await fsPromises.writeFile(DURATIONS_CACHE_FILE, JSON.stringify(durationCache, null, 2));
        console.log(`💾 Saved ${Object.keys(durationCache).length} video durations to cache`);
    } catch (error) {
        console.error('Error saving duration cache:', error);
    }
}

// Scan all videos and build duration cache
async function buildDurationCache() {
    console.log('🚀 Building video duration cache...');
    const startTime = Date.now();
    let processedCount = 0;
    let cachedCount = 0;
    let newCount = 0;

    try {
        async function scanDirectory(dirPath) {
            const items = await fsPromises.readdir(dirPath, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                
                if (item.isDirectory()) {
                    await scanDirectory(fullPath);
                } else {
                    const ext = path.extname(item.name).toLowerCase();
                    if (isVideoFile(ext)) {
                        const relativePath = path.relative(VIDEOS_ROOT, fullPath);
                        processedCount++;
                        
                        if (durationCache[relativePath]) {
                            cachedCount++;
                        } else {
                            newCount++;
                        }
                    }
                }
            }
        }

        // First pass: count videos
        await scanDirectory(VIDEOS_ROOT);
        console.log(`📊 Found ${processedCount} videos (${cachedCount} cached, ${newCount} need calculation)`);

        if (newCount === 0) {
            console.log('✅ All video durations are already cached!');
            return;
        }

        // Second pass: calculate missing durations
        let calculatedCount = 0;
        async function calculateMissingDurations(dirPath) {
            const items = await fsPromises.readdir(dirPath, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                
                if (item.isDirectory()) {
                    await calculateMissingDurations(fullPath);
                } else {
                    const ext = path.extname(item.name).toLowerCase();
                    if (isVideoFile(ext)) {
                        const relativePath = path.relative(VIDEOS_ROOT, fullPath);
                        
                        if (!durationCache[relativePath]) {
                            // Calculate duration asynchronously for startup
                            try {
                                const durationCommand = `ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fullPath}"`;
                                const durationOutput = await execAsync(durationCommand);
                                const duration = parseFloat(durationOutput.stdout.trim());
                                
                                if (duration && duration > 0) {
                                    durationCache[relativePath] = duration;
                                    calculatedCount++;
                                    console.log(`✅ Cached duration for ${path.basename(fullPath)}: ${Math.floor(duration/60)}:${Math.floor(duration%60).toString().padStart(2, '0')}`);
                                }
                            } catch (error) {
                                console.log(`❌ Could not get duration for ${path.basename(fullPath)}: ${error.message}`);
                            }
                        }
                    }
                }
            }
        }

        await calculateMissingDurations(VIDEOS_ROOT);
        
        // Save the updated cache
        await saveDurationCache();
        
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        console.log(`🎉 Duration cache build complete!`);
        console.log(`   📊 Total videos: ${processedCount}`);
        console.log(`   ✅ Already cached: ${cachedCount}`);
        console.log(`   🔍 Newly calculated: ${calculatedCount}`);
        console.log(`   ⏱️  Time taken: ${duration}s`);
        
    } catch (error) {
        console.error('Error building duration cache:', error);
    }
}

// Get video duration using cache first, then ffprobe if needed
async function getVideoDuration(videoPath) {
    // Check cache first
    const relativePath = path.relative(VIDEOS_ROOT, videoPath);
    if (durationCache[relativePath]) {
        // console.log('📋 Using cached duration for:', path.basename(videoPath), ':', durationCache[relativePath], 'seconds');
        return durationCache[relativePath];
    }

    // Not in cache, calculate using ffprobe
    try {
        const durationCommand = `ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
        console.log('🔍 Calculating duration for:', path.basename(videoPath));
        
        const durationOutput = await execAsync(durationCommand);
        
        // execAsync returns { stdout, stderr }, we need stdout
        const stdout = durationOutput.stdout || durationOutput;
        const duration = parseFloat(stdout.trim());
        
        if (duration && duration > 0) {
            // Cache the result
            durationCache[relativePath] = duration;
            await saveDurationCache(); // Save cache immediately
            console.log('✅ Duration found and cached:', duration, 'seconds for', path.basename(videoPath));
            return duration;
        }
        console.log('❌ No valid duration found for', path.basename(videoPath));
        return null;
    } catch (error) {
        console.log('❌ Could not get video duration for', path.basename(videoPath), ':', error.message);
        return null;
    }
}

// Async thumbnail generation function
async function generateThumbnailAsync(videoPath, thumbnailPath) {
    try {
        // Get video duration to calculate middle timestamp
        let middleTimestamp = '00:00:30'; // fallback
        try {
            const durationCommand = `ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
            const durationOutput = await execAsync(durationCommand);
            const duration = parseFloat(durationOutput.trim());

            if (duration && duration > 0) {
                // Calculate middle timestamp in seconds
                const middleSeconds = Math.floor(duration / 2);
                const hours = Math.floor(middleSeconds / 3600);
                const minutes = Math.floor((middleSeconds % 3600) / 60);
                const seconds = middleSeconds % 60;
                middleTimestamp = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                console.log(`Generating thumbnail for ${path.basename(videoPath)} at: ${middleTimestamp}`);
            }
        } catch (durationError) {
            console.log('Could not get video duration, using fallback timestamp:', middleTimestamp);
        }

        // Try multiple timestamps if the first attempt fails
        const fallbackTimestamps = [middleTimestamp, '00:00:30', '00:00:20', '00:00:10'];
        
        for (let i = 0; i < fallbackTimestamps.length; i++) {
            const timestamp = fallbackTimestamps[i];
            const isRetry = i > 0;
            
            try {
                if (isRetry) {
                    console.log(`Retrying thumbnail generation for ${path.basename(videoPath)} at: ${timestamp}`);
                }
                
                // Generate thumbnail using ffmpeg
                const command = `ffmpeg -i "${videoPath}" -ss ${timestamp} -vframes 1 -q:v 2 "${thumbnailPath}"`;
                await execAsync(command);

                // Validate that thumbnail was actually created and is a valid image
                try {
                    await fsPromises.access(thumbnailPath);
                    const stats = await fsPromises.stat(thumbnailPath);
                    if (stats.size > 0) {
                        console.log(`Thumbnail generated successfully: ${path.basename(thumbnailPath)} at ${timestamp}`);
                        return true;
                    } else {
                        console.error(`Generated thumbnail is empty at ${timestamp}: ${path.basename(thumbnailPath)}`);
                        try {
                            await fsPromises.unlink(thumbnailPath); // Remove empty file
                        } catch (unlinkError) {
                            // Ignore unlink errors
                        }
                    }
                } catch (accessError) {
                    console.error(`Thumbnail file was not created at ${timestamp}: ${path.basename(thumbnailPath)}`);
                }
            } catch (ffmpegError) {
                console.error(`Failed to generate thumbnail at ${timestamp} for ${path.basename(videoPath)}:`, ffmpegError.message);
                // Continue to next timestamp
            }
        }
        
        // If all timestamps failed
        console.error(`All thumbnail generation attempts failed for ${path.basename(videoPath)}`);
        return false;
    } catch (error) {
        console.error(`Unexpected error generating thumbnail for ${path.basename(videoPath)}:`, error.message);
        return false;
    }
}

// Function to scan all directories and find videos without thumbnails
async function findVideosWithoutThumbnails(dirPath, videoList = [], maxVideos = 10000) {
    try {
        // Prevent memory issues with very large collections
        if (videoList.length >= maxVideos) {
            console.warn(`Reached maximum video limit (${maxVideos}), stopping scan`);
            return videoList;
        }

        const items = await fsPromises.readdir(dirPath, { withFileTypes: true });

        for (const item of items) {
            // Check memory limit on each iteration
            if (videoList.length >= maxVideos) break;

            const fullPath = path.join(dirPath, item.name);

            if (item.isDirectory()) {
                // Recursively scan subdirectories
                await findVideosWithoutThumbnails(fullPath, videoList, maxVideos);
            } else if (item.isFile()) {
                const ext = path.extname(item.name).toLowerCase();
                if (isVideoFile(ext)) {
                    // Check if thumbnail exists
                    const videoName = path.basename(fullPath, ext);
                    const cleanVideoName = videoName.replace(/['"]/g, '');
                    // Use relative path to avoid filename collisions
                    const relativePath = path.relative(VIDEOS_ROOT, fullPath);
                    // Remove file extension before creating safe name
                    const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
                    const safeThumbnailName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_') + '_thumb.jpg';
                    const thumbnailPath = path.join(__dirname, 'thumbnails', safeThumbnailName);

                    try {
                        await fsPromises.access(thumbnailPath);
                        // Thumbnail exists, skip
                    } catch (accessError) {
                        // Thumbnail doesn't exist, add to list
                        videoList.push({
                            videoPath: fullPath,
                            thumbnailPath: thumbnailPath,
                            relativePath: path.relative(VIDEOS_ROOT, fullPath)
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.warn(`Could not scan directory ${dirPath}:`, error.message);
    }

    return videoList;
}

// Function to generate all missing thumbnails on startup
async function generateAllMissingThumbnails() {
    console.log('🔍 Scanning for videos without thumbnails...');

    // Create thumbnails directory if it doesn't exist
    const thumbnailsDir = path.join(__dirname, 'thumbnails');
    try {
        await fsPromises.access(thumbnailsDir);
    } catch (accessError) {
        await fsPromises.mkdir(thumbnailsDir, { recursive: true });
        console.log('📁 Created thumbnails directory');
    }

    // Find all videos without thumbnails
    const videosWithoutThumbnails = await findVideosWithoutThumbnails(VIDEOS_ROOT);

    if (videosWithoutThumbnails.length === 0) {
        console.log('✅ All videos already have thumbnails!');
        return;
    }

    console.log(`📹 Found ${videosWithoutThumbnails.length} videos without thumbnails`);
    console.log('🚀 Starting thumbnail generation...');

    // Process thumbnails in batches to avoid overwhelming the system
    const batchSize = 3;
    let processed = 0;
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < videosWithoutThumbnails.length; i += batchSize) {
        const batch = videosWithoutThumbnails.slice(i, i + batchSize);

        // Process batch concurrently
        const batchPromises = batch.map(async (video) => {
            try {
                const success = await generateThumbnailAsync(video.videoPath, video.thumbnailPath);
                processed++;
                if (success) {
                    successful++;
                    console.log(`✅ [${processed}/${videosWithoutThumbnails.length}] ${video.relativePath}`);
                } else {
                    failed++;
                    console.log(`❌ [${processed}/${videosWithoutThumbnails.length}] ${video.relativePath}`);
                }
            } catch (error) {
                processed++;
                failed++;
                console.log(`❌ [${processed}/${videosWithoutThumbnails.length}] ${video.relativePath} - ${error.message}`);
            }
        });

        // Wait for current batch to complete before starting next batch
        await Promise.all(batchPromises);

        // Small delay between batches to prevent system overload
        if (i + batchSize < videosWithoutThumbnails.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log(`🎉 Thumbnail generation complete!`);
    console.log(`   📊 Total processed: ${processed}`);
    console.log(`   ✅ Successful: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);

        // Cleanup: Remove any empty or corrupted thumbnail files
        if (failed > 0) {
            console.log('🧹 Cleaning up failed thumbnail files...');
            try {
                const thumbnailsDir = path.join(__dirname, 'thumbnails');
                const files = await fsPromises.readdir(thumbnailsDir);
                let cleaned = 0;

                for (const file of files) {
                    const filePath = path.join(thumbnailsDir, file);
                    const stats = await fsPromises.stat(filePath);
                    if (stats.size === 0) {
                        await fsPromises.unlink(filePath);
                        cleaned++;
                    }
                }

                if (cleaned > 0) {
                    console.log(`🧹 Cleaned up ${cleaned} empty thumbnail files`);
                }
            } catch (cleanupError) {
                console.warn('⚠️  Error during cleanup:', cleanupError.message);
            }
        }

    // Cleanup: Remove incorrectly named thumbnails (with .mp4 in filename)
    console.log('🧹 Cleaning up incorrectly named thumbnails...');
    try {
        const thumbnailsDir = path.join(__dirname, 'thumbnails');
        const files = await fsPromises.readdir(thumbnailsDir);
        let cleaned = 0;

        for (const file of files) {
            // Check if filename contains .mp4 (incorrect naming)
            if (file.includes('.mp4_thumb.jpg')) {
                const filePath = path.join(thumbnailsDir, file);
                await fsPromises.unlink(filePath);
                cleaned++;
                console.log(`🗑️  Removed incorrectly named thumbnail: ${file}`);
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} incorrectly named thumbnail files`);
            console.log('🔄 You may need to restart the server to regenerate these thumbnails with correct names');
        }
    } catch (cleanupError) {
        console.warn('⚠️  Error during cleanup:', cleanupError.message);
    }
}

// API endpoint to get directory contents
app.get('/api/browse', async (req, res) => {
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
        const items = await fsPromises.readdir(directoryPath, { withFileTypes: true });

        let result = await Promise.all(items
            .filter(item => !item.name.startsWith('._'))
            .map(async item => {
                const fullPath = path.join(directoryPath, item.name);
                const stats = await fsPromises.stat(fullPath);
                const extension = path.extname(item.name).toLowerCase();

                let fileCount = null;
                if (item.isDirectory()) {
                    try {
                        const dirContents = await fsPromises.readdir(fullPath, { withFileTypes: true });
                        fileCount = dirContents.filter(dirItem => !dirItem.name.startsWith('._')).length;
                    } catch (err) {
                        fileCount = 0; // Directory not accessible
                    }
                }

                const result = {
                    name: item.name,
                    path: path.relative(VIDEOS_ROOT, fullPath), // <-- RELATIVE path
                    isDirectory: item.isDirectory(),
                    isFile: item.isFile(),
                    size: stats.size,
                    modified: stats.mtime,
                    extension: extension,
                    isVideo: isVideoFile(extension),
                    mimeType: isVideoFile(extension) ? getVideoMimeType(extension) : null,
                    fileCount: fileCount
                };

                // Add thumbnail URL and duration for video files
                if (isVideoFile(extension)) {
                    result.thumbnailUrl = getThumbnailUrl(fullPath);
                    result.duration = await getVideoDuration(fullPath);
                    console.log(`Video: ${item.name}, Duration: ${result.duration}`);
                } else {
                    result.duration = null; // Ensure non-videos have null duration
                }

                return result;
            }));

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
            }
        } else {
            // For 'all' filter, only show videos and directories (exclude other files)
            result = result.filter(item => item.isVideo || item.isDirectory);
        }

        // Filter out empty directories
        result = result.filter(item => {
            if (item.isDirectory) {
                return item.fileCount > 0;
            }
            return true; // Keep all files
        });

        // Apply sorting
        result.sort((a, b) => {
            let comparison = 0;

            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'duration') {
                // For duration sorting, directories should be sorted by name since they don't have duration
                if (a.isDirectory && b.isDirectory) {
                    comparison = a.name.localeCompare(b.name);
                } else if (a.isDirectory && !b.isDirectory) {
                    comparison = -1; // Directories first
                } else if (!a.isDirectory && b.isDirectory) {
                    comparison = 1; // Directories first
                } else {
                    comparison = (a.duration || 0) - (b.duration || 0);
                }
            } else if (sortBy === 'modified') {
                comparison = new Date(a.modified) - new Date(b.modified);
            }

            // For non-duration sorts, sort directories first, then files
            if (sortBy !== 'duration') {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
            }

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
app.get('/api/video-info', async (req, res) => {
    const relativePath = req.query.path;

    if (!relativePath) {
        return res.status(400).json({ error: 'Video path is required' });
    }

    try {
        const videoPath = resolveSafePath(relativePath);
        const stats = await fsPromises.stat(videoPath);
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
            mimeType: getVideoMimeType(ext),
            isVideo: true
        });
    } catch (error) {
        console.error('Video info error:', error);
        if (error.message.includes('Access denied')) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(500).json({ error: 'Unable to read video file' });
    }
});

// API endpoint to check server status
app.get('/api/server-status', (req, res) => {
    res.json({
        generatingThumbnails: false, // This would be set to true during startup generation
        serverReady: true,
        largeFileSupport: true,
        maxFileSize: '10GB'
    });
});

// API endpoint to check video file size and streaming capability
app.get('/api/video-stream-info', async (req, res) => {
    const relativePath = req.query.path;

    if (!relativePath) {
        return res.status(400).json({ error: 'Video path is required' });
    }

    try {
        const videoPath = resolveSafePath(relativePath);
        const stats = await fsPromises.stat(videoPath);
        const ext = path.extname(videoPath).toLowerCase();

        if (!isVideoFile(ext)) {
            return res.status(400).json({ error: 'File is not a supported video format' });
        }

        const fileSizeGB = stats.size / (1024 * 1024 * 1024);
        const isLargeFile = fileSizeGB > 2;

        res.json({
            path: path.relative(VIDEOS_ROOT, videoPath),
            size: stats.size,
            sizeGB: Math.round(fileSizeGB * 100) / 100,
            isLargeFile: isLargeFile,
            supportsRangeRequests: true,
            streamingOptimized: true,
            maxSupportedSize: '10GB',
            name: path.basename(videoPath),
            extension: ext,
            mimeType: getVideoMimeType(ext)
        });
    } catch (error) {
        console.error('Video stream info error:', error);
        if (error.message.includes('Access denied')) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(500).json({ error: 'Unable to read video file' });
    }
});

// API endpoint to check thumbnail status
app.get('/api/thumbnail-status', (req, res) => {
    const relativePath = req.query.path;

    if (!relativePath) {
        return res.status(400).json({ error: 'Video path is required' });
    }

    try {
        const videoPath = resolveSafePath(relativePath);
        const ext = path.extname(videoPath).toLowerCase();

        if (!isVideoFile(ext)) {
            return res.status(400).json({ error: 'File is not a supported video format' });
        }

        const videoName = path.basename(videoPath, ext);
        const cleanVideoName = videoName.replace(/['"]/g, '');
        // Use relative path to avoid filename collisions
        const relativePath = path.relative(VIDEOS_ROOT, videoPath);
        // Remove file extension before creating safe name
        const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
        const safeThumbnailName = pathWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_') + '_thumb.jpg';
        const thumbnailPath = path.join(__dirname, 'thumbnails', safeThumbnailName);

        if (fs.existsSync(thumbnailPath)) {
            const thumbnailFilename = path.basename(thumbnailPath);
            const thumbnailUrl = `/thumbnails/${encodeURIComponent(thumbnailFilename)}`;
            return res.json({
                thumbnailUrl: thumbnailUrl,
                exists: true
            });
        } else {
            return res.json({
                thumbnailUrl: null,
                exists: false
            });
        }
    } catch (error) {
        if (error.message.includes('Access denied')) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(500).json({ error: 'Unable to check thumbnail status' });
    }
});

// API endpoint to search files recursively
app.get('/api/search', async (req, res) => {
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

        async function searchDirectory(dirPath) {
            try {
                const items = await fsPromises.readdir(dirPath, { withFileTypes: true });

                for (const item of items) {
                    const fullPath = path.join(dirPath, item.name);

                    if (item.isDirectory()) {
                        // Check if directory name matches search
                        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
                        if (matchesSearch && (fileType === 'all' || fileType === 'directories')) {
                            const stats = await fsPromises.stat(fullPath);
                            const resultItem = {
                                name: item.name,
                                path: path.relative(VIDEOS_ROOT, fullPath),
                                isDirectory: true,
                                isFile: false,
                                size: stats.size,
                                modified: stats.mtime,
                                extension: '',
                                isVideo: false,
                                mimeType: null,
                                relativePath: path.relative(searchPath, fullPath)
                            };
                            results.push(resultItem);
                        }
                        await searchDirectory(fullPath);
                    } else {
                        const ext = path.extname(item.name).toLowerCase();
                        const stats = await fsPromises.stat(fullPath);

                        const isVideo = isVideoFile(ext);
                        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());

                        if (matchesSearch) {
                            if (fileType === 'all' ||
                                (fileType === 'videos' && isVideo)) {
                                
                                const resultItem = {
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
                                };
                                
                                // Add thumbnail URL and duration for videos
                                if (isVideo) {
                                    resultItem.thumbnailUrl = getThumbnailUrl(fullPath);
                                    resultItem.duration = await getVideoDuration(fullPath);
                                }
                                
                                results.push(resultItem);
                            }
                        }
                    }
                }
            } catch (error) {
                // Skip directories we can't read
            }
        }

        await searchDirectory(searchPath);

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
app.get('/api/playlists', async (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        try {
            await fsPromises.access(playlistsFile);
            const data = await fsPromises.readFile(playlistsFile, 'utf8');
            const playlists = JSON.parse(data);
            
            // Add thumbnail URLs and duration for playlist videos
            if (playlists.playlists) {
                await Promise.all(playlists.playlists.map(async playlist => {
                    if (playlist.videos) {
                        await Promise.all(playlist.videos.map(async video => {
                            if (video.path) {
                                const ext = path.extname(video.path).toLowerCase();
                                if (isVideoFile(ext)) {
                                    // Convert relative path to absolute path for thumbnail generation
                                    const absolutePath = path.isAbsolute(video.path) ? video.path : path.join(VIDEOS_ROOT, video.path);
                                    video.thumbnailUrl = getThumbnailUrl(absolutePath);
                                    video.duration = await getVideoDuration(absolutePath);
                                    video.isVideo = true;
                                } else {
                                    video.isVideo = false;
                                }
                            }
                        }));
                    }
                }));
            }
            
            res.json(playlists);
        } catch (accessError) {
            res.json({ playlists: [] });
        }
    } catch (error) {
        res.status(500).json({ error: 'Unable to load playlists' });
    }
});

app.post('/api/playlists', async (req, res) => {
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
        try {
            await fsPromises.access(playlistsFile);
            const data = await fsPromises.readFile(playlistsFile, 'utf8');
            playlists = JSON.parse(data);
        } catch (accessError) {
            // File doesn't exist, use empty playlists
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
        await fsPromises.writeFile(playlistsFile, JSON.stringify(playlists, null, 2));

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

// API endpoint to update playlists order
app.put('/api/playlists', (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        const { playlists: newPlaylists } = req.body;

        // Validate input
        if (!Array.isArray(newPlaylists)) {
            return res.status(400).json({ error: 'Playlists must be an array' });
        }

        // Validate that all playlists have required fields
        for (const playlist of newPlaylists) {
            if (!playlist.id || !playlist.name || !playlist.videos || !playlist.created || !playlist.modified) {
                return res.status(400).json({ error: 'Invalid playlist data structure' });
            }
        }

        // Update the playlists with new order
        const playlists = { playlists: newPlaylists };
        fs.writeFileSync(playlistsFile, JSON.stringify(playlists, null, 2));

        res.json({ success: true, playlists: newPlaylists });
    } catch (error) {
        console.error('Error updating playlists order:', error);
        res.status(500).json({ error: 'Unable to update playlists order' });
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

// API endpoint to remove video from playlist (POST version)
app.post('/api/playlists/:id/remove-video', (req, res) => {
    try {
        const playlistsFile = path.join(__dirname, 'playlists.json');
        const { id } = req.params;
        const { videoPath } = req.body;

        // Validate ID
        if (!id || typeof id !== 'string' || id.trim().length === 0) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }

        if (!videoPath) {
            return res.status(400).json({ error: 'Video path is required' });
        }

        console.log('Remove video request - Playlist ID:', id);
        console.log('Remove video request - Video path:', videoPath);

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
        console.log('Looking for video with path:', videoPath);

        const initialLength = playlist.videos.length;
        playlist.videos = playlist.videos.filter(video => video.path !== videoPath);

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

// API endpoint to remove video from playlist (DELETE version - keeping for compatibility)
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
app.get('/api/favorites', async (req, res) => {
    try {
        const favoritesFile = path.join(__dirname, 'favorites.json');
        if (fs.existsSync(favoritesFile)) {
            const data = fs.readFileSync(favoritesFile, 'utf8');
            const favorites = JSON.parse(data);
            
            // Add thumbnail URLs and duration for video favorites
            if (favorites.favorites) {
                await Promise.all(favorites.favorites.map(async favorite => {
                    if (favorite.path) {
                        const ext = path.extname(favorite.path).toLowerCase();
                        if (isVideoFile(ext)) {
                            // Convert relative path to absolute path for thumbnail generation
                            const absolutePath = path.isAbsolute(favorite.path) ? favorite.path : path.join(VIDEOS_ROOT, favorite.path);
                            favorite.thumbnailUrl = getThumbnailUrl(absolutePath);
                            favorite.duration = await getVideoDuration(absolutePath);
                            favorite.isVideo = true;
                        } else {
                            favorite.isVideo = false;
                        }
                    }
                }));
            }
            
            res.json(favorites);
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

// API endpoint to update favorites order
app.put('/api/favorites', (req, res) => {
    try {
        const favoritesFile = path.join(__dirname, 'favorites.json');
        const { favorites: newFavorites } = req.body;

        // Validate input
        if (!Array.isArray(newFavorites)) {
            return res.status(400).json({ error: 'Favorites must be an array' });
        }

        // Validate that all favorites have required fields
        for (const favorite of newFavorites) {
            if (!favorite.id || !favorite.name || !favorite.path || !favorite.added) {
                return res.status(400).json({ error: 'Invalid favorite data structure' });
            }
        }

        // Update the favorites with new order
        const favorites = { favorites: newFavorites };
        fs.writeFileSync(favoritesFile, JSON.stringify(favorites, null, 2));

        res.json({ success: true, favorites: newFavorites });
    } catch (error) {
        console.error('Error updating favorites order:', error);
        res.status(500).json({ error: 'Unable to update favorites order' });
    }
});

// Serve the main HTML file on root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Video directory: ${VIDEOS_ROOT}`);
    console.log(`🎬 Browse files and watch videos!`);

    // Load duration cache
    await loadDurationCache();

    // Generate missing thumbnails and build duration cache on startup
    try {
        await generateAllMissingThumbnails();
        console.log(`✨ Thumbnails are up to date.`);
        
        // Build duration cache
        await buildDurationCache();
        console.log(`✨ Duration cache is ready.`);
        
        console.log(`🎉 Server ready! All thumbnails and durations are up to date.`);
    } catch (error) {
        console.error('❌ Error during startup processing:', error);
        console.log(`⚠️  Server is running but some thumbnails or durations may be missing.`);
    }
});
