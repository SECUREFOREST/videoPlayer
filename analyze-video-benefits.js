#!/usr/bin/env node

/**
 * Video Transcoding Benefits Analyzer
 * Analyzes video collection to show potential benefits of transcoding
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class VideoAnalyzer {
    constructor() {
        this.videos = [];
        this.analysis = {
            totalFiles: 0,
            totalSize: 0,
            largeFiles: 0,
            hugeFiles: 0,
            estimatedTranscodedSize: 0,
            bandwidthSavings: 0,
            storageSavings: 0,
            qualityBreakdown: {
                '4K': 0,
                '1080p': 0,
                '720p': 0,
                '480p': 0,
                '360p': 0,
                'unknown': 0
            }
        };
    }

    async findVideoFiles(dir) {
        const videoFiles = [];
        const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.flv', '.wmv', '.3gp', '.ogv'];
        
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory()) {
                    const subDirVideos = await this.findVideoFiles(fullPath);
                    videoFiles.push(...subDirVideos);
                } else if (item.isFile()) {
                    const ext = path.extname(item.name).toLowerCase();
                    if (videoExtensions.includes(ext)) {
                        videoFiles.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Ignore permission errors
        }
        
        return videoFiles;
    }

    async getVideoInfo(videoPath) {
        try {
            // Use ffprobe to get video information
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
                bitrate: parseInt(format.bit_rate),
                width: videoStream.width,
                height: videoStream.height,
                codec: videoStream.codec_name,
                frameRate: eval(videoStream.r_frame_rate) || 0
            };
        } catch (error) {
            // Fallback to basic file info if ffprobe fails
            try {
                const stats = await fs.stat(videoPath);
                return {
                    path: videoPath,
                    name: path.basename(videoPath),
                    size: stats.size,
                    duration: 0,
                    bitrate: 0,
                    width: 0,
                    height: 0,
                    codec: 'unknown',
                    frameRate: 0
                };
            } catch (statError) {
                return null;
            }
        }
    }

    estimateTranscodedSize(video) {
        if (!video.width || !video.height) {
            // If we can't determine resolution, estimate based on file size
            if (video.size > 2 * 1024 * 1024 * 1024) { // > 2GB
                return video.size * 0.4; // Estimate 60% reduction
            } else if (video.size > 1024 * 1024 * 1024) { // > 1GB
                return video.size * 0.5; // Estimate 50% reduction
            } else {
                return video.size * 0.6; // Estimate 40% reduction
            }
        }

        const resolution = video.width * video.height;
        let compressionRatio = 0.6; // Default 40% reduction

        // Estimate compression based on resolution
        if (resolution >= 3840 * 2160) { // 4K
            compressionRatio = 0.3; // 70% reduction
        } else if (resolution >= 1920 * 1080) { // 1080p
            compressionRatio = 0.4; // 60% reduction
        } else if (resolution >= 1280 * 720) { // 720p
            compressionRatio = 0.5; // 50% reduction
        } else if (resolution >= 854 * 480) { // 480p
            compressionRatio = 0.6; // 40% reduction
        } else { // Lower resolution
            compressionRatio = 0.7; // 30% reduction
        }

        return Math.round(video.size * compressionRatio);
    }

    categorizeQuality(video) {
        if (!video.width || !video.height) {
            return 'unknown';
        }

        const resolution = video.width * video.height;
        
        if (resolution >= 3840 * 2160) return '4K';
        if (resolution >= 1920 * 1080) return '1080p';
        if (resolution >= 1280 * 720) return '720p';
        if (resolution >= 854 * 480) return '480p';
        if (resolution >= 640 * 360) return '360p';
        
        return 'unknown';
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(seconds) {
        if (seconds === 0) return 'Unknown';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    async analyzeVideos() {
        console.log('🔍 Analyzing video collection...\n');
        
        const videosDir = path.join(__dirname, 'videos');
        const videoFiles = await this.findVideoFiles(videosDir);
        
        console.log(`📹 Found ${videoFiles.length} video files\n`);
        
        // Analyze first 50 videos for detailed analysis
        const filesToAnalyze = videoFiles.slice(0, 50);
        console.log(`🔬 Analyzing ${filesToAnalyze.length} videos for detailed metrics...\n`);
        
        for (let i = 0; i < filesToAnalyze.length; i++) {
            const videoPath = filesToAnalyze[i];
            process.stdout.write(`\r⏳ Processing ${i + 1}/${filesToAnalyze.length}: ${path.basename(videoPath)}`);
            
            const videoInfo = await this.getVideoInfo(videoPath);
            if (videoInfo) {
                this.videos.push(videoInfo);
                
                // Update analysis
                this.analysis.totalFiles++;
                this.analysis.totalSize += videoInfo.size;
                
                if (videoInfo.size > 1024 * 1024 * 1024) { // > 1GB
                    this.analysis.hugeFiles++;
                } else if (videoInfo.size > 100 * 1024 * 1024) { // > 100MB
                    this.analysis.largeFiles++;
                }
                
                const transcodedSize = this.estimateTranscodedSize(videoInfo);
                this.analysis.estimatedTranscodedSize += transcodedSize;
                
                const quality = this.categorizeQuality(videoInfo);
                this.analysis.qualityBreakdown[quality]++;
            }
        }
        
        console.log('\n\n✅ Analysis complete!\n');
    }

    generateReport() {
        const originalSize = this.analysis.totalSize;
        const transcodedSize = this.analysis.estimatedTranscodedSize;
        const savings = originalSize - transcodedSize;
        const savingsPercent = ((savings / originalSize) * 100).toFixed(1);
        
        console.log('📊 VIDEO TRANSCODING BENEFITS ANALYSIS');
        console.log('='.repeat(50));
        
        console.log('\n📁 Collection Overview:');
        console.log(`   Total Videos Analyzed: ${this.analysis.totalFiles}`);
        console.log(`   Large Files (>100MB): ${this.analysis.largeFiles}`);
        console.log(`   Huge Files (>1GB): ${this.analysis.hugeFiles}`);
        console.log(`   Total Original Size: ${this.formatBytes(originalSize)}`);
        
        console.log('\n🎬 Quality Breakdown:');
        Object.entries(this.analysis.qualityBreakdown).forEach(([quality, count]) => {
            if (count > 0) {
                console.log(`   ${quality}: ${count} videos`);
            }
        });
        
        console.log('\n💾 Storage Benefits:');
        console.log(`   Original Size: ${this.formatBytes(originalSize)}`);
        console.log(`   Transcoded Size: ${this.formatBytes(transcodedSize)}`);
        console.log(`   Storage Savings: ${this.formatBytes(savings)} (${savingsPercent}%)`);
        console.log(`   Space for ${Math.floor(originalSize / transcodedSize)}x more videos`);
        
        console.log('\n🌐 Bandwidth Benefits:');
        console.log(`   Per-view bandwidth reduction: ${savingsPercent}%`);
        console.log(`   Monthly bandwidth savings (100 views): ${this.formatBytes(savings * 100)}`);
        console.log(`   Mobile data savings: ${this.formatBytes(savings)} per video`);
        
        console.log('\n⚡ Performance Benefits:');
        const avgOriginalSize = originalSize / this.analysis.totalFiles;
        const avgTranscodedSize = transcodedSize / this.analysis.totalFiles;
        console.log(`   Average file size: ${this.formatBytes(avgOriginalSize)} → ${this.formatBytes(avgTranscodedSize)}`);
        console.log(`   Load time improvement: ~${Math.round(avgOriginalSize / avgTranscodedSize)}x faster`);
        console.log(`   Seek performance: Much faster with HLS chunks`);
        
        console.log('\n💰 Cost Benefits:');
        const monthlyViews = 1000; // Estimate
        const monthlyBandwidthSavings = savings * monthlyViews;
        console.log(`   Monthly bandwidth savings: ${this.formatBytes(monthlyBandwidthSavings)}`);
        console.log(`   CDN cost reduction: ~${savingsPercent}%`);
        console.log(`   Storage cost reduction: ~${savingsPercent}%`);
        
        console.log('\n🎯 Recommended Actions:');
        if (this.analysis.hugeFiles > 0) {
            console.log(`   ⚠️  ${this.analysis.hugeFiles} files >1GB need immediate transcoding`);
        }
        if (this.analysis.largeFiles > 10) {
            console.log(`   📈 ${this.analysis.largeFiles} large files would benefit significantly`);
        }
        console.log('   🚀 Implement HLS streaming for professional quality');
        console.log('   📱 Add multiple quality options for mobile users');
        console.log('   ⚡ Generate thumbnails for better browsing experience');
        
        console.log('\n✨ Expected Results:');
        console.log('   • 50-70% smaller file sizes');
        console.log('   • 3-5x faster loading times');
        console.log('   • Professional streaming experience');
        console.log('   • Better mobile compatibility');
        console.log('   • Significant bandwidth savings');
    }

    async run() {
        try {
            await this.analyzeVideos();
            this.generateReport();
        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            console.log('\n💡 Make sure FFmpeg is installed:');
            console.log('   macOS: brew install ffmpeg');
            console.log('   Ubuntu: sudo apt install ffmpeg');
            console.log('   Windows: Download from https://ffmpeg.org/');
        }
    }
}

// Run analysis if this script is executed directly
if (require.main === module) {
    const analyzer = new VideoAnalyzer();
    analyzer.run().catch(console.error);
}

module.exports = VideoAnalyzer;
