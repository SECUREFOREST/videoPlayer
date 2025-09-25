@echo off
setlocal enabledelayedexpansion
echo.
echo ========================================
echo    HLS Video Converter for Windows
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if FFmpeg is installed
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: FFmpeg is not installed or not in PATH
    echo Please install FFmpeg from https://ffmpeg.org/download.html
    echo Or use: winget install ffmpeg
    pause
    exit /b 1
)

REM Run the HLS converter
echo Starting HLS conversion...
echo.
node convert-to-hls.js

REM Check if the conversion was successful
if %errorlevel% neq 0 (
    echo.
    echo ERROR: HLS conversion failed!
    echo Please check the error messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo HLS conversion completed successfully!
echo.
echo Press any key to exit...
pause >nul
