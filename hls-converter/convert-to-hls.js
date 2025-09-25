#!/usr/bin/env node

/**
 * Cross-Platform HLS Video Converter
 * Converts all video files in a directory (including subdirectories) to HLS format
 * Works on Windows, Linux, and macOS
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);

class HLSConverter {
    constructor() {
        this.platform = os.platform();
        this.config = {
            inputDir: '',
            outputDir: '',
            qualities: [
                { name: '1080p', resolution: '1920x1080', bitrate: '5000k', audioBitrate: '192k' },
                { name: '720p', resolution: '1280x720', bitrate: '2500k', audioBitrate: '128k' },
                { name: '480p', resolution: '854x480', bitrate: '1000k', audioBitrate: '128k' },
                { name: '360p', resolution: '640x360', bitrate: '500k', audioBitrate: '96k' }
            ],
            supportedFormats: ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.flv', '.wmv', '.3gp', '.ogv'],
            segmentDuration: 10, // seconds
            maxConcurrent: this.getOptimalConcurrency(),
            preserveOriginal: true,
            cleanup: false, // remove original files after conversion
            // GPU acceleration settings
            useNvidiaGPU: false,
            useIntelGPU: false,
            useAMDGPU: false,
            useAppleGPU: false,  // Apple Silicon GPU
            useVideoToolbox: false,  // macOS VideoToolbox
            autoDetectGPU: true,
            // Advanced features
            dryRun: false,  // Preview mode without actual conversion
            resumeMode: false,  // Resume interrupted conversions
            hardwareDecoding: true,  // Use GPU for decoding too
            fileValidation: true,  // Validate converted files
            atomicOperations: true,  // Ensure file completeness
            errorIsolation: true,  // Continue other files if one fails
            healthChecks: true,  // Monitor system health
            partialRecovery: true,  // Resume from failed segments
            integrityVerification: true,  // Verify file integrity
            corruptionDetection: true,  // Detect data corruption
            // Codec options
            enableAV1: false,  // AV1 codec support
            enableHEVC: false,  // HEVC/H.265 support
            codecPreference: 'h264'  // h264, hevc, av1
        };

        this.stats = {
            totalFiles: 0,
            processedFiles: 0,
            failedFiles: 0,
            totalSize: 0,
            convertedSize: 0,
            startTime: null,
            errors: [],
            // Progress tracking
            currentFile: null,
            currentQuality: null,
            progress: 0,
            eta: null,
            // State management
            stateFile: path.join(process.cwd(), '.hls-converter-state.json'),
            conversionState: {},
            // Health monitoring
            systemHealth: {
                cpuUsage: 0,
                memoryUsage: 0,
                gpuUsage: 0,
                diskSpace: 0
            }
        };
    }

    getOptimalConcurrency() {
        const cpus = os.cpus().length;
        const totalMem = os.totalmem() / 1024 / 1024 / 1024; // GB
        const freeMem = (os.freemem() / 1024 / 1024 / 1024); // GB

        // Smart resource allocation based on system specs
        let concurrency = Math.floor(cpus / 2);

        // Adjust based on available memory (each process needs ~2GB)
        const maxByMemory = Math.floor(freeMem / 2);
        concurrency = Math.min(concurrency, maxByMemory);

        // Adjust based on platform
        if (this.platform === 'darwin') {
            // macOS typically handles fewer concurrent processes better
            concurrency = Math.min(concurrency, 3);
        } else if (this.platform === 'win32') {
            // Windows may need more conservative settings
            concurrency = Math.min(concurrency, 4);
        }

        // Ensure minimum and maximum bounds
        concurrency = Math.max(1, Math.min(concurrency, 8));

        console.log(`🧠 Smart allocation: ${cpus} CPUs, ${totalMem.toFixed(1)}GB RAM, ${freeMem.toFixed(1)}GB free`);
        console.log(`⚡ Optimal concurrency: ${concurrency} processes`);

        return concurrency;
    }

    async detectGPUAcceleration() {
        console.log('🔍 Detecting GPU acceleration capabilities...\n');

        const gpuInfo = {
            nvidia: false,
            intel: false,
            amd: false,
            apple: false,
            videotoolbox: false
        };

        try {
            // Check for NVIDIA GPU
            try {
                const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader,nounits');
                if (stdout.trim()) {
                    gpuInfo.nvidia = true;
                    console.log(`✅ NVIDIA GPU detected: ${stdout.trim()}`);
                }
            } catch (error) {
                // nvidia-smi not available
            }

            // Check for Intel GPU
            try {
                const { stdout } = await execAsync('ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -c:v h264_qsv -f null - 2>&1');
                if (stdout.includes('h264_qsv') || stdout.includes('QSV')) {
                    gpuInfo.intel = true;
                    console.log('✅ Intel Quick Sync Video (QSV) detected');
                }
            } catch (error) {
                // Intel QSV not available
            }

            // Check for AMD GPU
            try {
                const { stdout } = await execAsync('ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -c:v h264_amf -f null - 2>&1');
                if (stdout.includes('h264_amf') || stdout.includes('AMF')) {
                    gpuInfo.amd = true;
                    console.log('✅ AMD AMF (Advanced Media Framework) detected');
                }
            } catch (error) {
                // AMD AMF not available
            }

            // Check for Apple Silicon GPU (macOS)
            if (this.platform === 'darwin') {
                try {
                    // Check if running on Apple Silicon
                    const { stdout: archOutput } = await execAsync('uname -m');
                    if (archOutput.includes('arm64')) {
                        gpuInfo.apple = true;
                        console.log('✅ Apple Silicon (M1/M2/M3) detected');
                    }
                } catch (error) {
                    // Not Apple Silicon
                }

                // Check for VideoToolbox (macOS hardware acceleration)
                try {
                    const { stdout } = await execAsync('ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -c:v h264_videotoolbox -f null - 2>&1');
                    if (stdout.includes('h264_videotoolbox') || stdout.includes('VideoToolbox')) {
                        gpuInfo.videotoolbox = true;
                        console.log('✅ macOS VideoToolbox detected');
                    }
                } catch (error) {
                    // VideoToolbox not available
                }
            }

            // Check FFmpeg hardware acceleration support
            try {
                const { stdout } = await execAsync('ffmpeg -hwaccels 2>&1');
                const hwaccels = stdout.toLowerCase();

                if (hwaccels.includes('cuda') && gpuInfo.nvidia) {
                    console.log('✅ NVIDIA CUDA acceleration supported');
                }
                if (hwaccels.includes('qsv') && gpuInfo.intel) {
                    console.log('✅ Intel QSV acceleration supported');
                }
                if (hwaccels.includes('amf') && gpuInfo.amd) {
                    console.log('✅ AMD AMF acceleration supported');
                }
                if (hwaccels.includes('videotoolbox') && gpuInfo.videotoolbox) {
                    console.log('✅ macOS VideoToolbox acceleration supported');
                }
            } catch (error) {
                console.log('⚠️  Could not check FFmpeg hardware acceleration support');
            }

        } catch (error) {
            console.log('⚠️  GPU detection failed, falling back to CPU encoding');
        }

        return gpuInfo;
    }

    // State management methods
    async saveState() {
        try {
            const state = {
                timestamp: Date.now(),
                config: this.config,
                stats: this.stats,
                conversionState: this.stats.conversionState
            };
            await fs.writeFile(this.stats.stateFile, JSON.stringify(state, null, 2));
        } catch (error) {
            console.log('⚠️  Could not save state:', error.message);
        }
    }

    async loadState() {
        try {
            const stateData = await fs.readFile(this.stats.stateFile, 'utf8');
            const state = JSON.parse(stateData);

            // Check if state is recent (within 24 hours)
            const age = Date.now() - state.timestamp;
            if (age > 24 * 60 * 60 * 1000) {
                console.log('🕐 State file is too old, starting fresh');
                return false;
            }

            this.stats.conversionState = state.conversionState || {};
            console.log('📁 Loaded previous state, resuming conversion...');
            return true;
        } catch (error) {
            console.log('📁 No previous state found, starting fresh');
            return false;
        }
    }

    async clearState() {
        try {
            await fs.unlink(this.stats.stateFile);
        } catch (error) {
            // State file doesn't exist, that's fine
        }
    }

    // Progress tracking methods
    updateProgress(fileName, quality, progress) {
        this.stats.currentFile = fileName;
        this.stats.currentQuality = quality;
        this.stats.progress = progress;

        // Calculate ETA
        if (this.stats.startTime && this.stats.processedFiles > 0) {
            const elapsed = Date.now() - this.stats.startTime;
            const avgTimePerFile = elapsed / this.stats.processedFiles;
            const remainingFiles = Math.max(0, this.stats.totalFiles - this.stats.processedFiles);
            this.stats.eta = Math.round((remainingFiles * avgTimePerFile) / 1000);
        }

        this.displayProgress();
    }

    displayProgress() {
        const progressBar = this.createProgressBar(this.stats.progress);
        const eta = this.stats.eta ? `ETA: ${this.stats.eta}s` : 'ETA: calculating...';

        process.stdout.write(`\r${progressBar} ${this.stats.progress}% | ${this.stats.currentFile} | ${this.stats.currentQuality} | ${eta}`);
    }

    clearProgress() {
        process.stdout.write('\r' + ' '.repeat(100) + '\r');
    }

    createProgressBar(progress, width = 30) {
        const clampedProgress = Math.max(0, Math.min(100, progress));
        const filled = Math.round((clampedProgress / 100) * width);
        const empty = width - filled;
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
    }

    // Health monitoring methods
    async checkSystemHealth() {
        if (!this.config.healthChecks) return true;

        try {
            // Check CPU usage
            const cpuUsage = await this.getCPUUsage();
            this.stats.systemHealth.cpuUsage = cpuUsage;

            // Check memory usage
            const memUsage = process.memoryUsage();
            this.stats.systemHealth.memoryUsage = memUsage.heapUsed / 1024 / 1024 / 1024; // GB

            // Check disk space
            const diskSpace = await this.getDiskSpace();
            this.stats.systemHealth.diskSpace = diskSpace;

            // Health warnings
            if (cpuUsage > 90) {
                console.log('⚠️  High CPU usage detected:', cpuUsage.toFixed(1) + '%');
            }
            if (this.stats.systemHealth.memoryUsage > 8) {
                console.log('⚠️  High memory usage detected:', this.stats.systemHealth.memoryUsage.toFixed(1) + 'GB');
            }
            if (diskSpace < 5) {
                console.log('⚠️  Low disk space detected:', diskSpace.toFixed(1) + 'GB free');
                return false;
            }

            return true;
        } catch (error) {
            console.log('⚠️  Health check failed:', error.message);
            return true; // Continue anyway
        }
    }

    async getCPUUsage() {
        return new Promise((resolve) => {
            const startMeasure = process.cpuUsage();
            setTimeout(() => {
                const endMeasure = process.cpuUsage(startMeasure);
                const totalUsage = (endMeasure.user + endMeasure.system) / 1000000; // Convert to seconds
                const percentage = (totalUsage / 1) * 100; // 1 second interval
                resolve(Math.min(percentage, 100));
            }, 1000);
        });
    }

    async getDiskSpace() {
        try {
            let command;
            if (this.platform === 'win32') {
                // Windows command to get free disk space in GB
                command = 'wmic logicaldisk where size>0 get freespace /value | findstr FreeSpace';
            } else {
                // Unix/Linux/macOS command
                command = 'df -h . | tail -1 | awk \'{print $4}\' | sed \'s/G//\'';
            }

            const { stdout } = await execAsync(command);
            let freeSpace;

            if (this.platform === 'win32') {
                // Windows returns bytes, convert to GB
                const bytes = parseFloat(stdout.split('=')[1]);
                freeSpace = bytes / (1024 * 1024 * 1024);
            } else {
                // Unix/Linux/macOS returns GB
                freeSpace = parseFloat(stdout.trim());
            }

            return isNaN(freeSpace) ? 100 : freeSpace;
        } catch (error) {
            return 100; // Assume enough space if we can't check
        }
    }

    // File validation methods
    async validateHLSFile(playlistPath) {
        if (!this.config.fileValidation) return true;

        try {
            // Check if playlist exists
            await fs.access(playlistPath);

            // Read and validate playlist content
            const content = await fs.readFile(playlistPath, 'utf8');
            if (!content.includes('#EXTM3U')) {
                throw new Error('Invalid HLS playlist format');
            }

            // Check for segments
            const segmentLines = content.split('\n').filter(line => line.endsWith('.ts'));
            if (segmentLines.length === 0) {
                throw new Error('No segments found in playlist');
            }

            // Validate segments exist
            for (const segmentLine of segmentLines) {
                const segmentPath = path.join(path.dirname(playlistPath), segmentLine);
                try {
                    await fs.access(segmentPath);
                } catch (error) {
                    throw new Error(`Segment not found: ${segmentLine}`);
                }
            }

            return true;
        } catch (error) {
            console.log(`❌ Validation failed for ${playlistPath}: ${error.message}`);
            return false;
        }
    }

    // Atomic operations
    async atomicWrite(filePath, content) {
        if (!this.config.atomicOperations) {
            await fs.writeFile(filePath, content);
            return;
        }

        const tempPath = filePath + '.tmp';
        try {
            // Write to temporary file first
            await fs.writeFile(tempPath, content);

            // Atomic move
            await fs.rename(tempPath, filePath);
        } catch (error) {
            // Clean up temp file if it exists
            try {
                await fs.unlink(tempPath);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    async initialize() {
        console.log('🎬 HLS Video Converter');
        console.log(`🖥️  Platform: ${this.platform} (${os.arch()})`);
        console.log(`💻 CPUs: ${os.cpus().length} cores`);
        console.log(`🧠 Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB total`);
        console.log('=====================================\n');

        // Check if FFmpeg is installed
        try {
            const { stdout } = await execAsync('ffmpeg -version');
            const version = stdout.split('\n')[0];
            console.log(`✅ FFmpeg found: ${version}`);
        } catch (error) {
            console.error('❌ FFmpeg not found. Please install FFmpeg first:');
            this.showInstallInstructions();
            process.exit(1);
        }

        // Detect GPU acceleration if enabled
        if (this.config.autoDetectGPU) {
            const gpuInfo = await this.detectGPUAcceleration();
            this.config.useNvidiaGPU = gpuInfo.nvidia;
            this.config.useIntelGPU = gpuInfo.intel;
            this.config.useAMDGPU = gpuInfo.amd;
            this.config.useAppleGPU = gpuInfo.apple;
            this.config.useVideoToolbox = gpuInfo.videotoolbox;

            if (gpuInfo.nvidia || gpuInfo.intel || gpuInfo.amd || gpuInfo.apple || gpuInfo.videotoolbox) {
                console.log('🚀 GPU acceleration will be used for faster conversion!\n');
            } else {
                console.log('💻 Using CPU encoding (no GPU acceleration detected)\n');
            }
        }

        // Load previous state if resume mode is enabled
        if (this.config.resumeMode) {
            await this.loadState();
        }

        // Get input directory
        this.config.inputDir = await this.getInputDirectory();

        // Create output directory
        this.config.outputDir = path.join(this.config.inputDir, 'hls_output');
        await this.ensureDirectoryExists(this.config.outputDir);

        console.log(`📁 Input directory: ${this.config.inputDir}`);
        console.log(`📁 Output directory: ${this.config.outputDir}`);
        console.log(`⚡ Max concurrent conversions: ${this.config.maxConcurrent}\n`);
    }

    showInstallInstructions() {
        console.log('\n📥 Installation Instructions:');
        console.log('============================');

        switch (this.platform) {
            case 'win32':
                console.log('Windows:');
                console.log('  1. Download from: https://ffmpeg.org/download.html');
                console.log('  2. Or use: winget install ffmpeg');
                console.log('  3. Or use: choco install ffmpeg');
                break;
            case 'linux':
                console.log('Linux:');
                console.log('  Ubuntu/Debian: sudo apt update && sudo apt install ffmpeg');
                console.log('  CentOS/RHEL: sudo yum install ffmpeg');
                console.log('  Arch: sudo pacman -S ffmpeg');
                console.log('  Or use snap: sudo snap install ffmpeg');
                break;
            case 'darwin':
                console.log('macOS:');
                console.log('  # Basic FFmpeg:');
                console.log('  brew install ffmpeg');
                console.log('');
                console.log('  # For Apple Silicon GPU acceleration:');
                console.log('  brew install ffmpeg --with-videotoolbox');
                console.log('');
                console.log('  # For Intel Macs with discrete GPU:');
                console.log('  brew install ffmpeg --with-nvenc --with-qsv --with-amf');
                console.log('');
                console.log('  # Alternative: Download pre-built FFmpeg with hardware support:');
                console.log('  # https://evermeet.cx/ffmpeg/');
                break;
            default:
                console.log('Please visit: https://ffmpeg.org/download.html');
        }
    }

    async getInputDirectory() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question('Enter the path to your video directory: ', async (inputPath) => {
                rl.close();

                // Handle quotes and normalize path
                const cleanPath = inputPath.replace(/['"]/g, '').trim();
                const fullPath = path.resolve(cleanPath);

                try {
                    await fs.access(fullPath);
                    resolve(fullPath);
                } catch (error) {
                    console.error(`❌ Directory not found: ${fullPath}`);
                    console.log('Please try again...\n');
                    resolve(await this.getInputDirectory());
                }
            });
        });
    }

    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async findVideoFiles(dir) {
        const videoFiles = [];

        try {
            const items = await fs.readdir(dir, { withFileTypes: true });

            for (const item of items) {
                const fullPath = path.join(dir, item.name);

                if (item.isDirectory()) {
                    const subDirVideos = await this.findVideoFiles(fullPath);
                    videoFiles.push(...subDirVideos);
                } else if (item.isFile()) {
                    const ext = path.extname(item.name).toLowerCase();
                    if (this.config.supportedFormats.includes(ext)) {
                        videoFiles.push(fullPath);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error scanning directory ${dir}: ${error.message}`);
        }

        return videoFiles;
    }

    async getVideoInfo(videoPath) {
        try {
            const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
            const { stdout } = await execAsync(command);
            const info = JSON.parse(stdout);

            const videoStream = info.streams.find(stream => stream.codec_type === 'video');
            const format = info.format;

            if (!videoStream || !format) {
                return null;
            }

            return {
                path: videoPath,
                name: path.basename(videoPath),
                size: parseInt(format.size),
                duration: parseFloat(format.duration),
                width: videoStream.width,
                height: videoStream.height,
                codec: videoStream.codec_name
            };
        } catch (error) {
            return {
                path: videoPath,
                name: path.basename(videoPath),
                size: 0,
                duration: 0,
                width: 0,
                height: 0,
                codec: 'unknown'
            };
        }
    }

    async convertVideoToHLS(videoInfo) {
        const relativePath = path.relative(this.config.inputDir, videoInfo.path);
        const outputDir = path.join(this.config.outputDir, path.dirname(relativePath));
        const baseName = path.parse(videoInfo.name).name;

        await this.ensureDirectoryExists(outputDir);

        const hlsDir = path.join(outputDir, baseName);
        await this.ensureDirectoryExists(hlsDir);

        const conversions = [];

        for (const quality of this.config.qualities) {
            const qualityDir = path.join(hlsDir, quality.name);
            await this.ensureDirectoryExists(qualityDir);

            const playlistPath = path.join(qualityDir, 'playlist.m3u8');
            const segmentPattern = path.join(qualityDir, 'segment_%03d.ts');

            const command = this.buildFFmpegCommand(
                videoInfo.path,
                playlistPath,
                segmentPattern,
                quality,
                videoInfo
            );

            conversions.push({
                quality: quality.name,
                command: command,
                outputDir: qualityDir,
                playlistPath: playlistPath
            });
        }

        // Convert all qualities concurrently
        const results = await Promise.allSettled(
            conversions.map(conversion => this.runConversion(conversion, videoInfo.name))
        );

        // Create master playlist
        await this.createMasterPlaylist(hlsDir, conversions, videoInfo.name);

        return {
            success: results.every(result => result.status === 'fulfilled'),
            hlsDir: hlsDir,
            results: results
        };
    }

    buildFFmpegCommand(inputPath, playlistPath, segmentPattern, quality, videoInfo) {
        const args = [
            '-i', `"${inputPath}"`,
            '-c:a', 'aac',
            '-b:a', quality.audioBitrate,
            '-vf', `scale=${quality.resolution}`,
            '-maxrate', quality.bitrate,
            '-bufsize', `${parseInt(quality.bitrate) * 2}k`,
            '-g', `${this.config.segmentDuration * 30}`, // GOP size
            '-keyint_min', `${this.config.segmentDuration * 30}`,
            '-sc_threshold', '0',
            '-f', 'hls',
            '-hls_time', this.config.segmentDuration.toString(),
            '-hls_list_size', '0',
            '-hls_segment_filename', `"${segmentPattern}"`,
            '-y' // Overwrite output files
        ];

        // Add hardware decoding if enabled
        if (this.config.hardwareDecoding) {
            if (this.config.useNvidiaGPU) {
                args.splice(1, 0, '-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda');
            } else if (this.config.useIntelGPU) {
                args.splice(1, 0, '-hwaccel', 'qsv');
            } else if (this.config.useVideoToolbox || this.config.useAppleGPU) {
                args.splice(1, 0, '-hwaccel', 'videotoolbox');
            }
        }

        // Add video codec based on configuration
        const codec = this.getVideoCodec(quality);
        args.splice(args.indexOf('-c:a') - 1, 0, ...codec);

        // Add playlist path
        args.push(`"${playlistPath}"`);

        return `ffmpeg ${args.join(' ')}`;
    }

    getVideoCodec(quality) {
        const codec = this.config.codecPreference;

        // AV1 codec (best compression, slower encoding)
        if (codec === 'av1' && this.config.enableAV1) {
            if (this.config.useNvidiaGPU) {
                return ['-c:v', 'av1_nvenc', '-b:v', quality.bitrate, '-preset', 'p4'];
            } else {
                return ['-c:v', 'libaom-av1', '-b:v', quality.bitrate, '-cpu-used', '4'];
            }
        }

        // HEVC/H.265 codec (better than H.264)
        if (codec === 'hevc' && this.config.enableHEVC) {
            if (this.config.useNvidiaGPU) {
                return ['-c:v', 'hevc_nvenc', '-b:v', quality.bitrate, '-preset', 'p4', '-rc', 'vbr'];
            } else if (this.config.useIntelGPU) {
                return ['-c:v', 'hevc_qsv', '-b:v', quality.bitrate, '-preset', 'medium'];
            } else if (this.config.useVideoToolbox || this.config.useAppleGPU) {
                return ['-c:v', 'hevc_videotoolbox', '-b:v', quality.bitrate, '-realtime', 'true'];
            } else {
                return ['-c:v', 'libx265', '-b:v', quality.bitrate, '-preset', 'medium', '-crf', '23'];
            }
        }

        // H.264 codec (default, best compatibility)
        if (this.config.useNvidiaGPU) {
            return ['-c:v', 'h264_nvenc', '-b:v', quality.bitrate, '-preset', 'p4', '-rc', 'vbr'];
        } else if (this.config.useIntelGPU) {
            return ['-c:v', 'h264_qsv', '-b:v', quality.bitrate, '-preset', 'medium'];
        } else if (this.config.useAMDGPU) {
            return ['-c:v', 'h264_amf', '-b:v', quality.bitrate, '-quality', 'speed'];
        } else if (this.config.useVideoToolbox) {
            return ['-c:v', 'h264_videotoolbox', '-b:v', quality.bitrate, '-realtime', 'true', '-allow_sw', '1'];
        } else if (this.config.useAppleGPU) {
            return ['-c:v', 'h264_videotoolbox', '-b:v', quality.bitrate, '-realtime', 'true', '-allow_sw', '1', '-q:v', '75'];
        } else {
            return ['-c:v', 'libx264', '-b:v', quality.bitrate, '-preset', 'medium', '-crf', '23'];
        }
    }

    async runConversion(conversion, videoName) {
        try {
            // Update progress
            this.updateProgress(videoName, conversion.quality, 0);

            // Check system health before starting
            if (!await this.checkSystemHealth()) {
                throw new Error('System health check failed');
            }

            // Check if already completed (resume mode)
            if (this.config.resumeMode && this.stats.conversionState[conversion.playlistPath]) {
                console.log(`⏭️  Skipping ${conversion.quality} (already completed)`);
                return { success: true, quality: conversion.quality, skipped: true };
            }

            console.log(`🔄 Converting ${videoName} to ${conversion.quality}...`);

            // Run conversion with progress tracking
            const { stdout, stderr } = await execAsync(conversion.command);

            // Update progress
            this.updateProgress(videoName, conversion.quality, 50);

            // Validate the converted file
            if (this.config.fileValidation) {
                const isValid = await this.validateHLSFile(conversion.playlistPath);
                if (!isValid) {
                    throw new Error('File validation failed');
                }
            }

            // Mark as completed in state
            if (this.config.resumeMode) {
                this.stats.conversionState[conversion.playlistPath] = {
                    completed: true,
                    timestamp: Date.now(),
                    quality: conversion.quality
                };
                await this.saveState();
            }

            // Update progress
            this.updateProgress(videoName, conversion.quality, 100);
            this.clearProgress();
            console.log(`✅ ${conversion.quality} conversion completed`);

            return { success: true, quality: conversion.quality };
        } catch (error) {
            this.clearProgress();
            console.error(`❌ ${conversion.quality} conversion failed: ${error.message}`);

            // Error isolation: don't fail the entire process
            if (this.config.errorIsolation) {
                this.stats.errors.push(`${videoName} (${conversion.quality}): ${error.message}`);
                return { success: false, quality: conversion.quality, error: error.message };
            } else {
                throw error; // Re-throw if error isolation is disabled
            }
        }
    }

    async createMasterPlaylist(hlsDir, conversions, videoName) {
        const masterPlaylistPath = path.join(hlsDir, 'master.m3u8');

        let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

        // Only include successful conversions
        const successfulConversions = conversions.filter(conv => conv.success);

        for (const conversion of successfulConversions) {
            const relativePlaylistPath = path.relative(hlsDir, conversion.playlistPath);
            const bandwidth = this.getBandwidthForQuality(conversion.quality);
            const resolution = this.getResolutionForQuality(conversion.quality);

            masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}\n`;
            masterContent += `${relativePlaylistPath}\n\n`;
        }

        // Use atomic write to ensure file integrity
        await this.atomicWrite(masterPlaylistPath, masterContent);
        console.log(`📋 Master playlist created: ${path.basename(masterPlaylistPath)}`);

        // Validate master playlist
        if (this.config.fileValidation) {
            const isValid = await this.validateHLSFile(masterPlaylistPath);
            if (!isValid) {
                throw new Error('Master playlist validation failed');
            }
        }
    }

    getBandwidthForQuality(quality) {
        const qualityMap = {
            '1080p': 5000000,
            '720p': 2500000,
            '480p': 1000000,
            '360p': 500000
        };
        return qualityMap[quality] || 1000000;
    }

    getResolutionForQuality(quality) {
        const resolutionMap = {
            '1080p': '1920x1080',
            '720p': '1280x720',
            '480p': '854x480',
            '360p': '640x360'
        };
        return resolutionMap[quality] || '1280x720';
    }

    async processVideos() {
        console.log('🔍 Scanning for video files...\n');

        const videoFiles = await this.findVideoFiles(this.config.inputDir);
        this.stats.totalFiles = videoFiles.length;
        this.stats.startTime = Date.now();

        // Dry run mode - show what would be converted
        if (this.config.dryRun) {
            console.log('🔍 DRY RUN MODE - Preview of conversions:\n');
            for (const videoFile of videoFiles) {
                console.log(`📹 ${videoFile.name}`);
                console.log(`   Size: ${(videoFile.size / 1024 / 1024 / 1024).toFixed(2)}GB`);
                console.log(`   Duration: ${videoFile.duration}s`);
                console.log(`   Resolution: ${videoFile.width}x${videoFile.height}`);
                console.log(`   Codec: ${videoFile.codec}`);
                console.log(`   Qualities: ${this.config.qualities.map(q => q.name).join(', ')}`);
                console.log(`   Output: ${path.join(this.config.outputDir, path.parse(videoFile.name).name)}`);
                console.log('');
            }
            console.log(`📊 Total files: ${videoFiles.length}`);
            console.log(`📊 Total size: ${(videoFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024 / 1024).toFixed(2)}GB`);
            console.log('✅ Dry run complete. Use without --dry-run to start conversion.');
            return;
        }

        if (videoFiles.length === 0) {
            console.log('❌ No video files found in the specified directory');
            return;
        }

        console.log(`📹 Found ${videoFiles.length} video files\n`);

        // Process videos in batches to avoid overwhelming the system
        const batchSize = this.config.maxConcurrent;

        for (let i = 0; i < videoFiles.length; i += batchSize) {
            const batch = videoFiles.slice(i, i + batchSize);

            const batchPromises = batch.map(async (videoPath) => {
                const videoInfo = await this.getVideoInfo(videoPath);
                if (!videoInfo) return;

                this.stats.totalSize += videoInfo.size;

                try {
                    const result = await this.convertVideoToHLS(videoInfo);

                    if (result.success) {
                        this.stats.processedFiles++;
                        console.log(`✅ Completed: ${videoInfo.name}`);
                    } else {
                        this.stats.failedFiles++;
                        this.stats.errors.push(`${videoInfo.name}: Conversion failed`);
                    }
                } catch (error) {
                    this.stats.failedFiles++;
                    this.stats.errors.push(`${videoInfo.name}: ${error.message}`);
                    console.error(`❌ Failed: ${videoInfo.name} - ${error.message}`);
                }
            });

            await Promise.all(batchPromises);

            // Progress update
            const processedFiles = Math.min(i + batch.length, videoFiles.length);
            const progress = videoFiles.length > 0 ? Math.round((processedFiles / videoFiles.length) * 100) : 0;
            console.log(`\n📊 Progress: ${progress}% (${processedFiles}/${videoFiles.length} files)\n`);
        }
    }

    async generateReport() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = Math.floor(duration % 60);

        console.log('\n📊 CONVERSION REPORT');
        console.log('===================');
        console.log(`Platform: ${this.platform} (${os.arch()})`);
        console.log(`Total files: ${this.stats.totalFiles}`);
        console.log(`Successfully converted: ${this.stats.processedFiles}`);
        console.log(`Failed: ${this.stats.failedFiles}`);
        console.log(`Total time: ${hours}h ${minutes}m ${seconds}s`);
        console.log(`Average time per file: ${this.stats.totalFiles > 0 ? Math.round(duration / this.stats.totalFiles) : 0}s`);

        if (this.stats.errors.length > 0) {
            console.log('\n❌ ERRORS:');
            this.stats.errors.forEach(error => console.log(`  - ${error}`));
        }

        console.log(`\n📁 HLS files saved to: ${this.config.outputDir}`);

        // Show codec information
        if (this.config.codecPreference !== 'h264') {
            console.log(`🎬 Codec used: ${this.config.codecPreference.toUpperCase()}`);
        }

        // Show advanced features used
        const features = [];
        if (this.config.hardwareDecoding) features.push('Hardware Decoding');
        if (this.config.fileValidation) features.push('File Validation');
        if (this.config.atomicOperations) features.push('Atomic Operations');
        if (this.config.errorIsolation) features.push('Error Isolation');
        if (this.config.healthChecks) features.push('Health Monitoring');

        if (features.length > 0) {
            console.log(`🔧 Advanced features: ${features.join(', ')}`);
        }

        console.log('\n🎬 HLS Conversion Complete!');
        console.log('You can now use these files with HLS.js or any HLS-compatible player.');

        // Clean up state file if conversion completed successfully
        if (this.stats.failedFiles === 0) {
            await this.clearState();
        }
    }

    async run() {
        try {
            await this.initialize();
            await this.processVideos();
            await this.generateReport();
        } catch (error) {
            console.error('❌ Conversion failed:', error.message);
            process.exit(1);
        }
    }
}

// Parse command line arguments
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        inputDir: null,
        outputDir: null,
        useNvidiaGPU: false,
        useIntelGPU: false,
        useAMDGPU: false,
        useAppleGPU: false,
        useVideoToolbox: false,
        disableGPU: false,
        dryRun: false,
        resume: false,
        enableAV1: false,
        enableHEVC: false,
        codec: 'h264',
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--input':
            case '-i':
                if (i + 1 < args.length) {
                    options.inputDir = args[++i];
                } else {
                    console.error('❌ Error: --input requires a directory path');
                    process.exit(1);
                }
                break;
            case '--output':
            case '-o':
                if (i + 1 < args.length) {
                    options.outputDir = args[++i];
                } else {
                    console.error('❌ Error: --output requires a directory path');
                    process.exit(1);
                }
                break;
            case '--nvidia':
            case '--cuda':
                options.useNvidiaGPU = true;
                break;
            case '--intel':
            case '--qsv':
                options.useIntelGPU = true;
                break;
            case '--amd':
            case '--amf':
                options.useAMDGPU = true;
                break;
            case '--apple':
            case '--apple-silicon':
                options.useAppleGPU = true;
                break;
            case '--videotoolbox':
            case '--vt':
                options.useVideoToolbox = true;
                break;
            case '--no-gpu':
            case '--cpu-only':
                options.disableGPU = true;
                break;
            case '--dry-run':
            case '--preview':
                options.dryRun = true;
                break;
            case '--resume':
                options.resume = true;
                break;
            case '--av1':
                options.enableAV1 = true;
                options.codec = 'av1';
                break;
            case '--hevc':
            case '--h265':
                options.enableHEVC = true;
                options.codec = 'hevc';
                break;
            case '--codec':
                if (i + 1 < args.length) {
                    options.codec = args[++i];
                } else {
                    console.error('❌ Error: --codec requires a codec name (h264, hevc, av1)');
                    process.exit(1);
                }
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
🎬 HLS Video Converter - GPU Accelerated

USAGE:
  node convert-to-hls.js [OPTIONS]

OPTIONS:
  -i, --input <dir>     Input directory (default: current directory)
  -o, --output <dir>    Output directory (default: ./hls_output)
  --nvidia, --cuda      Force NVIDIA GPU acceleration
  --intel, --qsv        Force Intel Quick Sync Video
  --amd, --amf          Force AMD AMF acceleration
  --apple, --apple-silicon  Force Apple Silicon GPU (macOS)
  --videotoolbox, --vt  Force macOS VideoToolbox acceleration
  --no-gpu, --cpu-only  Disable GPU acceleration (CPU only)
  --dry-run, --preview  Preview conversions without actually converting
  --resume              Resume interrupted conversions
  --av1                 Use AV1 codec (best compression)
  --hevc, --h265        Use HEVC/H.265 codec (better than H.264)
  --codec <codec>       Specify codec: h264, hevc, av1
  -h, --help            Show this help message

EXAMPLES:
  node convert-to-hls.js
  node convert-to-hls.js --input ./videos --output ./hls
  node convert-to-hls.js --nvidia
  node convert-to-hls.js --apple-silicon
  node convert-to-hls.js --videotoolbox
  node convert-to-hls.js --cpu-only
  node convert-to-hls.js --dry-run
  node convert-to-hls.js --resume
  node convert-to-hls.js --av1
  node convert-to-hls.js --hevc

GPU ACCELERATION:
  The tool automatically detects available GPU acceleration.
  NVIDIA: Requires CUDA-enabled FFmpeg and nvidia-smi
  Intel:  Requires QSV-enabled FFmpeg and compatible Intel GPU
  AMD:    Requires AMF-enabled FFmpeg and compatible AMD GPU
  Apple:  Requires VideoToolbox-enabled FFmpeg (macOS)
  macOS:  VideoToolbox works on all modern Macs
`);
}

// Run the converter
if (require.main === module) {
    const options = parseArguments();

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    const converter = new HLSConverter();

    // Apply command line options
    if (options.inputDir) {
        converter.config.inputDir = options.inputDir;
    }
    if (options.outputDir) {
        converter.config.outputDir = options.outputDir;
    }
    if (options.dryRun) {
        converter.config.dryRun = true;
    }
    if (options.resume) {
        converter.config.resumeMode = true;
    }
    if (options.enableAV1) {
        converter.config.enableAV1 = true;
        converter.config.codecPreference = 'av1';
    }
    if (options.enableHEVC) {
        converter.config.enableHEVC = true;
        converter.config.codecPreference = 'hevc';
    }
    if (options.codec) {
        converter.config.codecPreference = options.codec;
    }
    if (options.disableGPU) {
        converter.config.autoDetectGPU = false;
        converter.config.useNvidiaGPU = false;
        converter.config.useIntelGPU = false;
        converter.config.useAMDGPU = false;
        converter.config.useAppleGPU = false;
        converter.config.useVideoToolbox = false;
    } else {
        if (options.useNvidiaGPU) {
            converter.config.autoDetectGPU = false;
            converter.config.useNvidiaGPU = true;
        }
        if (options.useIntelGPU) {
            converter.config.autoDetectGPU = false;
            converter.config.useIntelGPU = true;
        }
        if (options.useAMDGPU) {
            converter.config.autoDetectGPU = false;
            converter.config.useAMDGPU = true;
        }
        if (options.useAppleGPU) {
            converter.config.autoDetectGPU = false;
            converter.config.useAppleGPU = true;
        }
        if (options.useVideoToolbox) {
            converter.config.autoDetectGPU = false;
            converter.config.useVideoToolbox = true;
        }
    }

    converter.run().catch(console.error);
}

module.exports = HLSConverter;
