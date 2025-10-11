// Modern Video Player Browser with Bootstrap
class ModernVideoPlayerBrowser {
    constructor() {
        this.currentPath = '';
        this.currentVideo = null;
        this.currentVideoDirectory = ''; // Track video's directory separately from browser path
        this.playlists = [];
        this.favorites = [];
        this.searchResults = [];
        this.isFullscreen = false;
        this.playbackProgress = {};
        this.currentPlaylist = null;
        this.currentPlaylistIndex = 0;
        this.selectedPlaylistId = null;
        this.hls = null; // HLS instance for streaming
        this.isHandlingVideoError = false; // Flag to prevent infinite error loops

        // Video player state management
        this.videoState = {
            isInitialized: false,
            isPlaying: false,
            isMuted: false,
            volume: 1.0,
            playbackRate: 1.0,
            currentTime: 0,
            duration: 0,
            isSeeking: false
        };

        // Performance optimization
        this.debounceTimeout = null;
        this.animationFrame = null;

        // Async operation tracking
        this.activeRequests = new Set();
        this.loadingStates = new Map();

        // DOM elements
        this.initializeElements();
        this.init();
    }

    initializeElements() {
        // Main elements
        this.fileList = document.getElementById('file-list');
        this.currentPathDisplay = document.getElementById('current-path');
        this.video = document.getElementById('video');
        this.videoSource = document.getElementById('video-source');
        this.videoTitle = document.getElementById('videoPlayerModalLabel');
        this.videoInfo = document.getElementById('video-info');

        // Validate critical elements
        if (!this.fileList) {
            console.error('Critical element file-list not found');
            return;
        }
        if (!this.video) {
            console.error('Critical element video not found');
            return;
        }

        // Navigation
        this.backBtn = document.getElementById('back-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        // Grid view only - no view toggle elements needed

        // Search and filters
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.filterType = { value: 'all' }; // Default filter type
        this.sortBy = { value: 'name' }; // Default sort by
        this.sortOrder = { value: 'asc' }; // Default sort order
        this.filterDropdown = document.querySelector('[data-bs-toggle="dropdown"]');
        this.sortDropdown = document.querySelectorAll('[data-bs-toggle="dropdown"]')[1];

        // Tabs
        this.tabBtns = document.querySelectorAll('#main-tabs button[data-bs-toggle="pill"]');
        this.tabPanes = document.querySelectorAll('#main-tab-content .tab-pane');

        // Video controls
        this.videoPlayerModal = new bootstrap.Modal(document.getElementById('videoPlayerModal'));
        this.playlistAddBtn = document.getElementById('playlist-add-btn');
        this.favoriteBtn = document.getElementById('favorite-btn');

        // Add event listener for modal close
        if (this.videoPlayerModal) {
            this.videoPlayerModal._element.addEventListener('hidden.bs.modal', () => {
                this.pauseVideo();
            });
        }

        // Playlist and favorites
        this.createPlaylistBtn = document.getElementById('create-playlist-btn');
        this.playlistList = document.getElementById('playlist-list');
        this.favoritesList = document.getElementById('favorites-list');
        this.searchList = document.getElementById('search-list');
        this.searchCount = document.getElementById('search-count');

        // Modals
        this.playlistModal = new bootstrap.Modal(document.getElementById('playlistModal'));
        this.playlistName = document.getElementById('playlist-name');
        this.playlistVideos = document.getElementById('playlist-videos');
        this.savePlaylistBtn = document.getElementById('save-playlist-btn');
    }

    init() {
        this.bindEvents();
        this.initializeVideoPlayer();
        this.checkServerStatus();
        this.loadDirectory();
        this.loadPlaylists();
        this.loadFavorites();
        this.loadProgressFromStorage();
    }

    bindEvents() {
        // Navigation
        if (this.backBtn) this.backBtn.addEventListener('click', () => this.goBack());
        if (this.refreshBtn) this.refreshBtn.addEventListener('click', () => {
            // Use force refresh to clear all caches
            if (window.forceRefresh) {
                // Show loading state on refresh button
                const originalHTML = this.refreshBtn.innerHTML;
                this.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                this.refreshBtn.disabled = true;
                
                // Call force refresh
                window.forceRefresh();
            } else {
                // Fallback to regular refresh
                this.loadDirectory();
            }
        });

        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

        // Grid view only - no view toggle needed

        // Search and filters
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.debounceSearch(e.target.value);
            });
            this.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.performSearch();
            });
        }
        if (this.searchBtn) this.searchBtn.addEventListener('click', () => this.performSearch());

        // Filter dropdown
        document.querySelectorAll('[data-filter]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.filterType.value = e.target.dataset.filter;
                this.updateFilterDropdownText(e.target.textContent.trim());
                this.loadDirectory();
            });
        });

        // Sort dropdown
        document.querySelectorAll('[data-sort]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const sortValue = e.target.dataset.sort;

                // Toggle sort order if clicking the same sort option
                if (this.sortBy.value === sortValue) {
                    this.sortOrder.value = this.sortOrder.value === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortBy.value = sortValue;
                    this.sortOrder.value = 'asc'; // Reset to ascending for new sort
                }

                const orderIcon = this.sortOrder.value === 'asc' ? '↑' : '↓';
                this.updateSortDropdownText(`${e.target.textContent.trim()} ${orderIcon}`);
                
                // Check if we're on the search results tab
                const searchResultsTab = document.getElementById('search-results-pane');
                if (searchResultsTab && searchResultsTab.classList.contains('active')) {
                    // Sort search results
                    this.sortSearchResults();
                } else {
                    // Sort directory contents - maintain current path
                    this.loadDirectory(this.currentPath);
                }
            });
        });


        // Tabs
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.id.replace('-tab', '')));
        });

        // Video controls
        if (this.playlistAddBtn) this.playlistAddBtn.addEventListener('click', () => this.addToPlaylist());
        if (this.favoriteBtn) this.favoriteBtn.addEventListener('click', () => this.toggleFavorite());

        // Playlist and favorites
        if (this.createPlaylistBtn) this.createPlaylistBtn.addEventListener('click', () => this.showCreatePlaylistModal());
        if (this.savePlaylistBtn) this.savePlaylistBtn.addEventListener('click', () => this.savePlaylist());

        // Enhanced keyboard navigation and accessibility
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        document.addEventListener('keyup', (e) => this.handleKeyboardUp(e));

        // Focus management
        document.addEventListener('focusin', (e) => this.handleFocusIn(e));
        document.addEventListener('focusout', (e) => this.handleFocusOut(e));

        // ARIA live region for announcements
        this.setupAriaLiveRegion();

        // Fullscreen events
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => this.cleanup());
        
        // Add keyboard shortcut for force refresh (Ctrl+F5 or Cmd+Shift+R)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey && e.key === 'F5') || (e.metaKey && e.shiftKey && e.key === 'R')) {
                e.preventDefault();
                if (window.forceRefresh) {
                    window.forceRefresh();
                }
            }
        });
    }

    async loadDirectory(path = '') {
        if (this.isLoading('loadDirectory')) {
            return;
        }

        return this.safeAsyncOperation(async () => {
            this.showLoading();
            
            // Ensure path is valid
            const validPath = (path === undefined || path === null) ? '' : path;
            // Loading directory
            
            const params = new URLSearchParams({
                path: validPath,
                search: this.searchInput.value,
                sortBy: this.sortBy.value || 'name',
                sortOrder: this.sortOrder.value || 'asc',
                filterType: this.filterType.value || 'all'
            });

            const response = await fetch(`/api/browse?${params}`, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            const data = await response.json();

            if (response.ok) {
                this.currentPath = data.currentPath;
                this.renderFileList(data.items, data.parentPath);
                this.updateBackButton(data.parentPath);
            } else {
                this.showError(data.error || 'Failed to load directory');
            }
        }, 'loadDirectory');
    }

    renderFileList(items, parentPath) {
        this.fileList.innerHTML = '';



        this.renderGridView(items);

        // Start background thumbnail generation for all videos
    }

    renderListView(items) {
        items.forEach(item => {
            const fileItem = this.createFileItem(item);
            this.fileList.appendChild(fileItem);
        });
    }

    renderGridView(items) {
        items.forEach(item => {
            const gridItem = this.createGridItem(item);
            this.fileList.appendChild(gridItem);
        });
    }

    createFileItem(item) {
        const col = document.createElement('div');
        col.className = 'col-12';

        const div = document.createElement('div');
        div.className = 'file-item p-3 d-flex align-items-center';

        const icon = this.getFileIcon(item);
        const size = this.formatFileSize(item.size);
        const date = this.formatDate(item.modified);

        // Create thumbnail container for videos
        let thumbnailHtml = '';
        if (item.isVideo) {
            if (item.thumbnailUrl) {
                // Thumbnail is available
                thumbnailHtml = `
                    <div class="file-thumbnail me-2 me-md-3 position-relative" style="width: 60px; height: 45px; background-color: #1F2937; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <img src="${item.thumbnailUrl}" 
                             alt="Thumbnail for ${item.name}" 
                             class="img-fluid rounded" 
                             style="width: 100%; height: 100%; object-fit: cover;"
                             loading="lazy"
                             onerror="this.parentElement.innerHTML='<div class=\\"d-flex align-items-center justify-content-center h-100 text-muted\\"><i class=\\"fas fa-video fa-lg\\"></i></div>
                    </div>
                `;
            } else {
                // Thumbnail not available (should be generated on server startup)
                thumbnailHtml = `
                    <div class="file-thumbnail me-2 me-md-3 position-relative" style="width: 60px; height: 45px; background-color: #1F2937; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <div class="d-flex align-items-center justify-content-center h-100 text-muted" title="Thumbnail not available">
                            <i class="fas fa-video fa-lg"></i>
                        </div>
                    </div>
                `;
            }
        } else {
            thumbnailHtml = `<div class="file-icon me-3" title="${item.isDirectory ? 'Directory' : 'File'}">${icon}</div>`;
        }

        div.innerHTML = `
            ${thumbnailHtml}
            <div class="file-info flex-grow-1">
                <div class="file-name">
                    ${this.formatFileName(item.name, item.isVideo, item.isHLS)}
                    ${item.isHLS ? '<span class="badge bg-primary ms-2">HLS</span>' : ''}
                </div>
                <div class="file-details d-flex gap-3">
                    ${item.isDirectory ?
                `<span class="file-size">Directory${item.fileCount !== null && item.fileCount !== undefined ? ` (${item.fileCount} items)` : ''}${item.isHLSDirectory ? ' (HLS)' : ''}</span>` :
                (item.isVideo ? `<span class="file-size">${item.duration ? `Duration: ${this.formatTime(item.duration)}` : 'Duration: Unknown'}</span>` : `<span class="file-size">${size}</span>`)
            }
                    <span class="file-date">${date}</span>
                </div>
            </div>
        `;

        div.addEventListener('click', () => {
            if (item.isDirectory) {
                this.loadDirectory(item.path);
            } else if (item.isVideo) {
                this.playVideo(item);
            } else {
                this.showStatusMessage('This file type is not supported. Only video files can be played.', 'warning');
            }
        });

        // No need to poll since thumbnails are generated on server startup

        col.appendChild(div);
        return col;
    }

    createGridItem(item) {
        const col = document.createElement('div');
        col.className = 'col-6 col-md-4 col-lg-3 col-xl-2';

        const div = document.createElement('div');
        div.className = 'file-grid-item h-100';

        const icon = this.getFileIcon(item);
        const size = this.formatFileSize(item.size);

        div.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name">${this.formatFileName(item.name, item.isVideo, item.isHLS)}</div>
            <div class="file-details">
                ${item.isDirectory ? `Directory${item.fileCount !== null && item.fileCount !== undefined ? ` (${item.fileCount} items)` : ''}` : (item.isVideo ? (item.duration ? `Duration: ${this.formatTime(item.duration)}` : 'Duration: Unknown') : size)}
            </div>
        `;

        if (item.isVideo) {
            if (item.thumbnailUrl) {
                // Thumbnail is available
                const thumbnailContainer = div.querySelector('.file-icon');
                if (thumbnailContainer) {
                    thumbnailContainer.innerHTML = `
                        <img src="${item.thumbnailUrl}" 
                             alt="Thumbnail for ${item.name}" 
                             class="img-fluid rounded" 
                             style="width: 100%; height: 120px; object-fit: cover;"
                             loading="lazy"
                             onerror="this.parentElement.innerHTML='<div class=\\"d-flex align-items-center justify-content-center h-100 text-muted\\"><i class=\\"fas fa-video fa-2x\\"></i></div>
                    `;
                }
            } else {
                // Thumbnail not available (should be generated on server startup)
                const thumbnailContainer = div.querySelector('.file-icon');
                if (thumbnailContainer) {
                    thumbnailContainer.innerHTML = `
                        <div class="d-flex align-items-center justify-content-center h-100 text-muted" title="Thumbnail not available">
                            <i class="fas fa-video fa-2x"></i>
                        </div>
                    `;
                }
            }
        }

        div.addEventListener('click', () => {
            if (item.isDirectory) {
                this.loadDirectory(item.path);
            } else if (item.isVideo) {
                this.playVideo(item);
            } else {
                this.showStatusMessage('This file type is not supported. Only video files can be played.', 'warning');
            }
        });

        col.appendChild(div);
        return col;
    }



    async checkServerStatus() {
        try {
            // Check if server is still generating thumbnails
            const response = await fetch('/api/server-status', {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.generatingThumbnails) {
                    this.showServerStatusMessage('🔄 Server is generating thumbnails, some may not be available yet...', 'info');
                }
            }
        } catch (error) {
            // Server status check failed, but that's okay
            // Server status check failed
        }
    }

    showServerStatusMessage(message, type = 'info') {
        const statusDiv = document.createElement('div');
        statusDiv.className = `alert alert-${type === 'info' ? 'primary' : type} alert-dismissible fade show position-fixed`;
        statusDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        statusDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        document.body.appendChild(statusDiv);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.remove();
            }
        }, 5000);
    }


    getFileIcon(item) {
        if (item.isDirectory) {
            return '📁';
        } else if (item.isVideo) {
            return '🎬';
        } else {
            return '📄';
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatFileName(name, isVideo = false, isHLS = false) {
        if (isVideo && name.toLowerCase().endsWith('.mp4')) {
            return name.slice(0, -4); // Remove .mp4 extension
        }
        if (isHLS && name.toLowerCase().endsWith('.m3u8')) {
            return name.slice(0, -6); // Remove .m3u8 extension
        }
        return name;
    }

    formatDate(date) {
        return new Date(date).toLocaleDateString();
    }

    createClickablePath(relativePath, fullPath) {
        // Create clickable path
        if (!relativePath) return '';
        
        // Split the path into parts
        const pathParts = relativePath.split('/').filter(part => part !== '');
        
        if (pathParts.length === 0) return relativePath;
        
        // For HLS videos, show only the main category (first level after hls)
        let folderParts;
        if (pathParts[0] === 'hls' && pathParts.length > 1) {
            // For HLS videos, only show the main category (skip hls prefix)
            folderParts = pathParts.slice(1, 2); // only main category, skip hls
        } else if (pathParts[pathParts.length - 1] === 'master.m3u8') {
            // Remove the master.m3u8 filename
            folderParts = pathParts.slice(0, -1);
        } else {
            // For regular files, remove the last part (filename)
            folderParts = pathParts.slice(0, -1);
        }
        
        if (folderParts.length === 0) {
            // If no folders, just show the filename
            return pathParts[pathParts.length - 1];
        }
        
        // Create clickable breadcrumb-style path for folders only
        let clickablePath = '';
        let currentPath = '';
        
        folderParts.forEach((part, index) => {
            currentPath += (currentPath ? '/' : '') + part;
            
            // For HLS videos, ensure the data-path includes the hls/ prefix
            const dataPath = pathParts[0] === 'hls' ? 'hls/' + currentPath : currentPath;
            
            // Create clickable span for each folder
            clickablePath += `<span class="clickable-folder" data-path="${dataPath}" style="cursor: pointer; color: #B91C1C; font-weight: bold; transition: all 0.2s ease; padding: 2px 4px; border-radius: 3px;" title="Navigate to ${dataPath}" onmouseover="this.style.backgroundColor='#B91C1C'; this.style.color='#FFFFFF';" onmouseout="this.style.backgroundColor=''; this.style.color='#B91C1C';">${part}</span>`;
            
            // Add separator if not the last folder
            if (index < folderParts.length - 1) {
                clickablePath += ' / ';
            }
        });
        
        // Truncate if too long (check actual text content, not HTML)
        const textContent = folderParts.join('/');
        if (textContent.length > 50) {
            // If the original text is too long, truncate the clickable path
            // Use a much higher limit to account for HTML tags
            const truncated = clickablePath.substring(0, 200) + '...';
            // Path truncated for display
            return truncated;
        }
        
        // Return final clickable path
        return clickablePath;
    }

    async playVideo(item) {
        try {
            // Reset error handling state when starting a new video
            this.isHandlingVideoError = false;
            
            // Show loading state
            this.setLoadingState('video', true);
            
            const response = await fetch(`/api/video-info?path=${encodeURIComponent(item.path)}`, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            const videoData = await response.json();

            if (response.ok) {
                this.currentVideo = item;
                // Track video's directory separately from browser's current path
                this.currentVideoDirectory = this.getVideoDirectory(item.path);
                // Reset video state duration to prevent showing previous video's duration
                this.videoState.duration = 0;
                this.videoTitle.innerHTML = `${this.formatFileName(videoData.name, videoData.isVideo, videoData.isHLS)}`;

                // Check if it's an HLS file
                if (videoData.isHLS && videoData.extension === '.m3u8') {
                    // Remove hls/ prefix from path to avoid double hls/
                    const hlsPath = item.path.startsWith('hls/') ? item.path.substring(4) : item.path;
                    // Add cache busting parameter to prevent browser caching
                    const cacheBuster = `?t=${Date.now()}`;
                    const videoUrl = `/hls/${encodeURIComponent(hlsPath)}${cacheBuster}`;
                    // Constructed HLS URL for video
                    // Item data available
                    await this.playHLSVideo(videoUrl, videoData);
                } else {
                    // Regular video file - clean up any existing HLS instance
                    await this.cleanupHLSInstance();
                    
                    // Clear video element to prevent segment mixing
                    this.video.removeAttribute('src');
                    this.video.load();
                    
                    const videoUrl = `/videos/${encodeURIComponent(item.path)}`;
                    console.log('Loading regular video:', {
                        videoUrl,
                        mimeType: videoData.mimeType,
                        videoData: {
                            name: videoData.name,
                            path: videoData.path,
                            isHLS: videoData.isHLS,
                            duration: videoData.duration
                        }
                    });
                    
                    // Debug: Check video element state before setting source
                    console.log('Video element state before setting source:', {
                        currentSrc: this.video.currentSrc,
                        src: this.video.src,
                        networkState: this.video.networkState,
                        readyState: this.video.readyState
                    });
                    
                    this.videoSource.src = videoUrl;
                    this.videoSource.type = videoData.mimeType;
                    this.video.src = videoUrl;
                    
                    // Debug: Check video element state after setting source
                    console.log('Video element state after setting source:', {
                        currentSrc: this.video.currentSrc,
                        src: this.video.src,
                        networkState: this.video.networkState,
                        readyState: this.video.readyState
                    });
                    
                    this.video.load();
                }

                // Update video info
                this.updateVideoInfo(videoData);

                // Update favorite button state
                this.updateFavoriteButtonState();

                // Show modal
                this.videoPlayerModal.show();

                // Restore progress if available
                this.restoreProgress(item.path);

                // Autoplay the video
                this.video.play().catch(error => {
                    // Autoplay failed
                });
                
                // Clear loading state
                this.setLoadingState('video', false);
            } else {
                this.setLoadingState('video', false);
                this.showStatusMessage('Error loading video: ' + videoData.error, 'error');
            }
        } catch (error) {
            this.setLoadingState('video', false);
            this.handleError(error, 'video');
        }
    }

    async playHLSVideo(videoUrl, videoData) {
        try {
            // Reset video state duration to prevent showing previous video's duration
            this.videoState.duration = 0;
            
            // Check if HLS is supported
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                // Using HLS.js for HLS playback
                
                // Comprehensive HLS cleanup to prevent segment mixing
                await this.cleanupHLSInstance();

                // Clear video element completely to prevent segment mixing
                this.video.removeAttribute('src');
                this.video.load();

                // Clear browser cache for HLS content
                if ('caches' in window) {
                    try {
                        const cacheNames = await caches.keys();
                        for (const cacheName of cacheNames) {
                            const cache = await caches.open(cacheName);
                            const requests = await cache.keys();
                            for (const request of requests) {
                                if (request.url.includes('/hls/')) {
                                    await cache.delete(request);
                                }
                            }
                        }
                    } catch (error) {
                        console.log('Cache clearing not available:', error);
                    }
                }

                // Wait for cleanup to complete
                await new Promise(resolve => setTimeout(resolve, 200));

                // Create new HLS instance with performance optimizations
                this.hls = new Hls({
                    debug: false,  // Disable debug mode to reduce logging
                    enableWorker: true,
                    
                    // Buffer management for memory optimization and smooth seeking
                    backBufferLength: 30, // Reduced for memory efficiency
                    maxBufferLength: 60, // Limit buffer size
                    maxMaxBufferLength: 120, // Maximum buffer limit
                    
                    // Additional logging control
                    verbose: false,
                    maxBufferSize: 60 * 1000 * 1000, // 60MB buffer size limit
                    maxBufferHole: 0.1, // Reduce buffer holes
                    highBufferWatchdogPeriod: 2, // Monitor buffer health
                    
                    // Enhanced buffer management for seeking
                    maxBufferStarvationDelay: 1, // Minimal delay for buffer starvation
                    
                    // Seeking and playback optimization
                    nudgeOffset: 0.1, // Fine-tune seeking
                    nudgeMaxRetry: 3, // Retry failed seeks
                    maxFragLookUpTolerance: 0.25, // Fragment lookup tolerance
                    
                    // Enhanced seeking for smooth scrubbing
                    seekHole: 0.1, // Allow seeking within segments
                    seekMode: 'accurate', // Use accurate seeking mode
                    seekRangeStart: 0, // Allow seeking from start
                    seekRangeEnd: Infinity, // Allow seeking to end
                    seekToStart: true, // Allow seeking to start
                    seekToEnd: true, // Allow seeking to end
                    
                    // Live streaming optimization
                    liveSyncDurationCount: 3, // Live sync optimization
                    liveMaxLatencyDurationCount: 10, // Max latency for live
                    liveDurationInfinity: true, // Handle infinite live streams
                    
                    // Network and loading optimization (modern API)
                    manifestLoadPolicy: {
                        default: {
                            maxTimeToFirstByteMs: 10000,
                            maxLoadTimeMs: 10000,
                            timeoutRetry: {
                                maxNumRetry: 4,
                                retryDelayMs: 1000,
                                maxRetryDelayMs: 0
                            },
                            errorRetry: {
                                maxNumRetry: 4,
                                retryDelayMs: 1000,
                                maxRetryDelayMs: 8000
                            }
                        }
                    },
                    playlistLoadPolicy: {
                        default: {
                            maxTimeToFirstByteMs: 10000,
                            maxLoadTimeMs: 10000,
                            timeoutRetry: {
                                maxNumRetry: 4,
                                retryDelayMs: 1000,
                                maxRetryDelayMs: 0
                            },
                            errorRetry: {
                                maxNumRetry: 4,
                                retryDelayMs: 1000,
                                maxRetryDelayMs: 8000
                            }
                        }
                    },
                    fragLoadPolicy: {
                        default: {
                            maxTimeToFirstByteMs: 20000,
                            maxLoadTimeMs: 20000,
                            timeoutRetry: {
                                maxNumRetry: 6,
                                retryDelayMs: 1000,
                                maxRetryDelayMs: 0
                            },
                            errorRetry: {
                                maxNumRetry: 6,
                                retryDelayMs: 1000,
                                maxRetryDelayMs: 8000
                            }
                        }
                    },
                    
                    // Preloading strategies
                    startFragPrefetch: true, // Prefetch start fragment
                    testBandwidth: true, // Test bandwidth for quality selection
                    progressive: false, // Disable progressive for better streaming
                    
                    // Quality selection optimization - Always use best quality
                    abrEwmaFastLive: 1.0, // Very fast adaptation to best quality
                    abrEwmaSlowLive: 1.0, // Very slow adaptation (stick to best)
                    abrEwmaFastVoD: 1.0, // Very fast adaptation to best quality
                    abrEwmaSlowVoD: 1.0, // Very slow adaptation (stick to best)
                    abrEwmaDefaultEstimate: 10000000, // High bandwidth estimate to force best quality
                    abrBandWidthFactor: 1.0, // Use full bandwidth
                    abrBandWidthUpFactor: 1.0, // Always go up to best quality
                    abrMaxWithRealBitrate: true, // Always use maximum available bitrate
                    maxStarvationDelay: 1, // Minimal starvation delay
                    maxLoadingDelay: 1, // Minimal loading delay
                    minAutoBitrate: 10000000, // High minimum bitrate to force best quality
                    
                    // Security and compatibility
                    enableSoftwareAES: true, // Software AES for compatibility
                    emeEnabled: false, // Disable EME for better performance
                    widevineLicenseUrl: null, // No widevine
                    drmSystemOptions: {}, // No DRM options
                    
                    // Network optimization
                    xhrSetup: (xhr, url) => {
                        // Add cache busting headers to prevent browser caching
                        xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                        xhr.setRequestHeader('Pragma', 'no-cache');
                        xhr.setRequestHeader('Expires', '0');
                        // Add timestamp to prevent caching
                        const timestamp = Date.now();
                        xhr.setRequestHeader('X-Cache-Buster', timestamp.toString());
                        // Note: Connection header is unsafe and removed
                    }
                });

                // Load the HLS source with cache busting
                console.log('Loading HLS source:', videoUrl);
                this.hls.loadSource(videoUrl);
                this.hls.attachMedia(this.video);
                
                // HLS setup complete
                
                // Enhanced seeking behavior for HLS
                this.video.addEventListener('seeking', () => {
                    // Video seeking
                });
                
                this.video.addEventListener('seeked', () => {
                    // Video seeked
                });

                // Handle HLS events
                this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    // HLS manifest parsed
                    
                    // Automatically select the best quality (highest bitrate)
                    if (this.hls.levels && this.hls.levels.length > 0) {
                        let bestLevelIndex = 0;
                        let bestBitrate = this.hls.levels[0].bitrate;
                        
                        for (let i = 1; i < this.hls.levels.length; i++) {
                            if (this.hls.levels[i].bitrate > bestBitrate) {
                                bestBitrate = this.hls.levels[i].bitrate;
                                bestLevelIndex = i;
                            }
                        }
                        
                        // Selecting best quality level
                        this.hls.currentLevel = bestLevelIndex;
                    }
                });

                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error('HLS error:', data);
                    if (data.fatal) {
                        this.handleHLSError(data);
                    } else {
                        // HLS non-fatal error
                    }
                });

                // Handle HLS stream ending properly
                this.hls.on(Hls.Events.BUFFER_EOS, () => {
                    // HLS stream ended
                    // Don't call endOfStream() if MediaSource is already ended
                    if (this.hls.media && this.hls.media.readyState !== 'ended') {
                        try {
                            if (this.hls.mediaSource && this.hls.mediaSource.readyState === 'open') {
                                this.hls.mediaSource.endOfStream();
                                // MediaSource ended successfully
                            } else {
                                // MediaSource not in open state
                            }
                        } catch (error) {
                            // MediaSource already ended or in invalid state
                        }
                    } else {
                        // Media already ended
                    }
                });

                // Handle MediaSource state changes
                this.hls.on(Hls.Events.MEDIA_SOURCE_OPENED, () => {
                    // MediaSource opened successfully
                });

                this.hls.on(Hls.Events.MEDIA_SOURCE_ENDED, () => {
                    // MediaSource ended
                });

                // Enhanced seeking events for better scrubbing
                this.hls.on(Hls.Events.FRAG_LOADING, (event, data) => {
                    // Loading fragment for seeking
                });

                this.hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
                    // Fragment loaded for seeking
                });

                // Track HLS progress for resume functionality
                this.hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
                    // HLS quality switched
                    // Quality switching is disabled - always use best quality
                });




            } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
                // Using native HLS support (Safari)
                // Reset video state duration to prevent showing previous video's duration
                this.videoState.duration = 0;
                
                // Clean up any existing HLS instance for native HLS
                await this.cleanupHLSInstance();
                
                // Clear video element completely
                this.video.removeAttribute('src');
                this.video.load();
                
                // Wait for cleanup
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Add cache busting for native HLS
                const cacheBuster = videoUrl.includes('?') ? '&' : '?';
                const nativeHlsUrl = `${videoUrl}${cacheBuster}t=${Date.now()}`;
                console.log('Loading native HLS source:', nativeHlsUrl);
                
                this.video.src = nativeHlsUrl;
                this.video.load();
            } else {
                throw new Error('HLS is not supported in this browser');
            }
            
            // Update video info after HLS setup
            this.updateVideoInfo(videoData);
            
            // Update favorite button state
            this.updateFavoriteButtonState();
            
            // Show modal
            this.videoPlayerModal.show();
            
            // Restore progress if available
            if (this.currentVideo && this.currentVideo.path) {
                this.restoreProgress(this.currentVideo.path);
            }
            
            // Check for domain name issue before playing
            if (this.video.src && (this.video.src === window.location.href || this.video.src === window.location.origin + '/')) {
                console.error('CRITICAL: Video src is set to domain name before play! Clearing it...', {
                    videoSrc: this.video.src,
                    currentVideo: this.currentVideo?.name || 'Unknown',
                    isHLS: this.currentVideo?.isHLS || false,
                    timestamp: new Date().toISOString()
                });
                
                this.video.removeAttribute('src');
                this.video.load();
                return;
            }
            
            // Autoplay the video (wait for manifest to be parsed)
            this.video.play().catch(error => {
                console.log('Autoplay failed (will retry after manifest parsed):', error.message);
            });
            
        } catch (error) {
            console.error('HLS playback error:', error);
            this.showStatusMessage('HLS playback error: ' + error.message, 'error');
            
            // Fallback: Try to find and play the original video file
            this.fallbackToOriginalVideo(videoData);
        }
    }

    async fallbackToOriginalVideo(videoData) {
        try {
            // Only try fallback if this is an HLS file
            if (!videoData.isHLS || videoData.extension !== '.m3u8') {
                this.showStatusMessage('No fallback available for this file type', 'error');
                return;
            }
            
            console.log('Attempting fallback for HLS video:', videoData);
            
            // Clean up HLS instance properly to prevent further errors
            if (this.hls) {
                console.log('Cleaning up HLS instance');
                this.hls.off(); // Remove all event listeners
                this.hls.detachMedia(); // Detach from video element
                this.hls.destroy(); // Destroy the instance
                this.hls = null;
            }
            
            // Clear the video element completely to prevent further errors
            this.video.removeAttribute('src');
            this.video.load();
            
            // For HLS-only content, just show a helpful message
            // Don't try to find original files as they likely don't exist
            this.showStatusMessage('HLS video failed to load. This appears to be HLS-only content with no original video file.', 'info');
            
            // Reset the error handling flag
            this.isHandlingVideoError = false;
            
        } catch (error) {
            console.error('Fallback error:', error);
            this.showStatusMessage('Fallback failed: ' + error.message, 'error');
            this.isHandlingVideoError = false;
        }
    }

    handleHLSError(errorData) {
        // Create safe copies of error data to prevent console logging issues
        const hlsErrorInfo = {
            type: errorData.type || 'unknown',
            details: errorData.details || 'no details',
            fatal: errorData.fatal || false,
            error: errorData.error ? String(errorData.error) : 'no error object',
            timestamp: new Date().toISOString()
        };
        
        console.error('HLS fatal error:', hlsErrorInfo);
        
        // Prevent infinite loop if we're already handling a video error
        if (this.isHandlingVideoError) {
            console.log('Already handling video error, skipping HLS error handling');
            return;
        }
        
        switch (errorData.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                this.showStatusMessage('HLS network error - retrying...', 'warning');
                this.hls.startLoad();
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                this.showStatusMessage('HLS media error - attempting recovery...', 'warning');
                this.hls.recoverMediaError();
                break;
            default:
                this.showStatusMessage('HLS playback error: ' + errorData.details, 'error');
                // Set flag to prevent infinite loop
                this.isHandlingVideoError = true;
                // Try fallback to original video
                this.fallbackToOriginalVideo(this.currentVideo);
                break;
        }
    }







    updateVideoInfo(videoData = null) {
        if (videoData) {
            const size = this.formatFileSize(videoData.size);
            const date = this.formatDate(videoData.modified);
            this.videoInfo.innerHTML = `
                <strong>File:</strong> ${this.formatFileName(videoData.name, videoData.isVideo, videoData.isHLS)}<br>
                <strong>Directory:</strong> ${this.currentVideoDirectory || 'Root'}<br>
                <strong>Size:</strong> ${size}<br>
                <strong>Modified:</strong> ${date}<br>
                <strong>Format:</strong> ${videoData.extension.toUpperCase()}
            `;
        } else if (this.currentVideo && this.video) {
            // Use duration from currentVideo if available (for HLS), otherwise use video.duration
            const duration = this.currentVideo.duration || this.video.duration || 0;
            this.videoInfo.innerHTML = `
                <strong>File:</strong> ${this.formatFileName(this.currentVideo.name, this.currentVideo.isVideo, this.currentVideo.isHLS)}<br>
                <strong>Directory:</strong> ${this.currentVideoDirectory || 'Root'}<br>
                <strong>Duration:</strong> ${this.formatTime(duration)}<br>
                <strong>Status:</strong> ${this.videoState.isPlaying ? 'Playing' : 'Paused'}
            `;
        }
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    togglePlayPause() {
        if (!this.video || !this.videoState.isInitialized) {
            this.showStatusMessage('Video not ready', 'warning');
            return;
        }

        if (this.videoState.isPlaying) {
            this.video.pause();
        } else {
            this.video.play().catch(error => {
                console.error('Play failed:', error);
                this.showStatusMessage('Failed to play video', 'error');
            });
        }
    }

    updateProgress() {
        if (this.video.duration && this.currentVideo) {
            this.saveProgress(this.currentVideo.path, this.video.currentTime);
        }
    }

    toggleFullscreen() {
        if (!this.isFullscreen) {
            if (this.video.requestFullscreen) {
                this.video.requestFullscreen().catch(err => {
                    console.error('Fullscreen request failed:', err);
                    this.showStatusMessage('Failed to enter fullscreen mode', 'error');
                });
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(err => {
                    console.error('Exit fullscreen failed:', err);
                });
            }
        }
    }

    handleFullscreenChange() {
        this.isFullscreen = !!document.fullscreenElement;
    }

    pauseVideo() {
        if (this.video && !this.video.paused) {
            this.video.pause();
        }
    }

    closeVideo() {
        this.videoPlayerModal.hide();
        this.video.pause();
        this.video.currentTime = 0;
        
        // Clean up HLS instance if exists
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        
        
        this.currentVideo = null;
    }

    onVideoEnded() {
        // First try to play next in playlist
        if (this.currentPlaylist && this.currentPlaylist.videos.length > 0) {
            this.playNextInPlaylist();
        } else {
            // If no playlist, try to play next video in current directory
            this.playNextInDirectory();
        }
    }

    playNextInPlaylist() {
        if (this.currentPlaylist && this.currentPlaylist.videos.length > 0) {
            this.currentPlaylistIndex++;
            if (this.currentPlaylistIndex < this.currentPlaylist.videos.length) {
                const nextVideo = this.currentPlaylist.videos[this.currentPlaylistIndex];
                this.playVideo(nextVideo);
            } else {
                // End of playlist
                this.currentPlaylist = null;
                this.currentPlaylistIndex = 0;
                this.showStatusMessage('Playlist ended', 'info');
            }
        }
    }

    async playNextInDirectory() {
        try {
            if (!this.currentVideo || !this.currentVideo.path) {
                this.showStatusMessage('No video currently playing', 'info');
                return;
            }

            // Use the video's directory (not browser's current path)
            const videoDirectory = this.currentVideoDirectory;
            console.log(`🔍 Looking for next video in directory: "${videoDirectory}"`);
            console.log(`📁 Current video: "${this.currentVideo.name}" (${this.currentVideo.path})`);
            
            // Loading directory for path
            const response = await fetch(`/api/browse?path=${encodeURIComponent(videoDirectory)}`, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            const data = await response.json();
            
            if (response.ok && data.items) {
                // Filter only video files
                const videos = data.items.filter(item => item.isVideo);
                console.log(`📊 Found ${videos.length} videos in directory:`, videos.map(v => v.name));
                console.log(`🎬 All items in directory:`, data.items.map(item => ({ name: item.name, isVideo: item.isVideo, isDirectory: item.isDirectory })));
                
                if (videos.length > 1) {
                    // Find current video index
                    const currentIndex = videos.findIndex(video => video.path === this.currentVideo.path);
                    console.log(`🎯 Current video index: ${currentIndex} (looking for: "${this.currentVideo.path}")`);
                    console.log(`🔗 Video paths in directory:`, videos.map(v => v.path));
                    
                    if (currentIndex !== -1 && currentIndex < videos.length - 1) {
                        // Play next video
                        const nextVideo = videos[currentIndex + 1];
                        this.playVideo(nextVideo);
                        this.showStatusMessage(`Auto-playing: ${this.formatFileName(nextVideo.name, true)}`, 'info');
                    } else {
                        this.showStatusMessage('No more videos in this directory', 'info');
                    }
                } else {
                    this.showStatusMessage('Only one video in this directory', 'info');
                }
            }
        } catch (error) {
            console.error('Error playing next video in directory:', error);
        }
    }

    getVideoDirectory(videoPath) {
        // Extract directory from video path
        if (!videoPath) {
            console.log(`❌ No video path provided`);
            return '';
        }
        
        // Handle different path formats
        if (videoPath.includes('/')) {
            // Regular file path - get directory by removing filename
            const pathParts = videoPath.split('/');
            pathParts.pop(); // Remove filename
            const directory = pathParts.join('/');
            console.log(`📂 Extracted directory from "${videoPath}" -> "${directory}"`);
            return directory;
        }
        
        // If no slashes, it's likely a root file
        console.log(`📂 Video is in root directory: "${videoPath}"`);
        return '';
    }

    goBack() {
        const pathParts = this.currentPath.split('/').filter(part => part !== '');

        if (pathParts.length > 0) {
            pathParts.pop();
            const parentPath = pathParts.join('/');

            if (parentPath !== this.currentPath) {
                this.loadDirectory(parentPath);
            } else {
                this.loadDirectory('');
            }
        }
    }

    updateBackButton(parentPath) {
        const canGoBack = this.currentPath && this.currentPath !== '';

        if (this.backBtn) {
            this.backBtn.style.display = canGoBack ? 'inline-block' : 'none';
        }

        if (this.currentPathDisplay) {
            this.currentPathDisplay.textContent = this.currentPath || 'Root';
        }
    }

    // Grid view only - toggleView method removed

    switchTab(tabName) {

        // Update tab buttons
        this.tabBtns.forEach(btn => {
            const isActive = btn.id === tabName + '-tab';
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive);
        });

        // Show/hide tab content
        this.tabPanes.forEach(pane => {
            const isTargetPane = pane.id === tabName + '-pane';
            pane.classList.toggle('show', isTargetPane);
            pane.classList.toggle('active', isTargetPane);
        });

        // Load content for specific tabs
        if (tabName === 'playlists') {
            this.loadPlaylists();
        } else if (tabName === 'favorites') {
            this.loadFavorites();
        } else if (tabName === 'browser') {
            // Reset search when switching back to browser
            this.resetSearch();
        }
    }

    async performSearch() {
        if (this.isLoading('search')) {
            return;
        }

        const searchTerm = this.validateSearchQuery(this.searchInput.value);
        if (!searchTerm) return;


        return this.safeAsyncOperation(async () => {
            const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}&type=${this.filterType.value || 'all'}`, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });

            const data = await response.json();


            if (response.ok) {
                this.searchResults = data.results;
                this.renderSearchResults();
                this.searchCount.textContent = `${data.totalResults} results`;
                this.switchTab('search-results');
            } else {
                this.showStatusMessage('Search failed: ' + data.error, 'error');
            }
        }, 'search');
    }

    renderSearchResults() {
        this.searchList.innerHTML = '';

        if (this.searchResults.length === 0) {
            this.searchList.innerHTML = '<div class="col-12"><div class="text-center text-muted py-4"><i class="fas fa-search fa-2x mb-2"></i><p>No results found</p></div></div>';
            return;
        }

        // Filter out system/metadata files
        const filteredResults = this.searchResults.filter(item => {
            return !item.name.startsWith('._') &&
                !item.name.startsWith('.DS_Store') &&
                !item.name.startsWith('Thumbs.db');
        });


        if (filteredResults.length === 0) {
            this.searchList.innerHTML = '<div class="col-12"><div class="text-center text-muted py-4"><i class="fas fa-search fa-2x mb-2"></i><p>No results found (filtered out system files)</p></div></div>';
            return;
        }

        filteredResults.forEach(item => {
            const col = document.createElement('div');
            col.className = 'col-6 col-md-4 col-lg-3 col-xl-2';

            const div = document.createElement('div');
            div.className = 'file-grid-item h-100 position-relative';
            div.style.cursor = 'pointer';

            // Create thumbnail or icon
            let thumbnailHtml = '';
            if (item.isVideo && item.thumbnailUrl) {
                thumbnailHtml = `
                    <img src="${item.thumbnailUrl}" 
                         alt="Thumbnail for ${item.name}" 
                         class="img-fluid rounded" 
                         style="width: 100%; height: 120px; object-fit: cover;"
                         loading="lazy"
                         onerror="this.parentElement.innerHTML='<div class=\\"d-flex align-items-center justify-content-center h-100 text-muted\\"><i class=\\"fas fa-video fa-2x\\"></i></div>
                `;
            } else if (item.isVideo) {
                thumbnailHtml = `
                    <div class="d-flex align-items-center justify-content-center h-100 text-muted" title="Thumbnail not available">
                        <i class="fas fa-video fa-2x"></i>
                    </div>
                `;
            } else {
                const icon = this.getFileIcon(item);
                thumbnailHtml = `
                    <div class="d-flex align-items-center justify-content-center h-100 text-muted">
                        ${icon}
                    </div>
                `;
            }

            const size = this.formatFileSize(item.size);
            const date = this.formatDate(item.modified);

            div.innerHTML = `
                <div class="file-icon" style="height: 120px; background-color: #1F2937; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; margin-bottom: 0.5rem;">
                    ${thumbnailHtml}
                </div>
                <div class="file-name" style="font-size: 0.9rem; margin-bottom: 0.25rem;" title="${item.name}">${this.formatFileName(item.name, item.isVideo, item.isHLS)}</div>
                <div class="file-details text-muted small mb-2" style="font-size: 0.75rem;">
                    ${item.isDirectory ? 
                        `Directory${item.fileCount !== null && item.fileCount !== undefined ? ` (${item.fileCount} items)` : ''}${item.isHLSDirectory ? ' (HLS)' : ''}` :
                        (item.isVideo ? 'Video' : 'File') + (item.isVideo ? ` • ${item.duration ? `Duration: ${this.formatTime(item.duration)}` : 'Duration: Unknown'}` : ` • ${size}`)
                    }
                </div>
                <div class="search-path text-muted small" style="font-size: 0.7rem;" title="${item.relativePath || item.path}">
                    ${this.createClickablePath(item.relativePath || item.path, item.path) || 'No path available'}
                </div>
            `;

            // Add hover effect
            div.addEventListener('mouseenter', () => {
                div.style.backgroundColor = '#374151';
            });

            div.addEventListener('mouseleave', () => {
                div.style.backgroundColor = '';
            });

            div.addEventListener('click', () => {
                if (item.isVideo) {
                    this.playVideo(item);
                } else if (item.isDirectory) {
                    this.loadDirectory(item.path);
                }
            });

            col.appendChild(div);
            this.searchList.appendChild(col);
        });

        // Add event listeners for clickable folder paths
        this.setupClickablePathListeners();
    }

    setupClickablePathListeners() {
        // Add click event listeners to all clickable folder spans
        const clickableFolders = this.searchList.querySelectorAll('.clickable-folder');
        clickableFolders.forEach(folder => {
            folder.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering the item click
                const folderPath = folder.getAttribute('data-path');
                if (folderPath) {
                    this.loadDirectory(folderPath);
                    this.switchTab('browser'); // Switch to browser tab to show the folder contents
                }
            });
        });
    }

    async loadPlaylists() {
        try {
            const response = await fetch('/api/playlists', {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            const data = await response.json();

            if (response.ok) {
                this.playlists = data.playlists || [];
                this.renderPlaylists();
            } else {
                console.error('Failed to load playlists:', data.error);
                this.showStatusMessage('Failed to load playlists: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Failed to load playlists:', error);
            this.showStatusMessage('Failed to load playlists: ' + error.message, 'error');
        }
    }

    renderPlaylists() {
        this.playlistList.innerHTML = '';

        if (this.playlists.length === 0) {
            this.playlistList.innerHTML = '<div class="col-12"><div class="text-center text-muted py-4"><i class="fas fa-list fa-2x mb-2"></i><p>No playlists created yet</p></div></div>';
            return;
        }

        // Add instruction text
        const instructionCol = document.createElement('div');
        instructionCol.className = 'col-12 mb-3';
        instructionCol.innerHTML = `
            <small class="text-muted">
                <i class="fas fa-info-circle me-1"></i>Drag playlists to reorder them
            </small>
        `;
        this.playlistList.appendChild(instructionCol);

        // Create sortable container
        const sortableContainer = document.createElement('div');
        sortableContainer.className = 'sortable-playlists row g-3';
        sortableContainer.id = 'playlists-container';

        this.playlists.forEach((playlist, index) => {
            const col = document.createElement('div');
            col.className = 'col-6 col-md-4 col-lg-3 col-xl-2';

            const div = document.createElement('div');
            div.className = 'file-grid-item h-100 position-relative playlist-item';
            div.draggable = true;
            div.dataset.playlistIndex = index;

            // Use same styling as folders in browser
            const icon = '📁'; // Same as getFileIcon for directories
            
            div.innerHTML = `
                <div class="file-icon">${icon}</div>
                <div class="file-name">${playlist.name}</div>
                <div class="file-details">
                    Playlist${playlist.videos.length !== null ? ` (${playlist.videos.length} items)` : ''}
                </div>
                <div class="playlist-actions d-flex gap-1 mt-2">
                    <button class="btn btn-sm btn-outline-primary flex-fill" onclick="event.stopPropagation(); app.playPlaylist('${playlist.id}')">
                        <i class="fas fa-play me-1"></i>Play
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); app.deletePlaylist('${playlist.id}')" title="Delete playlist">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // Add drag and drop event handlers
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                div.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            div.addEventListener('dragend', (e) => {
                div.classList.remove('dragging');
            });

            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                div.classList.add('drag-over');
            });

            div.addEventListener('dragleave', (e) => {
                div.classList.remove('drag-over');
            });

            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.classList.remove('drag-over');
                
                const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const targetIndex = index;
                
                if (draggedIndex !== targetIndex) {
                    this.reorderPlaylists(draggedIndex, targetIndex);
                }
            });

            // Add hover effect
            div.addEventListener('mouseenter', () => {
                div.style.backgroundColor = '#374151';
            });

            div.addEventListener('mouseleave', () => {
                div.style.backgroundColor = '';
            });

            // Add click handler to show playlist videos
            div.addEventListener('click', () => {
                this.showPlaylistVideos(playlist);
            });

            col.appendChild(div);
            sortableContainer.appendChild(col);
        });

        this.playlistList.appendChild(sortableContainer);
    }

    async reorderPlaylists(fromIndex, toIndex) {
        try {
            // Reorder the playlists array
            const reorderedPlaylists = [...this.playlists];
            const [movedPlaylist] = reorderedPlaylists.splice(fromIndex, 1);
            reorderedPlaylists.splice(toIndex, 0, movedPlaylist);

            // Update the playlists on the server
            const response = await fetch('/api/playlists', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlists: reorderedPlaylists })
            });

            if (response.ok) {
                // Update the local playlists array
                this.playlists = reorderedPlaylists;

                // Re-render the playlists to show the new order
                this.renderPlaylists();

                this.showStatusMessage('Playlists reordered successfully!', 'success');
            } else {
                const data = await response.json();
                this.showStatusMessage('Failed to reorder playlists: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error reordering playlists:', error);
            this.showStatusMessage('Error reordering playlists', 'error');
        }
    }

    showPlaylistVideos(playlist) {
        // Store the current playlist for navigation
        this.currentPlaylist = playlist;
        this.currentPlaylistIndex = 0;

        // Update the playlist list to show videos
        this.renderPlaylistVideos(playlist);
    }

    renderPlaylistVideos(playlist) {
        this.playlistList.innerHTML = '';

        // Add back button
        const backCol = document.createElement('div');
        backCol.className = 'col-12 mb-3';
        backCol.innerHTML = `
            <button class="btn btn-outline-secondary" onclick="app.showPlaylistList()">
                <i class="fas fa-arrow-left me-2"></i>Back to Playlists
            </button>
        `;
        this.playlistList.appendChild(backCol);

        // Add playlist header
        const headerCol = document.createElement('div');
        headerCol.className = 'col-12 mb-3';
        headerCol.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <h4 class="mb-0">
                    <i class="fas fa-list me-2"></i>${playlist.name}
                </h4>
                <div>
                    <button class="btn btn-primary me-2" onclick="app.playPlaylist('${playlist.id}')">
                        <i class="fas fa-play me-1"></i>Play All
                    </button>
                    <button class="btn btn-outline-danger" onclick="app.deletePlaylist('${playlist.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <p class="text-muted mb-0">${playlist.videos.length} videos in this playlist</p>
            <small class="text-muted">
                <i class="fas fa-info-circle me-1"></i>Drag videos to reorder them
            </small>
        `;
        this.playlistList.appendChild(headerCol);

        if (playlist.videos.length === 0) {
            const emptyCol = document.createElement('div');
            emptyCol.className = 'col-12';
            emptyCol.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-video fa-2x mb-2"></i>
                    <p>No videos in this playlist yet</p>
                </div>
            `;
            this.playlistList.appendChild(emptyCol);
            return;
        }

        // Create sortable container
        const sortableContainer = document.createElement('div');
        sortableContainer.className = 'sortable-playlist-videos row g-3';
        sortableContainer.id = `playlist-${playlist.id}-videos`;

        // Render videos
        playlist.videos.forEach((video, index) => {
            const col = document.createElement('div');
            col.className = 'col-6 col-md-4 col-lg-3 col-xl-2';

            const div = document.createElement('div');
            div.className = 'file-grid-item h-100 position-relative playlist-video-item';
            div.draggable = true;
            div.dataset.videoIndex = index;

            // Create thumbnail HTML
            let thumbnailHtml = '';
            if (video.isVideo && video.thumbnailUrl) {
                thumbnailHtml = `
                    <img src="${video.thumbnailUrl}" 
                         alt="Thumbnail for ${video.name}" 
                         class="img-fluid rounded" 
                         style="width: 100%; height: 120px; object-fit: cover;"
                         loading="lazy"
                         onerror="this.parentElement.innerHTML='<div class=\\"d-flex align-items-center justify-content-center h-100 text-muted\\"><i class=\\"fas fa-video fa-2x\\"></i></div>
                `;
            } else if (video.isVideo) {
                thumbnailHtml = `
                    <div class="d-flex align-items-center justify-content-center h-100 text-muted" title="Thumbnail not available">
                        <i class="fas fa-video fa-2x"></i>
                    </div>
                `;
            } else {
                thumbnailHtml = `
                    <div class="d-flex align-items-center justify-content-center h-100 text-muted">
                        <i class="fas fa-file fa-2x"></i>
                    </div>
                `;
            }

            div.innerHTML = `
                <div class="file-icon" style="height: 120px; background-color: #1F2937; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; margin-bottom: 0.5rem;">
                    ${thumbnailHtml}
                </div>
                <div class="file-name" style="font-size: 0.9rem; margin-bottom: 0.25rem;" title="${video.name}">${this.formatFileName(video.name, video.isVideo, video.isHLS)}</div>
                <div class="file-details" style="font-size: 0.8rem; color: #9CA3AF;">
                    ${video.isVideo ? (video.duration ? `Duration: ${this.formatTime(video.duration)}` : 'Duration: Unknown') : this.formatFileSize(video.size)}
                </div>
                <button class="btn btn-sm btn-danger position-absolute" 
                        style="top: 8px; right: 8px; z-index: 10;"
                        onclick="event.stopPropagation(); app.removeVideoFromPlaylist('${playlist.id}', '${video.path}')"
                        title="Remove from playlist">
                    <i class="fas fa-times"></i>
                </button>
            `;


            // Add drag and drop event handlers
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                div.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            div.addEventListener('dragend', (e) => {
                div.classList.remove('dragging');
            });

            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                div.classList.add('drag-over');
            });

            div.addEventListener('dragleave', (e) => {
                div.classList.remove('drag-over');
            });

            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.classList.remove('drag-over');
                
                const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const targetIndex = index;
                
                if (draggedIndex !== targetIndex) {
                    this.reorderPlaylistVideos(playlist.id, draggedIndex, targetIndex);
                }
            });

            // Add click handler to play video
            div.addEventListener('click', () => {
                this.currentPlaylistIndex = index;
                this.playVideo(video);
            });

            col.appendChild(div);
            sortableContainer.appendChild(col);
        });

        this.playlistList.appendChild(sortableContainer);
    }

    showPlaylistList() {
        // Reset to show playlist list
        this.currentPlaylist = null;
        this.currentPlaylistIndex = 0;
        this.renderPlaylists();
    }

    async reorderPlaylistVideos(playlistId, fromIndex, toIndex) {
        try {
            const playlist = this.playlists.find(p => p.id === playlistId);
            if (!playlist) return;

            // Reorder the videos array
            const videos = [...playlist.videos];
            const [movedVideo] = videos.splice(fromIndex, 1);
            videos.splice(toIndex, 0, movedVideo);

            // Update the playlist
            const response = await fetch(`/api/playlists/${playlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videos: videos })
            });

            if (response.ok) {
                // Update local playlist
                playlist.videos = videos;
                
                // Update current playlist if we're viewing it
                if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
                    this.currentPlaylist.videos = videos;
                    this.renderPlaylistVideos(this.currentPlaylist);
                }

                this.showStatusMessage('Playlist reordered successfully!', 'success');
            } else {
                this.showStatusMessage('Failed to reorder playlist', 'error');
            }
        } catch (error) {
            console.error('Error reordering playlist:', error);
            this.showStatusMessage('Error reordering playlist', 'error');
        }
    }

    async removeVideoFromPlaylist(playlistId, videoPath) {
        if (!confirm('Are you sure you want to remove this video from the playlist?')) {
            return;
        }

        try {

            const response = await fetch(`/api/playlists/${playlistId}/remove-video`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ videoPath: videoPath })
            });

            if (response.ok) {
                const data = await response.json();

                // Update the current playlist if we're viewing it
                if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
                    this.currentPlaylist = data.playlist;
                    this.renderPlaylistVideos(this.currentPlaylist);
                }

                // Update the playlists array
                const playlistIndex = this.playlists.findIndex(p => p.id === playlistId);
                if (playlistIndex !== -1) {
                    this.playlists[playlistIndex] = data.playlist;
                }

                this.showStatusMessage('Video removed from playlist', 'success');
            } else {
                const errorData = await response.json();
                this.showStatusMessage('Failed to remove video: ' + errorData.error, 'error');
            }
        } catch (error) {
            console.error('Error removing video from playlist:', error);
            this.showStatusMessage('Error removing video: ' + error.message, 'error');
        }
    }

    async loadFavorites() {
        try {
            const response = await fetch('/api/favorites', {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            const data = await response.json();

            if (response.ok) {
                this.favorites = data.favorites || [];
                this.renderFavorites();
            }
        } catch (error) {
            console.error('Failed to load favorites:', error);
        }
    }

    renderFavorites() {
        this.favoritesList.innerHTML = '';

        if (this.favorites.length === 0) {
            this.favoritesList.innerHTML = '<div class="col-12"><div class="text-center text-muted py-4"><i class="fas fa-heart fa-2x mb-2"></i><p>No favorites added yet</p></div></div>';
            return;
        }

        // Add instruction text
        const instructionCol = document.createElement('div');
        instructionCol.className = 'col-12 mb-3';
        instructionCol.innerHTML = `
            <small class="text-muted">
                <i class="fas fa-info-circle me-1"></i>Drag favorites to reorder them
            </small>
        `;
        this.favoritesList.appendChild(instructionCol);

        // Create sortable container
        const sortableContainer = document.createElement('div');
        sortableContainer.className = 'sortable-favorites row g-3';
        sortableContainer.id = 'favorites-container';

        this.favorites.forEach((favorite, index) => {
            const col = document.createElement('div');
            col.className = 'col-6 col-md-4 col-lg-3 col-xl-2';

            const div = document.createElement('div');
            div.className = 'file-grid-item h-100 position-relative favorite-item';
            div.draggable = true;
            div.dataset.favoriteIndex = index;

            // Create thumbnail or icon
            let thumbnailHtml = '';
            if (favorite.isVideo && favorite.thumbnailUrl) {
                thumbnailHtml = `
                    <img src="${favorite.thumbnailUrl}" 
                         alt="Thumbnail for ${favorite.name}" 
                         class="img-fluid rounded" 
                         style="width: 100%; height: 120px; object-fit: cover;"
                         loading="lazy"
                         onerror="this.parentElement.innerHTML='<div class=\\"d-flex align-items-center justify-content-center h-100 text-muted\\"><i class=\\"fas fa-video fa-2x\\"></i></div>
                `;
            } else if (favorite.isVideo) {
                thumbnailHtml = `
                    <div class="d-flex align-items-center justify-content-center h-100 text-muted" title="Thumbnail not available">
                        <i class="fas fa-video fa-2x"></i>
                    </div>
                `;
            } else {
                thumbnailHtml = `
                    <div class="d-flex align-items-center justify-content-center h-100 text-muted">
                        <i class="fas fa-file fa-2x"></i>
                    </div>
                `;
            }

            div.innerHTML = `
                <div class="file-icon" style="height: 120px; background-color: #1F2937; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; margin-bottom: 0.5rem;">
                    ${thumbnailHtml}
                </div>
                <div class="file-name" style="font-size: 0.9rem; margin-bottom: 0.25rem;">${this.formatFileName(favorite.name, favorite.isVideo, favorite.isHLS)}</div>
                <div class="file-details text-muted small mb-2" style="font-size: 0.75rem;">
                    ${favorite.isVideo ? 'Video' : 'File'}${favorite.isVideo ? (favorite.duration ? ` • Duration: ${this.formatTime(favorite.duration)}` : ' • Duration: Unknown') : ''}
                </div>
            `;

            // Add drag and drop event handlers
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                div.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            div.addEventListener('dragend', (e) => {
                div.classList.remove('dragging');
            });

            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                div.classList.add('drag-over');
            });

            div.addEventListener('dragleave', (e) => {
                div.classList.remove('drag-over');
            });

            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.classList.remove('drag-over');
                
                const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const targetIndex = index;
                
                if (draggedIndex !== targetIndex) {
                    this.reorderFavorites(draggedIndex, targetIndex);
                }
            });

            // Add hover effect
            div.addEventListener('mouseenter', () => {
                div.style.backgroundColor = '#374151';
            });

            div.addEventListener('mouseleave', () => {
                div.style.backgroundColor = '';
            });

            // Add click handler to play video
            div.addEventListener('click', () => {
                this.playVideo({
                    path: favorite.path,
                    name: favorite.name,
                    isVideo: favorite.isVideo || false
                });
            });

            col.appendChild(div);
            sortableContainer.appendChild(col);
        });

        this.favoritesList.appendChild(sortableContainer);
    }

    async reorderFavorites(fromIndex, toIndex) {
        try {
            // Reorder the favorites array
            const reorderedFavorites = [...this.favorites];
            const [movedFavorite] = reorderedFavorites.splice(fromIndex, 1);
            reorderedFavorites.splice(toIndex, 0, movedFavorite);

            // Update the favorites on the server
            const response = await fetch('/api/favorites', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ favorites: reorderedFavorites })
            });

            if (response.ok) {
                // Update the local favorites array
                this.favorites = reorderedFavorites;

                // Re-render the favorites to show the new order
                this.renderFavorites();

                this.showStatusMessage('Favorites reordered successfully!', 'success');
            } else {
                const data = await response.json();
                this.showStatusMessage('Failed to reorder favorites: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error reordering favorites:', error);
            this.showStatusMessage('Error reordering favorites', 'error');
        }
    }

    async addToPlaylist() {
        if (!this.currentVideo && !this.currentDirectory) return;

        const currentItem = this.currentVideo || this.currentDirectory;
        const isDirectory = this.currentDirectory ? true : false;

        // Update modal title
        const modalTitle = document.getElementById('playlistModalLabel');
        if (modalTitle) {
            modalTitle.textContent = 'Add to Playlist';
        }

        this.showPlaylistModal();
        
        // Display the item being added
        const icon = isDirectory ? '📁' : (currentItem.isVideo ? '🎬' : '📄');
        const itemType = isDirectory ? 'Directory' : (currentItem.isVideo ? 'Video' : 'File');
        const fileCount = isDirectory && currentItem.fileCount ? ` (${currentItem.fileCount} items)` : '';
        
        this.playlistVideos.innerHTML = `
            <div class="alert alert-info">
                <span class="me-2">${icon}</span>
                <strong>${itemType}:</strong> ${this.formatFileName(currentItem.name, currentItem.isVideo, currentItem.isHLS)}${fileCount}
            </div>
        `;

        // Load existing playlists
        await this.loadExistingPlaylists();

        // Add tab switching event listeners
        this.setupPlaylistModalTabs();
    }

    setupPlaylistModalTabs() {
        const existingTab = document.getElementById('existing-playlist-tab');
        const newTab = document.getElementById('new-playlist-tab');

        if (existingTab && newTab) {
            // Remove existing listeners to avoid duplicates
            existingTab.replaceWith(existingTab.cloneNode(true));
            newTab.replaceWith(newTab.cloneNode(true));

            // Get fresh references
            const freshExistingTab = document.getElementById('existing-playlist-tab');
            const freshNewTab = document.getElementById('new-playlist-tab');

            freshExistingTab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToExistingPlaylistsTab();
            });

            freshNewTab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToNewPlaylistTab();
            });
        }
    }

    switchToExistingPlaylistsTab() {
        const existingTab = document.getElementById('existing-playlist-tab');
        const newTab = document.getElementById('new-playlist-tab');
        const existingPane = document.getElementById('existing-playlist-pane');
        const newPane = document.getElementById('new-playlist-pane');

        if (existingTab && newTab && existingPane && newPane) {
            existingTab.classList.add('active');
            newTab.classList.remove('active');
            existingPane.classList.add('show', 'active');
            newPane.classList.remove('show', 'active');

            // Don't reset selectedPlaylistId when switching to existing playlists tab
            // Only clear visual selection if no playlist is actually selected
            if (!this.selectedPlaylistId) {
                this.clearPlaylistSelection();
            }
        }
    }

    switchToNewPlaylistTab() {
        const existingTab = document.getElementById('existing-playlist-tab');
        const newTab = document.getElementById('new-playlist-tab');
        const existingPane = document.getElementById('existing-playlist-pane');
        const newPane = document.getElementById('new-playlist-pane');

        if (existingTab && newTab && existingPane && newPane) {
            newTab.classList.add('active');
            existingTab.classList.remove('active');
            newPane.classList.add('show', 'active');
            existingPane.classList.remove('show', 'active');

            // Reset selection when switching to new playlist tab
            this.selectedPlaylistId = null;
            this.clearPlaylistSelection();
        }
    }

    showPlaylistModal() {
        this.playlistModal.show();
    }

    showCreatePlaylistModal() {
        // Clear any previous state
        this.selectedPlaylistId = null;
        this.playlistName.value = '';
        this.playlistVideos.innerHTML = '';

        // Update modal title
        const modalTitle = document.getElementById('playlistModalLabel');
        if (modalTitle) {
            modalTitle.textContent = 'Create New Playlist';
        }

        // Switch to "Create New" tab
        this.switchToNewPlaylistTab();

        // Show the modal
        this.playlistModal.show();
    }

    async loadExistingPlaylists() {
        try {
            const response = await fetch('/api/playlists');
            const data = await response.json();

            const existingPlaylistsList = document.getElementById('existing-playlists-list');
            const noPlaylistsMessage = document.getElementById('no-playlists-message');

            // Ensure the existing playlists tab is active
            const existingTab = document.getElementById('existing-playlist-tab');
            const newTab = document.getElementById('new-playlist-tab');
            const existingPane = document.getElementById('existing-playlist-pane');
            const newPane = document.getElementById('new-playlist-pane');

            if (existingTab && newTab && existingPane && newPane) {
                existingTab.classList.add('active');
                newTab.classList.remove('active');
                existingPane.classList.add('show', 'active');
                newPane.classList.remove('show', 'active');
            }

            if (data.playlists && data.playlists.length > 0) {
                existingPlaylistsList.innerHTML = '';
                noPlaylistsMessage.style.display = 'none';

                data.playlists.forEach(playlist => {
                    const playlistItem = document.createElement('div');
                    playlistItem.className = 'list-group-item list-group-item-action bg-dark text-light border-secondary playlist-item-hover';
                    playlistItem.style.cursor = 'pointer';
                    playlistItem.innerHTML = `
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${playlist.name}</h6>
                            <small>${playlist.videos.length} videos</small>
                        </div>
                        <small class="text-muted">Created: ${new Date(playlist.created).toLocaleDateString()}</small>
                    `;

                    playlistItem.addEventListener('click', () => {
                        // Remove active class and custom selection styling from all items
                        existingPlaylistsList.querySelectorAll('.list-group-item').forEach(item => {
                            item.classList.remove('active', 'playlist-item-selected');
                        });
                        // Add active class and custom selection styling to clicked item
                        playlistItem.classList.add('active', 'playlist-item-selected');
                        this.selectedPlaylistId = playlist.id;
                    });

                    existingPlaylistsList.appendChild(playlistItem);
                });
            } else {
                existingPlaylistsList.innerHTML = '';
                noPlaylistsMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading playlists:', error);
            this.showStatusMessage('Error loading playlists', 'error');
        }
    }

    hidePlaylistModal() {
        this.playlistModal.hide();
        this.playlistName.value = '';
        this.playlistVideos.innerHTML = '';
        this.selectedPlaylistId = null;

        // Reset modal title
        const modalTitle = document.getElementById('playlistModalLabel');
        if (modalTitle) {
            modalTitle.textContent = 'Add to Playlist';
        }

        // Reset tab to existing playlists
        this.resetPlaylistModalTabs();

        // Clear selected playlist
        this.clearPlaylistSelection();
    }

    resetPlaylistModalTabs() {
        const existingTab = document.getElementById('existing-playlist-tab');
        const newTab = document.getElementById('new-playlist-tab');
        const existingPane = document.getElementById('existing-playlist-pane');
        const newPane = document.getElementById('new-playlist-pane');

        if (existingTab && newTab && existingPane && newPane) {
            existingTab.classList.add('active');
            newTab.classList.remove('active');
            existingPane.classList.add('show', 'active');
            newPane.classList.remove('show', 'active');
        }
    }

    clearPlaylistSelection() {
        const existingPlaylistsList = document.getElementById('existing-playlists-list');
        if (existingPlaylistsList) {
            existingPlaylistsList.querySelectorAll('.list-group-item').forEach(item => {
                item.classList.remove('active', 'playlist-item-selected');
            });
        }
    }

    async savePlaylist() {
        // Check if we're adding to an existing playlist
        if (this.selectedPlaylistId) {
            await this.addVideoToExistingPlaylist();
        } else {
            // Check if we're on the existing playlists tab but no playlist selected
            const existingPlaylistPane = document.getElementById('existing-playlist-pane');
            if (existingPlaylistPane && existingPlaylistPane.classList.contains('active')) {
                this.showStatusMessage('Please select a playlist to add the video to', 'warning');
                return;
            }

            // Check if we're on the new playlist tab
            const newPlaylistPane = document.getElementById('new-playlist-pane');
            if (newPlaylistPane && newPlaylistPane.classList.contains('active')) {
                // Create new playlist
                const name = this.validatePlaylistName(this.playlistName.value);
                if (!name) return;

                const videos = []; // Create empty playlist by default

                try {
                    const response = await fetch('/api/playlists', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, videos })
                    });

                    if (response.ok) {
                        this.hidePlaylistModal();
                        this.loadPlaylists();
                        this.showStatusMessage('Playlist created successfully!', 'success');
                    } else {
                        const data = await response.json();
                        this.showStatusMessage('Failed to create playlist: ' + data.error, 'error');
                    }
                } catch (error) {
                    this.showStatusMessage('Error creating playlist: ' + error.message, 'error');
                }
            } else {
                this.showStatusMessage('Please select a playlist or create a new one', 'warning');
            }
        }
    }

    async addVideoToExistingPlaylist() {
        if (!this.selectedPlaylistId || (!this.currentVideo && !this.currentDirectory)) {
            return;
        }

        const currentItem = this.currentVideo || this.currentDirectory;
        const isDirectory = this.currentDirectory ? true : false;

        try {
            const response = await fetch(`/api/playlists/${this.selectedPlaylistId}/add-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    video: currentItem,
                    isDirectory: isDirectory
                })
            });

            if (response.ok) {
                this.hidePlaylistModal();
                this.loadPlaylists();
                const itemType = isDirectory ? 'Directory' : 'Video';
                this.showStatusMessage(`${itemType} added to playlist successfully!`, 'success');
            } else {
                const data = await response.json();
                this.showStatusMessage(`Failed to add ${isDirectory ? 'directory' : 'video'} to playlist: ` + data.error, 'error');
            }
        } catch (error) {
            this.showStatusMessage(`Error adding ${isDirectory ? 'directory' : 'video'} to playlist: ` + error.message, 'error');
        }
    }

    async toggleFavorite() {
        if (!this.currentVideo && !this.currentDirectory) return;

        const currentItem = this.currentVideo || this.currentDirectory;
        const isDirectory = this.currentDirectory ? true : false;

        // Check if item is already favorited
        const isFavorited = this.favorites.some(fav => fav.path === currentItem.path);

        try {
            if (isFavorited) {
                // Remove from favorites
                const favorite = this.favorites.find(fav => fav.path === currentItem.path);
                if (favorite) {
                    const response = await fetch(`/api/favorites/${favorite.id}`, { 
                        method: 'DELETE' 
                    });

                    if (response.ok) {
                        this.updateFavoriteButton(false);
                        this.loadFavorites();
                        const itemType = isDirectory ? 'Directory' : 'Video';
                        this.showStatusMessage(`${itemType} removed from favorites!`, 'success');
                    } else {
                        this.showStatusMessage('Failed to remove from favorites', 'error');
                    }
                }
            } else {
                // Add to favorites
                const response = await fetch('/api/favorites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: currentItem.path,
                        name: currentItem.name,
                        isDirectory: isDirectory
                    })
                });

                if (response.ok) {
                    this.updateFavoriteButton(true);
                    this.loadFavorites();
                    const itemType = isDirectory ? 'Directory' : 'Video';
                    this.showStatusMessage(`${itemType} added to favorites!`, 'success');
                } else {
                    const data = await response.json();
                    if (data.error === 'Already in favorites') {
                        this.updateFavoriteButton(true);
                        this.showStatusMessage('Already in favorites', 'info');
                    } else {
                        this.showStatusMessage(`Failed to add ${isDirectory ? 'directory' : 'video'} to favorites: ` + data.error, 'error');
                    }
                }
            }
        } catch (error) {
            this.showStatusMessage('Error toggling favorite: ' + error.message, 'error');
        }
    }

    updateFavoriteButtonState() {
        if (!this.currentVideo) return;
        
        // Check if current video is favorited
        const isFavorited = this.favorites.some(fav => fav.path === this.currentVideo.path);
        this.updateFavoriteButton(isFavorited);
    }

    updateFavoriteButton(isFavorited) {
        if (isFavorited) {
            this.favoriteBtn.innerHTML = '<i class="fas fa-heart"></i>';
            this.favoriteBtn.classList.remove('btn-outline-primary');
            this.favoriteBtn.classList.add('btn-danger');
            this.favoriteBtn.title = 'Remove from favorites';
        } else {
            this.favoriteBtn.innerHTML = '<i class="fas fa-heart"></i>';
            this.favoriteBtn.classList.remove('btn-danger');
            this.favoriteBtn.classList.add('btn-outline-primary');
            this.favoriteBtn.title = 'Add to favorites';
        }
    }

    async removeFavorite(id) {
        try {
            const response = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });

            if (response.ok) {
                this.loadFavorites();
            } else {
                this.showStatusMessage('Failed to remove from favorites', 'error');
            }
        } catch (error) {
            this.showStatusMessage('Error removing from favorites: ' + error.message, 'error');
        }
    }

    async playPlaylist(playlistId) {
        try {
            const playlist = this.playlists.find(p => p.id === playlistId);
            if (!playlist || playlist.videos.length === 0) {
                this.showStatusMessage('Playlist is empty', 'warning');
                return;
            }

            const firstVideo = playlist.videos[0];
            this.playVideo(firstVideo);

            this.currentPlaylist = playlist;
            this.currentPlaylistIndex = 0;
        } catch (error) {
            this.showStatusMessage('Error playing playlist: ' + error.message, 'error');
        }
    }

    async deletePlaylist(playlistId) {
        if (!await this.showConfirmDialog('Are you sure you want to delete this playlist?')) {
            return;
        }

        try {
            const response = await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });

            if (response.ok) {
                this.loadPlaylists();
                this.showStatusMessage('Playlist deleted successfully', 'success');
            } else {
                const data = await response.json();
                this.showStatusMessage('Failed to delete playlist: ' + data.error, 'error');
            }
        } catch (error) {
            this.showStatusMessage('Error deleting playlist: ' + error.message, 'error');
        }
    }

    playNextInPlaylist() {
        if (this.currentPlaylist && this.currentPlaylistIndex < this.currentPlaylist.videos.length - 1) {
            this.currentPlaylistIndex++;
            const nextVideo = this.currentPlaylist.videos[this.currentPlaylistIndex];
            this.playVideo(nextVideo);
        }
    }

    // Progress tracking
    saveProgress(videoPath, currentTime) {
        this.playbackProgress[videoPath] = currentTime;
        localStorage.setItem('videoPlayerProgress', JSON.stringify(this.playbackProgress));
    }

    loadProgressFromStorage() {
        const saved = localStorage.getItem('videoPlayerProgress');
        if (saved) {
            this.playbackProgress = JSON.parse(saved);
        }
    }

    restoreProgress(videoPath) {
        if (this.playbackProgress[videoPath]) {
            this.video.currentTime = this.playbackProgress[videoPath];
        }
    }

    // Keyboard shortcuts
    handleKeyboard(e) {
        if (this.videoPlayerModal._isShown) {
            switch (e.key) {
                case 'Escape':
                    this.closeVideo();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.video.currentTime = Math.max(0, this.video.currentTime - 10);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 10);
                    break;
                case 'j':
                    e.preventDefault();
                    this.video.currentTime = Math.max(0, this.video.currentTime - 10);
                    break;
                case 'l':
                    e.preventDefault();
                    this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 10);
                    break;
            }
        }
    }

    showLoading() {
        this.fileList.innerHTML = `
            <div class="col-12">
                <div class="d-flex justify-content-center align-items-center" style="height: 200px;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading files...</span>
                    </div>
                </div>
            </div>
        `;
    }

    showError(message) {
        this.fileList.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle me-2"></i>${message}
                </div>
            </div>
        `;
    }


    // Video player initialization
    initializeVideoPlayer() {
        if (!this.video || !this.videoSource) {
            console.error('Video elements not found during initialization');
            return;
        }

        this.videoState.volume = this.video.volume || 1.0;
        this.videoState.isMuted = this.video.muted || false;
        this.videoState.playbackRate = this.video.playbackRate || 1.0;

        this.setupVideoEventListeners();
    }

    setupVideoEventListeners() {
        if (!this.video) return;

        this.video.addEventListener('loadstart', () => this.handleVideoLoadStart());
        this.video.addEventListener('loadedmetadata', () => this.handleVideoLoadedMetadata());
        this.video.addEventListener('canplay', () => this.handleVideoCanPlay());
        this.video.addEventListener('play', () => this.handleVideoPlay());
        this.video.addEventListener('pause', () => this.handleVideoPause());
        this.video.addEventListener('ended', () => this.handleVideoEnded());
        this.video.addEventListener('timeupdate', () => this.handleVideoTimeUpdate());
        this.video.addEventListener('volumechange', () => this.handleVideoVolumeChange());
        this.video.addEventListener('ratechange', () => this.handleVideoRateChange());
        this.video.addEventListener('error', (e) => this.handleVideoError(e));
        this.video.addEventListener('seeking', () => this.handleVideoSeeking());
        this.video.addEventListener('seeked', () => this.handleVideoSeeked());
        
        // Monitor video source changes to detect unexpected modifications
        this.monitorVideoSourceChanges();
        
        // Add immediate check for domain name issue
        this.checkForDomainNameIssue();
    }
    
    checkForDomainNameIssue() {
        if (!this.video) return;
        
        // Check immediately if video src is set to domain name
        if (this.video.src && this.video.src === window.location.href) {
            console.error('CRITICAL: Video src is set to current page URL on initialization!', {
                videoSrc: this.video.src,
                currentVideo: this.currentVideo?.name || 'Unknown',
                isHLS: this.currentVideo?.isHLS || false,
                timestamp: new Date().toISOString()
            });
            
            // Clear it immediately
            this.video.removeAttribute('src');
            this.video.load();
        }
        
        // Also check if it's just the domain name
        if (this.video.src && this.video.src === window.location.origin + '/') {
            console.error('CRITICAL: Video src is set to domain name on initialization!', {
                videoSrc: this.video.src,
                currentVideo: this.currentVideo?.name || 'Unknown',
                isHLS: this.currentVideo?.isHLS || false,
                timestamp: new Date().toISOString()
            });
            
            // Clear it immediately
            this.video.removeAttribute('src');
            this.video.load();
        }
    }
    
    monitorVideoSourceChanges() {
        if (!this.video) return;
        
        // Ensure video src is not set to the domain name initially
        if (this.video.src && this.video.src === window.location.href) {
            console.warn('Video src was set to current page URL, clearing it');
            this.video.removeAttribute('src');
        }
        
        // Store the last known source
        let lastSrc = this.video.src;
        
        // Check for source changes every 100ms
        const sourceMonitor = setInterval(() => {
            if (this.video && this.video.src !== lastSrc) {
                const newSrc = this.video.src;
                
                
                // Monitor video source changes silently
                
                // Check if the new source is unexpectedly the domain name (but not a blob URL)
                if (newSrc && !newSrc.startsWith('blob:') && newSrc.includes(window.location.hostname) && !newSrc.includes('/video') && !newSrc.includes('/hls')) {
                    console.warn('Video source set to domain name - clearing it');
                    
                    // Automatically clear the invalid src to prevent errors
                    this.video.removeAttribute('src');
                    this.video.load();
                    lastSrc = '';
                    return;
                }
                
                // Additional check for exact domain match
                if (newSrc && (newSrc === window.location.href || newSrc === window.location.origin + '/')) {
                    console.warn('Video source set to current page URL - clearing it');
                    
                    // Automatically clear the invalid src to prevent errors
                    this.video.removeAttribute('src');
                    this.video.load();
                    lastSrc = '';
                    return;
                }
                
                lastSrc = newSrc;
            }
        }, 100);
        
        // Store the interval ID so it can be cleared if needed
        this.videoSourceMonitor = sourceMonitor;
    }

    handleVideoLoadStart() {
        this.videoState.isSeeking = false;
    }

    handleVideoLoadedMetadata() {
        this.videoState.duration = this.video.duration;
        
        // Update currentVideo duration if it exists
        if (this.currentVideo) {
            this.currentVideo.duration = this.video.duration;
        }
        
        this.updateVideoInfo();
    }


    handleVideoCanPlay() {
        this.videoState.isInitialized = true;
    }

    handleVideoPlay() {
        this.videoState.isPlaying = true;
    }

    handleVideoPause() {
        this.videoState.isPlaying = false;
    }

    handleVideoEnded() {
        this.videoState.isPlaying = false;
        this.onVideoEnded();
    }

    handleVideoTimeUpdate() {
        if (!this.videoState.isSeeking) {
            this.videoState.currentTime = this.video.currentTime;
            this.updateProgress();
            
            // Update video info for HLS videos (debounced to improve performance)
            if (this.currentVideo && this.currentVideo.isHLS) {
                this.debounceVideoInfoUpdate();
            }
        }
    }

    debounceVideoInfoUpdate() {
        if (this.videoInfoUpdateTimeout) {
            clearTimeout(this.videoInfoUpdateTimeout);
        }
        this.videoInfoUpdateTimeout = setTimeout(() => {
            this.updateVideoInfo();
        }, 100); // Update every 100ms instead of every timeupdate event
    }

    handleVideoVolumeChange() {
        this.videoState.volume = this.video.volume;
        this.videoState.isMuted = this.video.muted;
    }

    handleVideoRateChange() {
        this.videoState.playbackRate = this.video.playbackRate;
    }

    handleVideoError(e) {
        const video = e.target;
        const error = video.error;
        
        // Prevent infinite loop by checking if we're already handling a video error
        if (this.isHandlingVideoError) {
            console.log('Already handling video error, preventing infinite loop');
            return;
        }
        
        // Ignore errors from blob URLs that are being cleaned up
        if (video.src && video.src.startsWith('blob:') && !this.hls) {
            console.log('Ignoring error from cleaned up blob URL');
            return;
        }
        
        // IMMEDIATE FIX: If video src is set to domain name, clear it immediately
        if (video.src && (video.src === window.location.href || video.src === window.location.origin + '/' || 
            (video.src.includes(window.location.hostname) && !video.src.includes('/video') && !video.src.includes('/hls') && !video.src.startsWith('blob:')))) {
            console.warn('IMMEDIATE FIX: Video src is domain name, clearing it to prevent error');
            video.removeAttribute('src');
            video.load();
            return; // Exit early to prevent error processing
        }
        
        // Debug: Log if video source is unexpectedly set to domain name (but not a blob URL)
        if (video.src && !video.src.startsWith('blob:') && video.src.includes(window.location.hostname) && !video.src.includes('/video') && !video.src.includes('/hls')) {
            console.warn('Video source set to domain name - this should not happen');
        }
        
        // Get detailed error information
        let errorMessage = 'Video playback error occurred';
        let errorCode = 'UNKNOWN';
        let errorDetails = '';
        
        if (error) {
            switch (error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    errorCode = 'ABORTED';
                    errorMessage = 'Video playback was aborted';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    errorCode = 'NETWORK';
                    errorMessage = 'Network error occurred while loading video';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    errorCode = 'DECODE';
                    errorMessage = 'Video decoding error occurred';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorCode = 'SRC_NOT_SUPPORTED';
                    errorMessage = 'Video format not supported';
                    break;
                default:
                    errorCode = 'UNKNOWN';
                    errorMessage = 'Unknown video error occurred';
            }
            
            errorDetails = `Code: ${errorCode}, Message: ${error.message || 'No additional details'}`;
        }
        
        // Log detailed error information with completely safe primitive values
        const videoSrc = video.src ? String(video.src) : 'null';
        const videoCurrentSrc = video.currentSrc ? String(video.currentSrc) : 'null';
        const currentVideoName = this.currentVideo?.name ? String(this.currentVideo.name) : 'Unknown';
        const hlsUrl = this.hls?.url ? String(this.hls.url) : 'null';
        const isHLS = Boolean(this.currentVideo?.isHLS);
        const hlsInstance = this.hls ? 'exists' : 'null';
        const videoNetworkState = Number(video.networkState);
        const videoReadyState = Number(video.readyState);
        const timestamp = new Date().toISOString();
        
        console.error('Video error details:', {
            errorCode,
            errorMessage,
            errorDetails,
            videoSrc,
            videoCurrentSrc,
            videoNetworkState,
            videoReadyState,
            currentVideo: currentVideoName,
            isHLS,
            hlsInstance,
            hlsUrl,
            timestamp
        });
        
        // Additional debugging for SRC_NOT_SUPPORTED errors
        if (errorCode === 'SRC_NOT_SUPPORTED') {
            // Create completely safe primitive values to prevent console reference issues
            const srcDebugVideoSrc = video.src ? String(video.src) : 'null';
            const srcDebugVideoCurrentSrc = video.currentSrc ? String(video.currentSrc) : 'null';
            const expectedHLSUrl = this.currentVideo ? `/hls/${encodeURIComponent(String(this.currentVideo.path))}` : 'unknown';
            const hlsAttached = this.hls ? 'yes' : 'no';
            const srcDebugHlsUrl = this.hls?.url ? String(this.hls.url) : 'null';
            const srcDebugTimestamp = new Date().toISOString();
            
            console.error('SRC_NOT_SUPPORTED debugging:', {
                videoSrc: srcDebugVideoSrc,
                videoCurrentSrc: srcDebugVideoCurrentSrc,
                expectedHLSUrl,
                hlsAttached,
                hlsUrl: srcDebugHlsUrl,
                timestamp: srcDebugTimestamp
            });
        }
        
        // Show user-friendly error message
        this.showStatusMessage(`Video Error: ${errorMessage}`, 'error');
        this.videoState.isPlaying = false;
        
        // Set flag to prevent infinite loop
        this.isHandlingVideoError = true;
        
        // Handle different error types with appropriate recovery strategies
        this.handleVideoErrorRecovery(errorCode, errorMessage);
        
        // Reset flag after a delay to allow for retry if needed
        setTimeout(() => {
            this.isHandlingVideoError = false;
        }, 2000);
    }

    handleVideoErrorRecovery(errorCode, errorMessage) {
        try {
            switch (errorCode) {
                case 'SRC_NOT_SUPPORTED':
                    // For HLS videos, try fallback to original video
                    if (this.currentVideo && this.currentVideo.isHLS) {
                        console.log('Attempting fallback to original video for HLS error');
                        this.fallbackToOriginalVideo(this.currentVideo);
                    } else {
                        this.showStatusMessage('Video format not supported by your browser. Try using a different browser or update your current one.', 'error');
                    }
                    break;
                    
                case 'NETWORK':
                    // For network errors, attempt automatic retry
                    this.showStatusMessage('Network error occurred. Attempting to retry...', 'warning');
                    this.retryVideoLoad().then(success => {
                        if (!success) {
                            this.showStatusMessage('Network error: Unable to retry. Check your connection and try again.', 'error');
                        }
                    });
                    break;
                    
                case 'DECODE':
                    // For decode errors, suggest different browser or codec
                    this.showStatusMessage('Video decoding error. This video may be corrupted or use an unsupported codec.', 'error');
                    break;
                    
                case 'ABORTED':
                    // For aborted errors, usually user-initiated, just log
                    console.log('Video playback was aborted');
                    break;
                    
                default:
                    // For unknown errors, try basic recovery
                    this.showStatusMessage('Unknown video error occurred. Please try refreshing the page.', 'error');
                    break;
            }
        } catch (error) {
            console.error('Error in error recovery:', error);
            this.showStatusMessage('Error recovery failed. Please try refreshing the page.', 'error');
        }
    }

    handleVideoSeeking() {
        this.videoState.isSeeking = true;
    }

    handleVideoSeeked() {
        this.videoState.isSeeking = false;
        this.videoState.currentTime = this.video.currentTime;
    }

    // Method to attempt video reload with exponential backoff
    async retryVideoLoad(maxRetries = 3, baseDelay = 1000) {
        if (this.retryCount >= maxRetries) {
            this.showStatusMessage('Maximum retry attempts reached. Please try refreshing the page.', 'error');
            return false;
        }

        this.retryCount = (this.retryCount || 0) + 1;
        const delay = baseDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
        
        console.log(`Retrying video load (attempt ${this.retryCount}/${maxRetries}) in ${delay}ms`);
        this.showStatusMessage(`Retrying video load (attempt ${this.retryCount}/${maxRetries})...`, 'info');

        return new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    if (this.currentVideo) {
                        if (this.currentVideo.isHLS) {
                            await this.playHLSVideo(`/hls/${encodeURIComponent(this.currentVideo.path)}`, this.currentVideo);
                        } else {
                            await this.playVideo(`/video/${encodeURIComponent(this.currentVideo.path)}`, this.currentVideo);
                        }
                        this.retryCount = 0; // Reset on success
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch (error) {
                    console.error('Retry failed:', error);
                    resolve(false);
                }
            }, delay);
        });
    }

    // Method to clean up video resources properly
    cleanupVideoResources() {
        try {
            // Clean up HLS instance
            if (this.hls) {
                this.hls.off();
                this.hls.detachMedia();
                this.hls.destroy();
                this.hls = null;
            }

            // Clear video element
            if (this.video) {
                this.video.pause();
                this.video.removeAttribute('src');
                this.video.load();
            }

            // Clear source monitoring
            if (this.videoSourceMonitor) {
                clearInterval(this.videoSourceMonitor);
                this.videoSourceMonitor = null;
            }

            // Reset state
            this.currentVideo = null;
            this.retryCount = 0;
            this.isHandlingVideoError = false;

            console.log('Video resources cleaned up successfully');
        } catch (error) {
            console.error('Error cleaning up video resources:', error);
        }
    }

    // Comprehensive HLS cleanup method to prevent segment mixing
    async cleanupHLSInstance() {
        if (!this.hls) return;

        try {
            console.log('Starting comprehensive HLS cleanup...');
            
            // Stop all HLS operations
            this.hls.stopLoad();
            
            // Remove all event listeners
            this.hls.off();
            
            // Detach from video element
            this.hls.detachMedia();
            
            // Destroy the instance
            this.hls.destroy();
            
            // Clear the reference
            this.hls = null;
            
            // Additional cleanup for video element
            if (this.video) {
                // Pause and reset video
                this.video.pause();
                this.video.currentTime = 0;
                
                // Clear any buffered data by removing and re-adding src
                this.video.removeAttribute('src');
                this.video.load();
                
                // Force clear buffer by setting currentTime multiple times
                this.video.currentTime = 0;
                this.video.currentTime = 0.1;
                this.video.currentTime = 0;
            }
            
            console.log('HLS cleanup completed');
            
            // Wait a bit more to ensure cleanup is complete
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (error) {
            console.error('Error during HLS cleanup:', error);
            // Force clear the reference even if cleanup failed
            this.hls = null;
        }
    }

    // Accessibility and UX methods
    setupAriaLiveRegion() {
        const liveRegion = document.createElement('div');
        liveRegion.id = 'aria-live-region';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only';
        document.body.appendChild(liveRegion);
        this.liveRegion = liveRegion;
    }

    announceToScreenReader(message) {
        if (this.liveRegion) {
            this.liveRegion.textContent = message;
        }
    }

    handleFocusIn(e) {
        e.target.classList.add('focus-visible');
    }

    handleFocusOut(e) {
        e.target.classList.remove('focus-visible');
    }

    handleKeyboardUp(e) {
        if (e.key === 'Tab') {
            document.body.classList.add('keyboard-navigation');
        }
    }

    // Status messages
    showStatusMessage(message, type = 'info', duration = 2000) {
        const statusMessage = document.createElement('div');
        statusMessage.className = `status-message status-message--${type}`;
        statusMessage.textContent = message;
        statusMessage.setAttribute('role', 'status');
        statusMessage.setAttribute('aria-live', 'polite');

        document.body.appendChild(statusMessage);

        requestAnimationFrame(() => {
            statusMessage.classList.add('status-message--show');
        });

        setTimeout(() => {
            statusMessage.classList.remove('status-message--show');
            setTimeout(() => {
                if (statusMessage.parentNode) {
                    statusMessage.parentNode.removeChild(statusMessage);
                }
            }, 300);
        }, duration);
    }

    // Confirmation dialog
    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content bg-dark">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title text-light">Confirm Action</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="text-light">${message}</p>
                        </div>
                        <div class="modal-footer border-secondary">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirm-yes">Yes</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            const bootstrapModal = new bootstrap.Modal(modal);
            bootstrapModal.show();

            modal.querySelector('#confirm-yes').addEventListener('click', () => {
                bootstrapModal.hide();
                document.body.removeChild(modal);
                resolve(true);
            });

            modal.addEventListener('hidden.bs.modal', () => {
                document.body.removeChild(modal);
                resolve(false);
            });
        });
    }

    // Input validation
    validateInput(input, type = 'string', options = {}) {
        if (input === null || input === undefined) {
            return { isValid: false, error: 'Input is required' };
        }

        const trimmedInput = typeof input === 'string' ? input.trim() : input;

        switch (type) {
            case 'string':
                if (typeof trimmedInput !== 'string') {
                    return { isValid: false, error: 'Input must be a string' };
                }
                if (options.minLength && trimmedInput.length < options.minLength) {
                    return { isValid: false, error: `Input must be at least ${options.minLength} characters` };
                }
                if (options.maxLength && trimmedInput.length > options.maxLength) {
                    return { isValid: false, error: `Input must be no more than ${options.maxLength} characters` };
                }
                break;
        }

        return { isValid: true, value: trimmedInput };
    }

    validateSearchQuery(query) {
        const validation = this.validateInput(query, 'string', {
            minLength: 1,
            maxLength: 100
        });

        if (!validation.isValid) {
            this.showStatusMessage(validation.error, 'warning');
            return null;
        }

        return validation.value;
    }

    validatePlaylistName(name) {
        const validation = this.validateInput(name, 'string', {
            minLength: 1,
            maxLength: 50
        });

        if (!validation.isValid) {
            this.showStatusMessage(validation.error, 'warning');
            return null;
        }

        return validation.value;
    }

    // Async operation management
    async safeAsyncOperation(operation, context = '') {
        const operationId = `${context}_${Date.now()}_${Math.random()}`;

        try {
            this.activeRequests.add(operationId);
            this.setLoadingState(context, true);

            const result = await operation();
            return result;
        } catch (error) {
            console.error(`Error in ${context}:`, error);
            this.handleError(error, context);
            throw error;
        } finally {
            this.activeRequests.delete(operationId);
            this.setLoadingState(context, false);
        }
    }

    setLoadingState(context, isLoading) {
        if (isLoading) {
            this.loadingStates.set(context, true);
        } else {
            this.loadingStates.delete(context);
        }
    }

    isLoading(context) {
        return this.loadingStates.has(context);
    }

    handleError(error, context = '') {
        console.error(`Error in ${context}:`, error);
        
        // Provide more specific error messages based on context
        let userMessage = 'Something went wrong';
        if (context.includes('video')) {
            userMessage = 'Video playback error. Please try refreshing the page.';
        } else if (context.includes('search')) {
            userMessage = 'Search failed. Please try again.';
        } else if (context.includes('favorite')) {
            userMessage = 'Failed to update favorites. Please try again.';
        } else if (context.includes('playlist')) {
            userMessage = 'Playlist operation failed. Please try again.';
        } else if (error.message) {
            userMessage = error.message;
        }
        
        this.showStatusMessage(`Error: ${userMessage}`, 'error');
        this.announceToScreenReader(`Error: ${userMessage}`);
    }

    debounceSearch(query) {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = setTimeout(() => {
            if (query.length >= 2) {
                this.performSearch();
            } else if (query.length === 0) {
                this.clearSearch();
            }
        }, 300);
    }

    clearSearch() {
        this.searchResults = [];
        this.switchTab('browser');
        this.loadDirectory();
    }

    resetSearch() {
        // Clear search input
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        
        // Clear search results
        this.searchResults = [];
        
        // Reset search count
        if (this.searchCount) {
            this.searchCount.textContent = '0 results';
        }
        
        // Clear search list
        if (this.searchList) {
            this.searchList.innerHTML = '<div class="col-12"><div class="text-center text-muted py-4"><i class="fas fa-search fa-2x mb-2"></i><p>No search performed yet</p></div></div>';
        }
        
        // Load current directory
        this.loadDirectory();
    }

    updateFilterDropdownText(text) {
        const filterDropdown = document.querySelector('[data-bs-toggle="dropdown"]');
        if (filterDropdown) {
            const icon = filterDropdown.querySelector('i');
            if (icon) {
                filterDropdown.innerHTML = `<i class="fas fa-filter me-1"></i>${text}`;
            }
        }
    }

    updateSortDropdownText(text) {
        const sortDropdowns = document.querySelectorAll('[data-bs-toggle="dropdown"]');
        if (sortDropdowns.length > 1) {
            const sortDropdown = sortDropdowns[1];
            const icon = sortDropdown.querySelector('i');
            if (icon) {
                sortDropdown.innerHTML = `<i class="fas fa-sort me-1"></i>${text}`;
            }
        }
    }


    sortSearchResults() {
        if (!this.searchResults || this.searchResults.length === 0) return;

        const sortedResults = [...this.searchResults].sort((a, b) => {
            let aValue, bValue;

            switch (this.sortBy.value) {
                case 'name':
                    aValue = a.name.toLowerCase();
                    bValue = b.name.toLowerCase();
                    break;
                case 'duration':
                    // For duration sorting, directories should be sorted by name since they don't have duration
                    if (a.isDirectory && b.isDirectory) {
                        aValue = a.name.toLowerCase();
                        bValue = b.name.toLowerCase();
                    } else if (a.isDirectory && !b.isDirectory) {
                        return -1; // Directories first
                    } else if (!a.isDirectory && b.isDirectory) {
                        return 1; // Directories first
                    } else {
                        aValue = a.duration || 0;
                        bValue = b.duration || 0;
                    }
                    break;
                case 'modified':
                    aValue = new Date(a.modified);
                    bValue = new Date(b.modified);
                    break;
                default:
                    aValue = a.name.toLowerCase();
                    bValue = b.name.toLowerCase();
            }

            if (aValue < bValue) return this.sortOrder.value === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.sortOrder.value === 'asc' ? 1 : -1;
            return 0;
        });

        this.searchResults = sortedResults;
        this.renderSearchResults();
    }

    // Utility methods - validateInput is defined above in the Input validation section


    handleKeyboard(e) {
        // Basic keyboard navigation
        if (e.key === 'Escape') {
            if (this.videoPlayerModal && this.videoPlayerModal._isShown) {
                this.closeVideo();
            }
        }
    }



    handleFullscreenChange() {
        this.isFullscreen = !!(document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement);
    }

    saveAllProgress() {
        // Save current progress to localStorage
        try {
            localStorage.setItem('videoPlayerProgress', JSON.stringify(this.playbackProgress));
        } catch (error) {
            console.warn('Failed to save progress:', error);
        }
    }

    loadProgress() {
        // Load progress from localStorage
        try {
            const saved = localStorage.getItem('videoPlayerProgress');
            if (saved) {
                this.playbackProgress = JSON.parse(saved);
            }
        } catch (error) {
            console.warn('Failed to load progress:', error);
        }
    }

    cleanup() {
        this.cancelActiveRequests();

        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }

        if (this.videoInfoUpdateTimeout) {
            clearTimeout(this.videoInfoUpdateTimeout);
            this.videoInfoUpdateTimeout = null;
        }

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        // Clean up HLS instance properly
        if (this.hls) {
            try {
                this.hls.off(); // Remove all event listeners
                this.hls.detachMedia(); // Detach from video element
                this.hls.destroy();
            } catch (error) {
                // HLS cleanup error (non-fatal)
            }
            this.hls = null;
        }
        
        // Reset error handling state
        this.isHandlingVideoError = false;

        // Clean up video element and remove event listeners
        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
            
            // Remove all event listeners
            this.video.removeEventListener('loadstart', this.handleVideoLoadStart);
            this.video.removeEventListener('loadedmetadata', this.handleVideoLoadedMetadata);
            this.video.removeEventListener('canplay', this.handleVideoCanPlay);
            this.video.removeEventListener('play', this.handleVideoPlay);
            this.video.removeEventListener('pause', this.handleVideoPause);
            this.video.removeEventListener('ended', this.handleVideoEnded);
            this.video.removeEventListener('timeupdate', this.handleVideoTimeUpdate);
            this.video.removeEventListener('volumechange', this.handleVideoVolumeChange);
            this.video.removeEventListener('ratechange', this.handleVideoRateChange);
            this.video.removeEventListener('error', this.handleVideoError);
            this.video.removeEventListener('seeking', this.handleVideoSeeking);
            this.video.removeEventListener('seeked', this.handleVideoSeeked);
        }

        // Clean up global event listeners
        document.removeEventListener('keydown', this.handleKeyboard);
        document.removeEventListener('keyup', this.handleKeyboardUp);
        document.removeEventListener('focusin', this.handleFocusIn);
        document.removeEventListener('focusout', this.handleFocusOut);
        document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this.handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', this.handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', this.handleFullscreenChange);

        this.loadingStates.clear();
        this.saveAllProgress();
    }

    cancelActiveRequests() {
        this.activeRequests.clear();
        this.loadingStates.clear();
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(() => {
                window.location.href = '/login';
            }).catch(error => {
                console.error('Logout error:', error);
                window.location.href = '/login';
            });
        }
    }
}

// Initialize the application immediately
window.app = new ModernVideoPlayerBrowser();

// Also initialize when DOM is loaded (in case script loads before DOM)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.app) {
            window.app = new ModernVideoPlayerBrowser();
        }
    });
}
