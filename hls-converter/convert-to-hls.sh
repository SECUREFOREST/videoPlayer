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
if ! command -v ffmpeg &> /dev/null; then
    echo "ERROR: FFmpeg is not installed or not in PATH"
    echo "Please install FFmpeg:"
    echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  CentOS/RHEL: sudo yum install ffmpeg"
    echo "  Arch: sudo pacman -S ffmpeg"
    echo "  macOS: brew install ffmpeg"
    echo "  Or visit: https://ffmpeg.org/download.html"
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
