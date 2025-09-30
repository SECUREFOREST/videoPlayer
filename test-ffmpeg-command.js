#!/usr/bin/env node

/**
 * Test script to verify FFmpeg command construction
 */

const path = require('path');

// Load configuration
let config;
try {
    config = require('./config.js');
} catch (error) {
    config = {
        ffmpeg: {
            path: process.env.FFMPEG_PATH || '',
            ffprobePath: process.env.FFPROBE_PATH || ''
        }
    };
}

// FFmpeg path resolution functions
function getFFmpegPath() {
    if (config.ffmpeg && config.ffmpeg.path) {
        return config.ffmpeg.path;
    }
    return 'ffmpeg';
}

function getFFprobePath() {
    if (config.ffmpeg && config.ffmpeg.ffprobePath) {
        return config.ffmpeg.ffprobePath;
    }
    return 'ffprobe';
}

// Test command construction
function testFFmpegCommand() {
    const ffmpegPath = getFFmpegPath();
    const ffprobePath = getFFprobePath();
    
    console.log('🔧 FFmpeg Configuration Test');
    console.log('============================');
    console.log(`FFmpeg path: ${ffmpegPath}`);
    console.log(`FFprobe path: ${ffprobePath}`);
    console.log('');
    
    // Test basic command structure
    const testInput = '/path/to/test/video.mp4';
    const testOutput = '/path/to/output/playlist.m3u8';
    const testSegmentPattern = '/path/to/output/segment_%03d.ts';
    
    const args = [
        '-i', `"${testInput}"`,
        '-c:a', 'aac',
        '-b:a', '192k',
        '-vf', 'scale=1920x1080',
        '-maxrate', '5000k',
        '-bufsize', '10000k',
        '-g', '300',
        '-keyint_min', '300',
        '-sc_threshold', '0',
        '-f', 'hls',
        '-hls_time', '10',
        '-hls_list_size', '0',
        '-hls_segment_filename', `"${testSegmentPattern}"`,
        '-y'
    ];
    
    // Add hardware acceleration (VideoToolbox for macOS)
    args.unshift('-hwaccel', 'videotoolbox');
    
    // Add video codec
    const codec = ['-c:v', 'h264_videotoolbox', '-b:v', '5000k', '-realtime', 'true', '-allow_sw', '1'];
    args.splice(args.indexOf('-c:a') - 1, 0, ...codec);
    
    // Add output
    args.push(`"${testOutput}"`);
    
    const command = `"${ffmpegPath}" ${args.join(' ')}`;
    
    console.log('📋 Generated FFmpeg Command:');
    console.log(command);
    console.log('');
    
    // Test argument parsing
    console.log('🔍 Command Analysis:');
    const parts = command.split(' ');
    console.log(`Total parts: ${parts.length}`);
    console.log(`FFmpeg executable: ${parts[0]}`);
    console.log(`First argument: ${parts[1]}`);
    console.log(`Input file position: ${parts.indexOf('"' + testInput + '"')}`);
    console.log('');
    
    // Check for common issues
    console.log('⚠️  Potential Issues:');
    if (command.includes('-hwaccel') && command.indexOf('-hwaccel') > command.indexOf('-i')) {
        console.log('❌ Hardware acceleration arguments are after input file - this will cause errors!');
    } else {
        console.log('✅ Hardware acceleration arguments are before input file');
    }
    
    if (command.includes('videotoolbox') && command.includes('h264_videotoolbox')) {
        console.log('✅ VideoToolbox codec matches hardware acceleration');
    } else {
        console.log('❌ Codec and hardware acceleration mismatch');
    }
    
    console.log('');
    console.log('🎯 Expected command structure:');
    console.log('ffmpeg -hwaccel videotoolbox -i "input.mp4" -c:v h264_videotoolbox ... "output.m3u8"');
}

// Run the test
testFFmpegCommand();
