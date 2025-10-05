const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { VIDEO_EXTENSIONS, HLS_EXTENSIONS, VIDEOS_ROOT } = require('./config');

// Path resolution and security
function resolveSafePath(requestedPath) {
    // Handle empty, undefined, or null path
    if (!requestedPath || requestedPath === '' || requestedPath === 'undefined' || requestedPath === 'null') {
        // Don't log warning for empty paths as this is expected behavior
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
    if (fullPath === VIDEOS_ROOT && (normalizedPath.includes('..') || normalizedPath.startsWith('..'))) {
        throw new Error('Access denied: Cannot browse above main folder');
    }

    return fullPath;
}

// File type checking functions
function isVideoFile(extension) {
    return VIDEO_EXTENSIONS.includes(extension.toLowerCase());
}

function isHLSFile(extension) {
    return HLS_EXTENSIONS.includes(extension.toLowerCase());
}

function isVideoOrHLSFile(extension) {
    return isVideoFile(extension) || isHLSFile(extension);
}

// MIME type functions
function getVideoMimeType(extension) {
    const mimeTypes = {
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.m4v': 'video/x-m4v',
        '.flv': 'video/x-flv',
        '.wmv': 'video/x-ms-wmv',
        '.3gp': 'video/3gpp',
        '.ogv': 'video/ogg',
        '.m3u8': 'application/vnd.apple.mpegurl',
        '.ts': 'video/mp2t'
    };
    return mimeTypes[extension.toLowerCase()] || 'video/mp4';
}

// Directory operations
async function ensureDirectoryExists(dirPath) {
    try {
        await fsPromises.access(dirPath);
    } catch (error) {
        await fsPromises.mkdir(dirPath, { recursive: true });
    }
}

// File operations
async function readFileIfExists(filePath) {
    try {
        return await fsPromises.readFile(filePath, 'utf8');
    } catch (error) {
        return null;
    }
}

async function writeFileIfNotExists(filePath, content) {
    try {
        await fsPromises.access(filePath);
        return false; // File exists
    } catch (error) {
        await fsPromises.writeFile(filePath, content);
        return true; // File created
    }
}

module.exports = {
    resolveSafePath,
    isVideoFile,
    isHLSFile,
    isVideoOrHLSFile,
    getVideoMimeType,
    ensureDirectoryExists,
    readFileIfExists,
    writeFileIfNotExists,
    VIDEOS_ROOT
};
