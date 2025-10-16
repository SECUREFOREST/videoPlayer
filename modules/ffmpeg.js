const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('../config');

const execAsync = promisify(exec);

// FFmpeg path resolution functions
function getFFmpegPath() {
    if (config.ffmpeg && config.ffmpeg.path) {
        return config.ffmpeg.path;
    }
    // Fallback to system PATH
    return 'ffmpeg';
}

function getFFprobePath() {
    if (config.ffmpeg && config.ffmpeg.ffprobePath) {
        return config.ffmpeg.ffprobePath;
    }
    // Fallback to system PATH
    return 'ffprobe';
}

// Validate ffmpeg installation
async function validateFFmpegInstallation() {
    const ffmpegPath = getFFmpegPath();
    const ffprobePath = getFFprobePath();

    try {
        // Test ffmpeg
        const ffmpegCommand = `"${ffmpegPath}" -version`;
        await execAsync(ffmpegCommand);
        console.log(`✅ FFmpeg found at: ${ffmpegPath}`);

        // Test ffprobe
        const ffprobeCommand = `"${ffprobePath}" -version`;
        await execAsync(ffprobeCommand);
        console.log(`✅ FFprobe found at: ${ffprobePath}`);

        return true;
    } catch (error) {
        console.error('❌ FFmpeg/FFprobe not found. Please install FFmpeg:');
        console.error('   macOS: brew install ffmpeg');
        console.error('   Ubuntu: sudo apt install ffmpeg');
        console.error('   Windows: Download from https://ffmpeg.org/download.html');
        return false;
    }
}

module.exports = {
    getFFmpegPath,
    getFFprobePath,
    validateFFmpegInstallation,
    execAsync
};
