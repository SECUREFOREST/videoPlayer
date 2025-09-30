# FFmpeg Configuration Guide

This guide explains how to configure custom FFmpeg and FFprobe paths for the video player application.

## Overview

The video player application uses FFmpeg for:
- Thumbnail generation
- Video duration calculation
- HLS video conversion
- Video metadata extraction

By default, the application looks for `ffmpeg` and `ffprobe` in the system PATH. However, you can configure custom paths for these executables.

## Configuration Methods

### 1. Configuration File (Recommended)

Edit the `config.js` file in the root directory:

```javascript
module.exports = {
    // ... other configuration ...
    
    // FFmpeg Configuration
    ffmpeg: {
        // Path to ffmpeg executable (leave empty for system PATH)
        path: '/usr/local/bin/ffmpeg',
        // Path to ffprobe executable (leave empty for system PATH)
        ffprobePath: '/usr/local/bin/ffprobe',
        // Additional ffmpeg options
        options: {
            // Quality settings for thumbnail generation (1-31, lower = better quality)
            thumbnailQuality: 2,
            // Timeout for ffmpeg operations (in milliseconds)
            timeout: 30000,
            // Number of threads to use (0 = auto)
            threads: 0
        }
    }
};
```

### 2. Environment Variables

Set environment variables before starting the application:

#### Linux/macOS:
```bash
export FFMPEG_PATH="/usr/local/bin/ffmpeg"
export FFPROBE_PATH="/usr/local/bin/ffprobe"
node server.js
```

#### Windows:
```cmd
set FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
set FFPROBE_PATH=C:\ffmpeg\bin\ffprobe.exe
node server.js
```

#### Windows PowerShell:
```powershell
$env:FFMPEG_PATH="C:\ffmpeg\bin\ffmpeg.exe"
$env:FFPROBE_PATH="C:\ffmpeg\bin\ffprobe.exe"
node server.js
```

### 3. PM2 Environment Variables

If using PM2, you can set environment variables in the `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'video-player',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        FFMPEG_PATH: '/usr/local/bin/ffmpeg',
        FFPROBE_PATH: '/usr/local/bin/ffprobe'
      }
    }
  ]
};
```

## Common FFmpeg Installation Paths

### Linux
- **Ubuntu/Debian**: `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`
- **CentOS/RHEL**: `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`
- **Arch Linux**: `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`
- **Custom installation**: `/usr/local/bin/ffmpeg`, `/usr/local/bin/ffprobe`

### macOS
- **Homebrew**: `/usr/local/bin/ffmpeg`, `/usr/local/bin/ffprobe`
- **Homebrew (Apple Silicon)**: `/opt/homebrew/bin/ffmpeg`, `/opt/homebrew/bin/ffprobe`
- **MacPorts**: `/opt/local/bin/ffmpeg`, `/opt/local/bin/ffprobe`

### Windows
- **System PATH**: `ffmpeg.exe`, `ffprobe.exe`
- **Custom installation**: `C:\ffmpeg\bin\ffmpeg.exe`, `C:\ffmpeg\bin\ffprobe.exe`
- **Chocolatey**: `C:\ProgramData\chocolatey\bin\ffmpeg.exe`
- **Scoop**: `C:\Users\username\scoop\apps\ffmpeg\current\bin\ffmpeg.exe`

## Verification

The application will automatically validate FFmpeg installation on startup. You'll see output like:

```
✅ FFmpeg found: ffmpeg version 4.4.2
   Path: /usr/local/bin/ffmpeg
✅ FFprobe found: ffprobe version 4.4.2
   Path: /usr/local/bin/ffprobe
```

If FFmpeg is not found, you'll see an error message with installation instructions.

## Troubleshooting

### FFmpeg Not Found
1. Verify FFmpeg is installed: `ffmpeg -version`
2. Check if the path is correct in your configuration
3. Ensure the executable has proper permissions
4. Try using the full path instead of relative paths

### Permission Denied
1. Check file permissions: `ls -la /path/to/ffmpeg`
2. Make sure the executable is readable: `chmod +r /path/to/ffmpeg`
3. On Windows, ensure the path doesn't contain spaces or special characters

### Path Issues on Windows
1. Use forward slashes or double backslashes: `C:/ffmpeg/bin/ffmpeg.exe`
2. Avoid spaces in paths or use quotes: `"C:\Program Files\ffmpeg\bin\ffmpeg.exe"`
3. Use the `.exe` extension explicitly

### Docker/Container Environments
If running in Docker, ensure FFmpeg is installed in the container:

```dockerfile
RUN apt-get update && apt-get install -y ffmpeg
```

Or mount FFmpeg from the host:

```bash
docker run -v /usr/bin/ffmpeg:/usr/bin/ffmpeg -v /usr/bin/ffprobe:/usr/bin/ffprobe your-app
```

## Advanced Configuration

### Custom FFmpeg Builds
If you're using a custom FFmpeg build with specific codecs or hardware acceleration:

```javascript
ffmpeg: {
    path: '/opt/ffmpeg-custom/bin/ffmpeg',
    ffprobePath: '/opt/ffmpeg-custom/bin/ffprobe',
    options: {
        thumbnailQuality: 1, // Higher quality
        timeout: 60000,      // Longer timeout for complex operations
        threads: 4           // Use 4 threads
    }
}
```

### Multiple FFmpeg Versions
If you have multiple FFmpeg versions installed:

```javascript
ffmpeg: {
    path: '/usr/local/ffmpeg-5.1/bin/ffmpeg',  // Use specific version
    ffprobePath: '/usr/local/ffmpeg-5.1/bin/ffprobe'
}
```

## HLS Converter

The HLS converter scripts (`convert-to-hls.js`, `convert-to-hls.sh`, `convert-to-hls.bat`) also respect the same configuration:

- They read from `config.js` if available
- They fall back to environment variables
- They provide helpful error messages if FFmpeg is not found

## Performance Tips

1. **Use hardware acceleration** when available:
   - NVIDIA: `h264_nvenc`
   - Intel: `h264_qsv`
   - AMD: `h264_amf`
   - Apple: `h264_videotoolbox`

2. **Optimize thumbnail quality**:
   - Lower values = better quality, larger files
   - Higher values = lower quality, smaller files
   - Recommended range: 1-5

3. **Adjust timeout** for large files:
   - Increase timeout for very large video files
   - Default: 30 seconds

## Support

If you encounter issues with FFmpeg configuration:

1. Check the application logs for detailed error messages
2. Verify FFmpeg installation: `ffmpeg -version`
3. Test FFprobe: `ffprobe -version`
4. Ensure paths are absolute and executable
5. Check file permissions and ownership

For more information about FFmpeg, visit: https://ffmpeg.org/
