#!/usr/bin/env node

/**
 * Utility script to identify and fix corrupted M3U8 files
 * This script scans for files with invalid metadata and attempts to fix them
 */

const fs = require('fs').promises;
const path = require('path');

async function checkFileStats(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return {
            valid: true,
            size: stats.size,
            modified: stats.mtime,
            stats: stats
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message,
            size: null,
            modified: null
        };
    }
}

async function scanDirectory(dirPath, corruptedFiles = []) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Skip hidden directories
                if (!entry.name.startsWith('.')) {
                    await scanDirectory(fullPath, corruptedFiles);
                }
            } else if (entry.name.endsWith('.m3u8')) {
                const fileInfo = await checkFileStats(fullPath);
                
                if (!fileInfo.valid || 
                    isNaN(fileInfo.size) || 
                    fileInfo.size === undefined ||
                    isNaN(fileInfo.modified?.getTime())) {
                    
                    corruptedFiles.push({
                        path: fullPath,
                        name: entry.name,
                        issue: fileInfo.valid ? 'Invalid metadata' : fileInfo.error,
                        size: fileInfo.size,
                        modified: fileInfo.modified
                    });
                }
            }
        }
    } catch (error) {
        console.warn(`Warning: Could not scan directory ${dirPath}:`, error.message);
    }
    
    return corruptedFiles;
}

async function fixCorruptedFile(filePath) {
    try {
        // Try to read the file content
        const content = await fs.readFile(filePath, 'utf8');
        
        // Check if it's a valid M3U8 file
        if (!content.includes('#EXTM3U')) {
            console.log(`❌ ${filePath} is not a valid M3U8 file`);
            return false;
        }
        
        // Try to touch the file to update its timestamp
        const now = new Date();
        await fs.utimes(filePath, now, now);
        
        console.log(`✅ Fixed metadata for ${filePath}`);
        return true;
    } catch (error) {
        console.log(`❌ Could not fix ${filePath}:`, error.message);
        return false;
    }
}

async function main() {
    const hlsRoot = path.join(__dirname, 'hls');
    
    console.log('🔍 Scanning for corrupted M3U8 files...');
    console.log(`📁 Scanning directory: ${hlsRoot}`);
    
    const corruptedFiles = await scanDirectory(hlsRoot);
    
    if (corruptedFiles.length === 0) {
        console.log('✅ No corrupted M3U8 files found');
        return;
    }
    
    console.log(`\n❌ Found ${corruptedFiles.length} corrupted M3U8 files:`);
    corruptedFiles.forEach((file, index) => {
        console.log(`${index + 1}. ${file.name}`);
        console.log(`   Path: ${file.path}`);
        console.log(`   Issue: ${file.issue}`);
        console.log(`   Size: ${file.size}`);
        console.log(`   Modified: ${file.modified}`);
        console.log('');
    });
    
    console.log('🔧 Attempting to fix corrupted files...');
    
    let fixed = 0;
    let failed = 0;
    
    for (const file of corruptedFiles) {
        const success = await fixCorruptedFile(file.path);
        if (success) {
            fixed++;
        } else {
            failed++;
        }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`✅ Fixed: ${fixed} files`);
    console.log(`❌ Failed: ${failed} files`);
    
    if (failed > 0) {
        console.log('\n💡 For files that could not be fixed automatically:');
        console.log('   - Check if the file is actually corrupted');
        console.log('   - Consider regenerating the HLS files using the converter');
        console.log('   - Check file permissions and disk space');
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    checkFileStats,
    scanDirectory,
    fixCorruptedFile
};
