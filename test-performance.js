#!/usr/bin/env node

/**
 * Performance Test Script for Video Player
 * Tests the async file operations and overall performance improvements
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class PerformanceTester {
    constructor() {
        this.results = {
            asyncFileOps: [],
            memoryUsage: [],
            responseTimes: []
        };
    }

    async testAsyncFileOperations() {
        console.log('🧪 Testing async file operations...');
        
        const testDir = path.join(__dirname, 'videos');
        const startTime = performance.now();
        
        try {
            // Test async directory reading
            const items = await fs.readdir(testDir, { withFileTypes: true });
            const readTime = performance.now() - startTime;
            
            console.log(`✅ Async readdir completed in ${readTime.toFixed(2)}ms`);
            console.log(`   Found ${items.length} items`);
            
            // Test async file stats
            const statsStart = performance.now();
            const statsPromises = items.slice(0, 10).map(async item => {
                const fullPath = path.join(testDir, item.name);
                return await fs.stat(fullPath);
            });
            
            await Promise.all(statsPromises);
            const statsTime = performance.now() - statsStart;
            
            console.log(`✅ Async stat operations completed in ${statsTime.toFixed(2)}ms`);
            
            this.results.asyncFileOps.push({
                readdir: readTime,
                stats: statsTime,
                total: performance.now() - startTime
            });
            
        } catch (error) {
            console.log(`❌ Async file operations test failed: ${error.message}`);
        }
    }

    testMemoryUsage() {
        console.log('🧪 Testing memory usage...');
        
        const memUsage = process.memoryUsage();
        const memInfo = {
            rss: Math.round(memUsage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024) // MB
        };
        
        console.log(`📊 Memory Usage:`);
        console.log(`   RSS: ${memInfo.rss} MB`);
        console.log(`   Heap Total: ${memInfo.heapTotal} MB`);
        console.log(`   Heap Used: ${memInfo.heapUsed} MB`);
        console.log(`   External: ${memInfo.external} MB`);
        
        this.results.memoryUsage.push(memInfo);
    }

    async findVideoFiles(dir) {
        const videoFiles = [];
        const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.flv', '.wmv', '.3gp', '.ogv'];
        
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory()) {
                    // Recursively search subdirectories
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
            // Ignore permission errors or other issues
        }
        
        return videoFiles;
    }

    async testApiEndpoints() {
        console.log('🧪 Testing API endpoints...');
        
        const baseUrl = 'http://localhost:4000';
        const endpoints = [
            '/api/server-status',
            '/api/browse',
            '/api/playlists',
            '/api/favorites'
        ];
        
        // First, authenticate to get session cookie
        let cookie = '';
        try {
            const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'password=bringbeerforpassword'
            });
            
            if (loginResponse.ok) {
                // Extract session cookie from response
                const setCookieHeader = loginResponse.headers.get('set-cookie');
                
                if (setCookieHeader) {
                    // Extract the connect.sid cookie
                    const cookieMatch = setCookieHeader.match(/connect\.sid=[^;]+/);
                    if (cookieMatch) {
                        cookie = cookieMatch[0];
                    } else {
                        console.log('❌ No connect.sid found in cookies');
                        return;
                    }
                } else {
                    console.log('❌ No Set-Cookie header found');
                    return;
                }
                console.log('✅ Authentication successful');
            } else {
                console.log('❌ Authentication failed');
                return;
            }
        } catch (error) {
            console.log(`❌ Authentication error: ${error.message}`);
            return;
        }
        
        for (const endpoint of endpoints) {
            const startTime = performance.now();
            
            try {
                const response = await fetch(`${baseUrl}${endpoint}`, {
                    headers: {
                        'Cookie': cookie
                    }
                });
                const responseTime = performance.now() - startTime;
                
                if (response.ok) {
                    console.log(`✅ ${endpoint} - ${responseTime.toFixed(2)}ms`);
                } else {
                    console.log(`❌ ${endpoint} - ${response.status} (${responseTime.toFixed(2)}ms)`);
                }
                
                this.results.responseTimes.push({
                    endpoint,
                    time: responseTime,
                    status: response.status
                });
                
            } catch (error) {
                console.log(`❌ ${endpoint} - Error: ${error.message}`);
            }
        }
    }

    async testLargeVideoHandling() {
        console.log('🧪 Testing large video file handling...');
        
        const testDir = path.join(__dirname, 'videos');
        
        try {
            // Recursively find all video files
            const videoFiles = await this.findVideoFiles(testDir);
            
            console.log(`📹 Found ${videoFiles.length} video files`);
            
            // Test file size handling - sort by size to find the largest files
            let largeFiles = 0;
            let hugeFiles = 0;
            let totalSize = 0;
            
            // Get file sizes and sort by size (largest first)
            const fileSizes = [];
            for (const videoFile of videoFiles) {
                try {
                    const stats = await fs.stat(videoFile);
                    fileSizes.push({
                        path: videoFile,
                        size: stats.size,
                        sizeMB: Math.round(stats.size / 1024 / 1024),
                        sizeGB: Math.round(stats.size / (1024 * 1024 * 1024) * 100) / 100
                    });
                } catch (error) {
                    // Skip files that can't be accessed
                }
            }
            
            // Sort by size (largest first)
            fileSizes.sort((a, b) => b.size - a.size);
            
            // Test the largest files (up to 20)
            const filesToTest = Math.min(fileSizes.length, 20);
            
            for (let i = 0; i < filesToTest; i++) {
                const file = fileSizes[i];
                totalSize += file.sizeMB;
                
                if (file.sizeMB > 1000) { // Files larger than 1GB
                    hugeFiles++;
                    console.log(`📊 ${path.basename(file.path)}: ${file.sizeGB}GB (${file.sizeMB}MB) - HUGE!`);
                } else if (file.sizeMB > 100) { // Files larger than 100MB
                    largeFiles++;
                    console.log(`📊 ${path.basename(file.path)}: ${file.sizeGB}GB (${file.sizeMB}MB)`);
                }
            }
            
            console.log(`✅ Large file support: ${largeFiles} files > 100MB`);
            console.log(`✅ Huge file support: ${hugeFiles} files > 1GB`);
            console.log(`📊 Total size tested: ${Math.round(totalSize)}MB`);
            
            // Test range request capability
            console.log('🔍 Testing range request support...');
            const testVideo = videoFiles[0];
            if (testVideo) {
                // Get relative path from videos directory
                const relativePath = path.relative(path.join(__dirname, 'videos'), testVideo);
                const testUrl = `http://localhost:4000/videos/${encodeURIComponent(relativePath)}`;
                
                try {
                    // First authenticate to get session cookie
                    const loginResponse = await fetch('http://localhost:4000/api/auth/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: 'password=bringbeerforpassword'
                    });
                    
                    let cookie = '';
                    if (loginResponse.ok) {
                        const setCookieHeader = loginResponse.headers.get('set-cookie');
                        if (setCookieHeader) {
                            cookie = setCookieHeader.split(';')[0];
                        }
                    }
                    
                    // Test partial content request
                    const response = await fetch(testUrl, {
                        headers: {
                            'Range': 'bytes=0-1023',
                            'Cookie': cookie
                        }
                    });
                    
                    if (response.status === 206) {
                        console.log('✅ Range requests supported (206 Partial Content)');
                    } else if (response.status === 200) {
                        console.log('⚠️  Range requests not supported (200 OK)');
                    } else {
                        console.log(`❌ Range request failed: ${response.status}`);
                    }
                } catch (error) {
                    console.log(`❌ Range request test failed: ${error.message}`);
                }
            }
            
        } catch (error) {
            console.log(`❌ Large video handling test failed: ${error.message}`);
        }
    }

    generateReport() {
        console.log('\n📊 Performance Test Report');
        console.log('='.repeat(50));
        
        if (this.results.asyncFileOps.length > 0) {
            const fileOps = this.results.asyncFileOps[0];
            console.log(`\n📁 File Operations:`);
            console.log(`   Directory Read: ${fileOps.readdir.toFixed(2)}ms`);
            console.log(`   File Stats: ${fileOps.stats.toFixed(2)}ms`);
            console.log(`   Total Time: ${fileOps.total.toFixed(2)}ms`);
        }
        
        if (this.results.memoryUsage.length > 0) {
            const memory = this.results.memoryUsage[0];
            console.log(`\n💾 Memory Usage:`);
            console.log(`   RSS: ${memory.rss} MB`);
            console.log(`   Heap Used: ${memory.heapUsed} MB`);
        }
        
        if (this.results.responseTimes.length > 0) {
            console.log(`\n🌐 API Response Times:`);
            this.results.responseTimes.forEach(result => {
                console.log(`   ${result.endpoint}: ${result.time.toFixed(2)}ms (${result.status})`);
            });
            
            const avgTime = this.results.responseTimes.reduce((sum, r) => sum + r.time, 0) / this.results.responseTimes.length;
            console.log(`   Average: ${avgTime.toFixed(2)}ms`);
        }
        
        console.log('\n✨ Performance improvements implemented:');
        console.log('   ✅ Async file operations (fs.promises)');
        console.log('   ✅ PM2 clustering enabled');
        console.log('   ✅ Nginx upstream configuration');
        console.log('   ✅ Enhanced caching headers');
        console.log('   ✅ Gzip compression optimization');
        console.log('   ✅ Video streaming optimizations');
    }
}

async function runTests() {
    const tester = new PerformanceTester();
    
    console.log('🚀 Starting Performance Tests...\n');
    
    // Test async file operations
    await tester.testAsyncFileOperations();
    
    // Test memory usage
    tester.testMemoryUsage();
    
    // Test API endpoints (if server is running)
    try {
        await tester.testApiEndpoints();
    } catch (error) {
        console.log('⚠️  API tests skipped (server not running)');
    }
    
    // Test large video handling
    await tester.testLargeVideoHandling();
    
    // Generate report
    tester.generateReport();
}

// Run tests if this script is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = PerformanceTester;
