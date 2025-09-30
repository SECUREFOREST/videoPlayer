#!/bin/bash

# Exit on any error
set -e

echo ""
echo "========================================"
echo "    HLS Video Converter for Linux/macOS"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  CentOS/RHEL: sudo yum install nodejs npm"
    echo "  Or visit: https://nodejs.org/"
    exit 1
fi

# Check if FFmpeg is installed
# First check if custom path is set in environment
if [ -n "$FFMPEG_PATH" ]; then
    if [ -f "$FFMPEG_PATH" ]; then
        echo "Using custom FFmpeg path: $FFMPEG_PATH"
    else
        echo "ERROR: Custom FFmpeg path not found: $FFMPEG_PATH"
        exit 1
    fi
elif ! command -v ffmpeg &> /dev/null; then
    echo "ERROR: FFmpeg is not installed or not in PATH"
    echo "Please install FFmpeg:"
    echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  CentOS/RHEL: sudo yum install ffmpeg"
    echo "  Arch: sudo pacman -S ffmpeg"
    echo "  macOS: brew install ffmpeg"
    echo "  Or visit: https://ffmpeg.org/download.html"
    echo ""
    echo "Alternatively, set FFMPEG_PATH environment variable:"
    echo "  export FFMPEG_PATH=/path/to/ffmpeg"
    exit 1
fi

# Check if FFprobe is available
if [ -n "$FFPROBE_PATH" ]; then
    if [ -f "$FFPROBE_PATH" ]; then
        echo "Using custom FFprobe path: $FFPROBE_PATH"
    else
        echo "ERROR: Custom FFprobe path not found: $FFPROBE_PATH"
        exit 1
    fi
elif ! command -v ffprobe &> /dev/null; then
    echo "ERROR: FFprobe is not installed or not in PATH"
    echo "FFprobe is part of FFmpeg package"
    exit 1
fi

# Make the script executable
chmod +x convert-to-hls.js

# Run the HLS converter
echo "Starting HLS conversion..."
echo ""
node convert-to-hls.js

echo ""
echo "Press Enter to exit..."
read
