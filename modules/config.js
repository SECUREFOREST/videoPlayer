const path = require('path');

// Load configuration
const config = require('../config');

// Application configuration
const APP_CONFIG = {
    name: config.name,
    description: config.description,
    password: config.password,
    port: config.port
};

// File paths
const VIDEOS_ROOT = path.join(__dirname, '..', 'videos');
const DURATIONS_CACHE_FILE = path.join(__dirname, '..', 'video-durations.json');

// Supported file extensions
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.flv', '.wmv', '.3gp', '.ogv'];
const HLS_EXTENSIONS = ['.m3u8'];

module.exports = {
    APP_CONFIG,
    VIDEOS_ROOT,
    DURATIONS_CACHE_FILE,
    VIDEO_EXTENSIONS,
    HLS_EXTENSIONS
};
