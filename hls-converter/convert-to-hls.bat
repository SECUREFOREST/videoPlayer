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
REM First check if custom path is set in environment
if defined FFMPEG_PATH (
    if exist "%FFMPEG_PATH%" (
        echo Using custom FFmpeg path: %FFMPEG_PATH%
    ) else (
        echo ERROR: Custom FFmpeg path not found: %FFMPEG_PATH%
        pause
        exit /b 1
    )
) else (
    ffmpeg -version >nul 2>&1
    if %errorlevel% neq 0 (
        echo ERROR: FFmpeg is not installed or not in PATH
        echo Please install FFmpeg from https://ffmpeg.org/download.html
        echo Or use: winget install ffmpeg
        echo.
        echo Alternatively, set FFMPEG_PATH environment variable:
        echo   set FFMPEG_PATH=C:\path\to\ffmpeg.exe
        pause
        exit /b 1
    )
)

REM Check if FFprobe is available
if defined FFPROBE_PATH (
    if exist "%FFPROBE_PATH%" (
        echo Using custom FFprobe path: %FFPROBE_PATH%
    ) else (
        echo ERROR: Custom FFprobe path not found: %FFPROBE_PATH%
        pause
        exit /b 1
    )
) else (
    ffprobe -version >nul 2>&1
    if %errorlevel% neq 0 (
        echo ERROR: FFprobe is not installed or not in PATH
        echo FFprobe is part of FFmpeg package
        pause
        exit /b 1
    )
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
