/**
 * Application Configuration
 * Modify these settings to customize your video player application
 */

module.exports = {
    // Application Identity
    name: 'Tie them up!',
    description: 'Advanced Video Player',
    
    // Security Settings
    password: 'bringbeerforpassword',
    
    // Server Settings
    port: process.env.PORT || 4000,
    
    // FFmpeg Configuration
    ffmpeg: {
        // Path to ffmpeg executable (leave empty for system PATH)
        path: process.env.FFMPEG_PATH || '',
        // Path to ffprobe executable (leave empty for system PATH)
        ffprobePath: process.env.FFPROBE_PATH || '',
        // Additional ffmpeg options
        options: {
            // Quality settings for thumbnail generation
            thumbnailQuality: 2,
            // Timeout for ffmpeg operations (in milliseconds)
            timeout: 30000,
            // Number of threads to use (0 = auto)
            threads: 0
        }
    }
};
