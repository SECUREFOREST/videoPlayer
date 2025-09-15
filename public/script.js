class AdvancedVideoPlayerBrowser {
    constructor() {
        this.currentPath = '';
        this.currentVideo = null;
        this.playlists = [];
        this.favorites = [];
        this.searchResults = [];
        this.isGridView = false;
        this.isFullscreen = false;
        this.playbackProgress = {};
        this.currentPlaylist = null;
        this.currentPlaylistIndex = 0;
        this.recentlyPlayed = [];
        this.isDragging = false;
        this.focusedElement = null;
        this.keyboardNavigation = true;
        this.loadingStates = new Map();
        
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
        this.videoPlayer = document.getElementById('video-player');
        this.fileList = document.getElementById('file-list');
        // Path display removed - element no longer exists
        this.currentPathDisplay = null;
        this.video = document.getElementById('video');
        this.videoSource = document.getElementById('video-source');
        this.videoTitle = document.getElementById('video-title');
        this.videoInfo = document.getElementById('video-info');
        
        // Navigation
        this.backBtn = document.getElementById('back-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.gridViewBtn = document.getElementById('grid-view-btn');
        this.listViewBtn = document.getElementById('list-view-btn');
        
        // Search and filters
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.filterType = document.getElementById('filter-type');
        this.sortBy = document.getElementById('sort-by');
        this.sortOrder = document.getElementById('sort-order');
        
        // Tabs
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');
        
        // Video controls
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.progressBar = document.getElementById('progress-bar');
        this.progressFill = document.getElementById('progress-fill');
        this.currentTime = document.getElementById('current-time');
        this.duration = document.getElementById('duration');
        this.muteBtn = document.getElementById('mute-btn');
        this.volumeSlider = document.getElementById('volume-slider');
        this.speedSelect = document.getElementById('speed-select');
        this.fullscreenBtn = document.getElementById('fullscreen-btn');
        this.closeVideoBtn = document.getElementById('close-video');
        
        // Playlist and favorites
        this.playlistAddBtn = document.getElementById('playlist-add-btn');
        this.favoriteBtn = document.getElementById('favorite-btn');
        this.createPlaylistBtn = document.getElementById('create-playlist-btn');
        this.playlistList = document.getElementById('playlist-list');
        this.favoritesList = document.getElementById('favorites-list');
        this.recentList = document.getElementById('recent-list');
        this.clearRecentBtn = document.getElementById('clear-recent-btn');
        this.searchList = document.getElementById('search-list');
        this.searchCount = document.getElementById('search-count');
        
        // Modals
        this.playlistModal = document.getElementById('playlist-modal');
        this.playlistName = document.getElementById('playlist-name');
        this.playlistVideos = document.getElementById('playlist-videos');
        this.savePlaylistBtn = document.getElementById('save-playlist-btn');
        this.cancelPlaylistBtn = document.getElementById('cancel-playlist-btn');
        
        // Drag and drop
        this.dragOverlay = document.getElementById('drag-overlay');
        
    }
    
    init() {
        this.bindEvents();
        this.initializeVideoPlayer();
        this.loadDirectory();
        this.loadPlaylists();
        this.loadFavorites();
        this.loadRecentlyPlayed();
        this.loadProgress();
    }
    
    bindEvents() {
        // Navigation
        this.backBtn.addEventListener('click', () => this.goBack());
        this.refreshBtn.addEventListener('click', () => this.loadDirectory());
        this.gridViewBtn.addEventListener('click', () => this.toggleView(true));
        this.listViewBtn.addEventListener('click', () => this.toggleView(false));
        
        // Search and filters with debouncing
        this.searchInput.addEventListener('input', (e) => {
            this.debounceSearch(e.target.value);
        });
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });
        this.searchBtn.addEventListener('click', () => this.performSearch());
        this.filterType.addEventListener('change', () => this.loadDirectory());
        this.sortBy.addEventListener('change', () => this.loadDirectory());
        this.sortOrder.addEventListener('change', () => this.loadDirectory());
        
        // Tabs
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
        
        // Video controls
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        
        // Add video click listener as backup (in case video element is available)
        if (this.video) {
            this.video.addEventListener('click', () => {
                console.log('Video clicked!');
                this.togglePlayPause();
            });
        }
        this.progressBar.addEventListener('click', (e) => this.seekTo(e));
        this.progressBar.addEventListener('mousedown', (e) => this.handleProgressMouseDown(e));
        this.progressBar.addEventListener('mousemove', (e) => this.handleProgressMouseMove(e));
        this.progressBar.addEventListener('mouseup', (e) => this.handleProgressMouseUp(e));
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.speedSelect.addEventListener('change', (e) => this.setPlaybackSpeed(e.target.value));
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.closeVideoBtn.addEventListener('click', () => this.closeVideo());
        
        // Playlist and favorites
        this.playlistAddBtn.addEventListener('click', () => this.addToPlaylist());
        this.favoriteBtn.addEventListener('click', () => this.toggleFavorite());
        this.createPlaylistBtn.addEventListener('click', () => this.showPlaylistModal());
        this.savePlaylistBtn.addEventListener('click', () => this.savePlaylist());
        this.cancelPlaylistBtn.addEventListener('click', () => this.hidePlaylistModal());
        this.clearRecentBtn.addEventListener('click', () => this.clearRecentlyPlayed());
        
        // Modal
        document.querySelector('.modal-close').addEventListener('click', () => this.hidePlaylistModal());
        this.playlistModal.addEventListener('click', (e) => {
            if (e.target === this.playlistModal) this.hidePlaylistModal();
        });
        
        // Drag and drop
        document.addEventListener('dragover', (e) => this.handleDragOver(e));
        document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        document.addEventListener('drop', (e) => this.handleDrop(e));
        
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
        
        // Global mouse events for progress bar dragging
        document.addEventListener('mousemove', (e) => this.handleProgressMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleProgressMouseUp(e));
        
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => this.cleanup());
    }
    
    async loadDirectory(path = '') {
        if (this.isLoading('loadDirectory')) {
            console.log('Directory load already in progress, skipping...');
            return;
        }
        
        return this.safeAsyncOperation(async () => {
            this.showLoading();
            const params = new URLSearchParams({
                path: path,
                search: this.searchInput.value,
                sortBy: this.sortBy.value,
                sortOrder: this.sortOrder.value,
                filterType: this.filterType.value
            });
            
            const response = await fetch(`/api/browse?${params}`);
            const data = await response.json();
            
            if (response.ok) {
                this.currentPath = data.currentPath;
                // Path display removed
                this.renderFileList(data.items, data.parentPath);
                this.updateBackButton(data.parentPath);
            } else {
                this.showError(data.error || 'Failed to load directory');
            }
        }, 'loadDirectory');
    }
    
    renderFileList(items, parentPath) {
        this.fileList.innerHTML = '';
        
        // Only show parent directory option if we're not at the root level
        if (parentPath && parentPath !== this.currentPath && parentPath !== '') {
            const parentItem = this.createFileItem({
                name: '..',
                path: parentPath,
                isDirectory: true,
                isFile: false,
                size: 0,
                modified: new Date(),
                extension: '',
                isVideo: false
            });
            this.fileList.appendChild(parentItem);
        }
        
        if (this.isGridView) {
            this.renderGridView(items);
        } else {
            this.renderListView(items);
        }
    }
    
    renderListView(items) {
        items.forEach(item => {
            const fileItem = this.createFileItem(item);
            this.fileList.appendChild(fileItem);
        });
    }
    
    renderGridView(items) {
        const grid = document.createElement('div');
        grid.className = 'file-grid';
        
        items.forEach(item => {
            const gridItem = this.createGridItem(item);
            grid.appendChild(gridItem);
        });
        
        this.fileList.appendChild(grid);
    }
    
    createFileItem(item) {
        const div = document.createElement('div');
        div.className = 'file-item';
        
        const icon = this.getFileIcon(item);
        const size = this.formatFileSize(item.size);
        const date = this.formatDate(item.modified);
        
        div.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-info">
                <div class="file-name">${item.name}</div>
                <div class="file-details">
                    ${item.isDirectory ? '<span class="file-size">Directory</span>' : `<span class="file-size">${size}</span>`}
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
        
        return div;
    }
    
    createGridItem(item) {
        const div = document.createElement('div');
        div.className = 'file-grid-item';
        
        const icon = this.getFileIcon(item);
        const size = this.formatFileSize(item.size);
        
        div.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name">${item.name}</div>
            <div class="file-details">
                ${item.isDirectory ? 'Directory' : size}
            </div>
        `;
        
        if (item.isVideo) {
            this.loadThumbnail(item, div);
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
        
        return div;
    }
    
    async loadThumbnail(item, container) {
        try {
            const response = await fetch(`/api/thumbnail?path=${encodeURIComponent(item.path)}`);
            const data = await response.json();
            
            if (data.thumbnailUrl) {
                const img = document.createElement('img');
                img.src = data.thumbnailUrl;
                img.className = 'thumbnail';
                img.alt = item.name;
                container.insertBefore(img, container.firstChild);
            }
        } catch (error) {
            console.log('Thumbnail generation failed:', error);
        }
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
    
    formatDate(date) {
        return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
    }
    
    async playVideo(item) {
        try {
            const response = await fetch(`/api/video-info?path=${encodeURIComponent(item.path)}`);
            const videoData = await response.json();
            
            if (response.ok) {
                this.currentVideo = item;
                this.videoTitle.textContent = videoData.name;
                
                // Debug: Check if videoSource exists
                if (!this.videoSource) {
                    console.error('videoSource element not found!');
                    this.showStatusMessage('Video player not properly initialized', 'error');
                    return;
                }
                
                this.videoSource.src = `/videos/${encodeURIComponent(item.path)}`;
                this.videoSource.type = videoData.mimeType;
                this.video.load();
                this.videoPlayer.style.display = 'block';
                this.updateVideoInfo(videoData);
                
                // Ensure click listener is attached when video is loaded
                this.attachVideoClickListener();
                
                // Restore progress if available
                this.restoreProgress(item.path);
                
                // Add to recently played
                this.addToRecentlyPlayed(item);
                
                // Autoplay the video
                this.video.play().then(() => {
                    this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                }).catch(error => {
                    console.log('Autoplay failed:', error);
                    // Autoplay might be blocked by browser, this is normal
                });
                
                // Switch to video player tab
                this.switchTab('browser');
            } else {
                this.showStatusMessage('Error loading video: ' + videoData.error, 'error');
            }
        } catch (error) {
            this.showStatusMessage('Error loading video: ' + error.message, 'error');
        }
    }
    
    updateVideoInfo(videoData) {
        if (videoData) {
            const size = this.formatFileSize(videoData.size);
            const date = this.formatDate(videoData.modified);
            this.videoInfo.innerHTML = `
                <strong>File:</strong> ${videoData.name}<br>
                <strong>Size:</strong> ${size}<br>
                <strong>Modified:</strong> ${date}<br>
                <strong>Format:</strong> ${videoData.extension.toUpperCase()}
            `;
        } else if (this.video.duration) {
            const duration = this.formatTime(this.video.duration);
            this.videoInfo.innerHTML = `
                <strong>Duration:</strong> ${duration}<br>
                <strong>Resolution:</strong> ${this.video.videoWidth}x${this.video.videoHeight}
            `;
        }
    }
    
    formatTime(seconds) {
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
        if (this.video.duration) {
            const progress = (this.video.currentTime / this.video.duration) * 100;
            this.progressFill.style.width = progress + '%';
            this.currentTime.textContent = this.formatTime(this.video.currentTime);
            this.duration.textContent = this.formatTime(this.video.duration);
            
            // Save progress
            this.saveProgress(this.currentVideo.path, this.video.currentTime);
        }
    }
    
    seekTo(event) {
        if (!this.progressBar || !this.video.duration) {
            console.log('Progress bar or video duration not available');
            return;
        }
        
        const rect = this.progressBar.getBoundingClientRect();
        const pos = (event.clientX - rect.left) / rect.width;
        const newTime = pos * this.video.duration;
        
        console.log('Seeking to:', newTime, 'seconds');
        this.video.currentTime = newTime;
    }
    
    handleProgressMouseDown(event) {
        this.isDragging = true;
        this.seekTo(event);
    }
    
    handleProgressMouseMove(event) {
        if (this.isDragging) {
            this.seekTo(event);
        }
    }
    
    handleProgressMouseUp(event) {
        this.isDragging = false;
    }
    
    toggleMute() {
        if (!this.video || !this.videoState.isInitialized) return;
        
        this.video.muted = !this.videoState.isMuted;
        this.videoState.isMuted = this.video.muted;
        this.updateVideoControls();
    }
    
    setVolume(value) {
        if (!this.video || !this.videoState.isInitialized) return;
        
        const validatedVolume = this.validateVolume(value);
        if (validatedVolume === null) return;
        
        const volume = validatedVolume / 100;
        this.video.volume = volume;
        this.video.muted = volume === 0;
        this.videoState.volume = volume;
        this.videoState.isMuted = this.video.muted;
        this.updateVideoControls();
    }
    
    setPlaybackSpeed(speed) {
        if (!this.video || !this.videoState.isInitialized) return;
        
        const validatedSpeed = this.validatePlaybackSpeed(speed);
        if (validatedSpeed === null) return;
        
        this.video.playbackRate = validatedSpeed;
        this.videoState.playbackRate = validatedSpeed;
        this.updateVideoControls();
    }
    
    toggleFullscreen() {
        if (!this.isFullscreen) {
            if (this.video.requestFullscreen) {
                this.video.requestFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            } else if (this.video.msRequestFullscreen) {
                this.video.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
    
    handleFullscreenChange() {
        this.isFullscreen = !!document.fullscreenElement;
        this.fullscreenBtn.innerHTML = this.isFullscreen ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
    }
    
    closeVideo() {
        this.videoPlayer.style.display = 'none';
        this.video.pause();
        this.video.currentTime = 0;
        this.currentVideo = null;
    }
    
    onVideoEnded() {
        this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        // Auto-play next video in playlist if available
        this.playNextInPlaylist();
    }
    
    goBack() {
        const parentPath = this.currentPath.split('/').slice(0, -1).join('/');
        if (parentPath && parentPath !== this.currentPath) {
            this.loadDirectory(parentPath);
        }
    }
    
    updateBackButton(parentPath) {
        // Can go back if we're not at the root level (currentPath is not empty)
        const canGoBack = this.currentPath && this.currentPath !== '';
        
        console.log('Back button debug:', {
            parentPath: parentPath,
            currentPath: this.currentPath,
            canGoBack: canGoBack,
            buttonExists: !!this.backBtn,
            buttonDisabled: this.backBtn ? this.backBtn.disabled : 'N/A'
        });
        
        if (canGoBack) {
            console.log('Creating new back button...');
            // Create a new button element to avoid disabled state issues
            const newBackBtn = document.createElement('button');
            newBackBtn.id = 'back-btn';
            newBackBtn.className = 'btn btn-secondary';
            newBackBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back';
            newBackBtn.addEventListener('click', () => this.goBack());
            
            // Replace the old button
            if (this.backBtn && this.backBtn.parentNode) {
                this.backBtn.parentNode.replaceChild(newBackBtn, this.backBtn);
                this.backBtn = newBackBtn;
                console.log('Back button replaced successfully');
            } else {
                console.log('Could not replace back button - parent node not found');
            }
            
            this.backBtn.style.display = 'block';
        } else {
            console.log('Hiding back button');
            this.backBtn.style.display = 'none';
        }
    }
    
    
    toggleView(isGrid) {
        this.isGridView = isGrid;
        this.gridViewBtn.classList.toggle('active', isGrid);
        this.listViewBtn.classList.toggle('active', !isGrid);
        this.loadDirectory();
    }
    
    switchTab(tabName) {
        // Update tab buttons
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab content
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabName + '-tab');
        });
        
        // Load content for specific tabs
        if (tabName === 'playlists') {
            this.loadPlaylists();
        } else if (tabName === 'favorites') {
            this.loadFavorites();
        } else if (tabName === 'recent') {
            this.loadRecentlyPlayed();
        }
    }
    
    async performSearch() {
        if (this.isLoading('search')) {
            console.log('Search already in progress, skipping...');
            return;
        }
        
        const searchTerm = this.validateSearchQuery(this.searchInput.value);
        if (!searchTerm) return;
        
        return this.safeAsyncOperation(async () => {
            const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}&type=${this.filterType.value}`);
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
            this.searchList.innerHTML = '<div class="no-results">No results found</div>';
            return;
        }
        
        this.searchResults.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-item';
            
            const icon = this.getFileIcon(item);
            const size = this.formatFileSize(item.size);
            const date = this.formatDate(item.modified);
            
            div.innerHTML = `
                <div class="file-icon">${icon}</div>
                <div class="search-info">
                    <div class="search-name">${item.name}</div>
                    <div class="search-path">${item.relativePath}</div>
                    <div class="file-details">
                        <span class="file-size">${size}</span>
                        <span class="file-date">${date}</span>
                    </div>
                </div>
            `;
            
            div.addEventListener('click', () => {
                if (item.isVideo) {
                    this.playVideo(item);
                } else if (item.isDirectory) {
                    this.loadDirectory(item.path);
                }
            });
            
            this.searchList.appendChild(div);
        });
    }
    
    async loadPlaylists() {
        try {
            const response = await fetch('/api/playlists');
            const data = await response.json();
            
            if (response.ok) {
                this.playlists = data.playlists || [];
                this.renderPlaylists();
            }
        } catch (error) {
            console.error('Failed to load playlists:', error);
        }
    }
    
    renderPlaylists() {
        this.playlistList.innerHTML = '';
        
        if (this.playlists.length === 0) {
            this.playlistList.innerHTML = '<div class="no-results">No playlists created yet</div>';
            return;
        }
        
        this.playlists.forEach(playlist => {
            const div = document.createElement('div');
            div.className = 'playlist-item';
            
            div.innerHTML = `
                <div class="playlist-info">
                    <div class="playlist-name">${playlist.name}</div>
                    <div class="playlist-count">${playlist.videos.length} videos</div>
                </div>
                <div class="playlist-actions">
                    <button class="btn btn-sm" onclick="app.playPlaylist('${playlist.id}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-sm" onclick="app.deletePlaylist('${playlist.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            this.playlistList.appendChild(div);
        });
    }
    
    async loadFavorites() {
        try {
            const response = await fetch('/api/favorites');
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
            this.favoritesList.innerHTML = '<div class="no-results">No favorites added yet</div>';
            return;
        }
        
        this.favorites.forEach(favorite => {
            const div = document.createElement('div');
            div.className = 'favorite-item';
            
            div.innerHTML = `
                <div class="file-icon">🎬</div>
                <div class="favorite-info">
                    <div class="favorite-name">${favorite.name}</div>
                    <div class="favorite-path">${favorite.path}</div>
                </div>
                <div class="favorite-actions">
                    <button class="btn btn-sm" onclick="app.playVideo({path: '${favorite.path}', name: '${favorite.name}', isVideo: true})">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-sm" onclick="app.removeFavorite('${favorite.id}')">
                        <i class="fas fa-heart-broken"></i>
                    </button>
                </div>
            `;
            
            this.favoritesList.appendChild(div);
        });
    }
    
    async addToPlaylist() {
        if (!this.currentVideo) return;
        
        this.showPlaylistModal();
        this.playlistVideos.innerHTML = `
            <div class="selected-video">
                <i class="fas fa-video"></i> ${this.currentVideo.name}
            </div>
        `;
    }
    
    showPlaylistModal() {
        this.playlistModal.classList.add('active');
    }
    
    hidePlaylistModal() {
        this.playlistModal.classList.remove('active');
        this.playlistName.value = '';
        this.playlistVideos.innerHTML = '';
    }
    
    async savePlaylist() {
        const name = this.validatePlaylistName(this.playlistName.value);
        if (!name) return;
        
        const videos = this.currentVideo ? [this.currentVideo] : [];
        
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
    }
    
    async toggleFavorite() {
        if (!this.currentVideo) return;
        
        try {
            const response = await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: this.currentVideo.path,
                    name: this.currentVideo.name
                })
            });
            
            if (response.ok) {
                this.favoriteBtn.innerHTML = '<i class="fas fa-heart" style="color: red;"></i>';
                this.loadFavorites();
                this.showStatusMessage('Added to favorites!', 'success');
            } else {
                const data = await response.json();
                if (data.error === 'Already in favorites') {
                    this.showStatusMessage('Already in favorites', 'info');
                } else {
                    this.showStatusMessage('Failed to add to favorites: ' + data.error, 'error');
                }
            }
        } catch (error) {
            this.showStatusMessage('Error adding to favorites: ' + error.message, 'error');
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
            
            // Play the first video in the playlist
            const firstVideo = playlist.videos[0];
            this.playVideo(firstVideo);
            
            // Store the playlist for next/previous navigation
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
        localStorage.setItem('videoProgress', JSON.stringify(this.playbackProgress));
    }
    
    loadProgress() {
        const saved = localStorage.getItem('videoProgress');
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
        if (this.videoPlayer.style.display === 'none') return;
        
        switch(e.key) {
            case ' ':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'Escape':
                if (this.isFullscreen) {
                    this.toggleFullscreen();
                } else {
                    this.closeVideo();
                }
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
    
    // Drag and drop
    handleDragOver(e) {
        e.preventDefault();
        this.dragOverlay.classList.add('active');
    }
    
    handleDragLeave(e) {
        if (!e.relatedTarget || !e.relatedTarget.closest('.drag-overlay')) {
            this.dragOverlay.classList.remove('active');
        }
    }
    
    handleDrop(e) {
        e.preventDefault();
        this.dragOverlay.classList.remove('active');
        
        const files = Array.from(e.dataTransfer.files);
        const videoFiles = files.filter(file => {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            return ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.flv', '.wmv', '.3gp', '.ogv'].includes(ext);
        });
        
        if (videoFiles.length > 0) {
            this.showStatusMessage(`Dropped ${videoFiles.length} video file(s). Note: File upload is not implemented in this demo.`, 'info');
        }
    }
    
    showLoading() {
        this.fileList.innerHTML = '<div class="loading">Loading files...</div>';
    }
    
    showError(message) {
        this.fileList.innerHTML = `<div class="error">${message}</div>`;
    }
    
    // Recently Played functionality
    addToRecentlyPlayed(item) {
        const recentItem = {
            id: Date.now().toString(),
            name: item.name,
            path: item.path,
            playedAt: new Date().toISOString(),
            size: item.size,
            isVideo: item.isVideo
        };
        
        // Remove if already exists
        this.recentlyPlayed = this.recentlyPlayed.filter(r => r.path !== item.path);
        
        // Add to beginning
        this.recentlyPlayed.unshift(recentItem);
        
        // Keep only last 50 items
        if (this.recentlyPlayed.length > 50) {
            this.recentlyPlayed = this.recentlyPlayed.slice(0, 50);
        }
        
        // Save to localStorage
        this.saveRecentlyPlayed();
    }
    
    loadRecentlyPlayed() {
        try {
            const saved = localStorage.getItem('recentlyPlayed');
            if (saved) {
                this.recentlyPlayed = JSON.parse(saved);
            }
            this.renderRecentlyPlayed();
        } catch (error) {
            console.error('Failed to load recently played:', error);
            this.recentlyPlayed = [];
        }
    }
    
    saveRecentlyPlayed() {
        try {
            localStorage.setItem('recentlyPlayed', JSON.stringify(this.recentlyPlayed));
        } catch (error) {
            console.error('Failed to save recently played:', error);
        }
    }
    
    renderRecentlyPlayed() {
        this.recentList.innerHTML = '';
        
        if (this.recentlyPlayed.length === 0) {
            this.recentList.innerHTML = '<div class="no-results">No recently played videos</div>';
            return;
        }
        
        this.recentlyPlayed.forEach(item => {
            const div = document.createElement('div');
            div.className = 'recent-item';
            
            const timeAgo = this.getTimeAgo(new Date(item.playedAt));
            const size = this.formatFileSize(item.size);
            
            div.innerHTML = `
                <div class="file-icon">🎬</div>
                <div class="recent-info">
                    <div class="recent-name">${item.name}</div>
                    <div class="recent-path">${item.path}</div>
                    <div class="recent-time">Played ${timeAgo} • ${size}</div>
                </div>
                <div class="recent-actions">
                    <button class="btn btn-sm" onclick="app.playVideo({path: '${item.path}', name: '${item.name}', isVideo: true, size: ${item.size}})">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-sm" onclick="app.removeFromRecentlyPlayed('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            
            this.recentList.appendChild(div);
        });
    }
    
    removeFromRecentlyPlayed(id) {
        this.recentlyPlayed = this.recentlyPlayed.filter(item => item.id !== id);
        this.saveRecentlyPlayed();
        this.renderRecentlyPlayed();
    }
    
    async clearRecentlyPlayed() {
        if (await this.showConfirmDialog('Are you sure you want to clear your recently played history?')) {
            this.recentlyPlayed = [];
            this.saveRecentlyPlayed();
            this.renderRecentlyPlayed();
            this.showStatusMessage('Recently played history cleared', 'success');
        }
    }
    
    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) {
            return 'just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        }
    }
    
    // ========================================
    // ENHANCED ACCESSIBILITY & UX METHODS
    // ========================================
    
    setupAriaLiveRegion() {
        // Create ARIA live region for announcements
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
        this.focusedElement = e.target;
        e.target.classList.add('focus-visible');
    }
    
    handleFocusOut(e) {
        e.target.classList.remove('focus-visible');
    }
    
    handleKeyboardUp(e) {
        // Handle key up events for better accessibility
        if (e.key === 'Tab') {
            this.keyboardNavigation = true;
            document.body.classList.add('keyboard-navigation');
        }
    }
    
    // Enhanced keyboard navigation
    handleKeyboard(e) {
        // Skip if user is typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
            return;
        }
        
        switch(e.key) {
            case 'Tab':
                this.keyboardNavigation = true;
                document.body.classList.add('keyboard-navigation');
                break;
            case 'Escape':
                this.handleEscapeKey();
                break;
            case 'ArrowUp':
            case 'ArrowDown':
                e.preventDefault();
                this.navigateFileList(e.key === 'ArrowUp' ? -1 : 1);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                this.activateFocusedElement();
                break;
            case 'j':
            case 'J':
                e.preventDefault();
                this.seekVideo(-10);
                break;
            case 'l':
            case 'L':
                e.preventDefault();
                this.seekVideo(10);
                break;
            case 'k':
            case 'K':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                this.toggleMute();
                break;
        }
    }
    
    handleEscapeKey() {
        // Close modals, exit fullscreen, etc.
        if (this.playlistModal.classList.contains('active')) {
            this.hidePlaylistModal();
        } else if (this.isFullscreen) {
            this.toggleFullscreen();
        }
    }
    
    navigateFileList(direction) {
        const fileItems = this.fileList.querySelectorAll('.file-item, .playlist-item, .favorite-item, .recent-item, .search-item');
        if (fileItems.length === 0) return;
        
        const currentIndex = Array.from(fileItems).findIndex(item => item.classList.contains('focus-visible'));
        let nextIndex = currentIndex + direction;
        
        if (nextIndex < 0) nextIndex = fileItems.length - 1;
        if (nextIndex >= fileItems.length) nextIndex = 0;
        
        // Remove focus from current item
        if (currentIndex >= 0) {
            fileItems[currentIndex].classList.remove('focus-visible');
        }
        
        // Add focus to next item
        fileItems[nextIndex].classList.add('focus-visible');
        fileItems[nextIndex].focus();
        fileItems[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    activateFocusedElement() {
        const focusedElement = document.querySelector('.file-item.focus-visible, .playlist-item.focus-visible, .favorite-item.focus-visible, .recent-item.focus-visible, .search-item.focus-visible');
        if (focusedElement) {
            focusedElement.click();
        }
    }
    
    seekVideo(seconds) {
        if (this.video && !this.video.paused) {
            const newTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            this.video.currentTime = newTime;
            this.announceToScreenReader(`Seeked to ${Math.floor(newTime / 60)}:${Math.floor(newTime % 60).toString().padStart(2, '0')}`);
        }
    }
    
    // ========================================
    // PERFORMANCE OPTIMIZATION METHODS
    // ========================================
    
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
    
    // Optimized rendering with requestAnimationFrame
    renderWithAnimation(callback) {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        this.animationFrame = requestAnimationFrame(callback);
    }
    
    // Loading state management
    setLoadingState(element, isLoading) {
        if (isLoading) {
            this.loadingStates.set(element, true);
            element.classList.add('loading-skeleton');
            element.setAttribute('aria-busy', 'true');
        } else {
            this.loadingStates.set(element, false);
            element.classList.remove('loading-skeleton');
            element.setAttribute('aria-busy', 'false');
        }
    }
    
    // ========================================
    // ENHANCED UI FEEDBACK METHODS
    // ========================================
    
    showStatusMessage(message, type = 'info', duration = 3000) {
        const statusMessage = document.createElement('div');
        statusMessage.className = `status-message status-message--${type}`;
        statusMessage.textContent = message;
        statusMessage.setAttribute('role', 'status');
        statusMessage.setAttribute('aria-live', 'polite');
        
        document.body.appendChild(statusMessage);
        
        // Animate in
        requestAnimationFrame(() => {
            statusMessage.classList.add('status-message--show');
        });
        
        // Remove after duration
        setTimeout(() => {
            statusMessage.classList.remove('status-message--show');
            setTimeout(() => {
                if (statusMessage.parentNode) {
                    statusMessage.parentNode.removeChild(statusMessage);
                }
            }, 300);
        }, duration);
    }
    
    // Enhanced error handling
    handleError(error, context = '') {
        console.error(`Error in ${context}:`, error);
        this.showStatusMessage(`Error: ${error.message || 'Something went wrong'}`, 'error');
        this.announceToScreenReader(`Error: ${error.message || 'Something went wrong'}`);
    }
    
    // Confirmation dialog
    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>Confirm Action</h3>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button id="confirm-yes" class="btn btn-primary">Yes</button>
                        <button id="confirm-no" class="btn btn-secondary">No</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const yesBtn = modal.querySelector('#confirm-yes');
            const noBtn = modal.querySelector('#confirm-no');
            
            yesBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
            });
            
            noBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
            });
            
            // Close on backdrop click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            });
            
            // Focus management
            yesBtn.focus();
        });
    }
    
    // ========================================
    // ENHANCED METADATA DISPLAY
    // ========================================
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    getFileTypeIcon(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'];
        const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg'];
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'];
        
        if (videoExtensions.includes(extension)) {
            return 'fas fa-video';
        } else if (audioExtensions.includes(extension)) {
            return 'fas fa-music';
        } else if (imageExtensions.includes(extension)) {
            return 'fas fa-image';
        } else if (extension === 'pdf') {
            return 'fas fa-file-pdf';
        } else if (['doc', 'docx'].includes(extension)) {
            return 'fas fa-file-word';
        } else if (['xls', 'xlsx'].includes(extension)) {
            return 'fas fa-file-excel';
        } else if (['ppt', 'pptx'].includes(extension)) {
            return 'fas fa-file-powerpoint';
        } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
            return 'fas fa-file-archive';
        } else {
            return 'fas fa-file';
        }
    }
    
    // ========================================
    // VIDEO PLAYER INITIALIZATION & STATE MANAGEMENT
    // ========================================
    
    initializeVideoPlayer() {
        if (!this.video || !this.videoSource) {
            console.error('Video elements not found during initialization');
            return;
        }
        
        console.log('Initializing video player...');
        
        // Set initial video state
        this.videoState.isInitialized = true;
        this.videoState.volume = this.video.volume || 1.0;
        this.videoState.isMuted = this.video.muted || false;
        this.videoState.playbackRate = this.video.playbackRate || 1.0;
        
        // Update UI to reflect initial state
        this.updateVideoControls();
        
        // Add video event listeners
        this.setupVideoEventListeners();
        
        // Attach click listener
        this.attachVideoClickListener();
        
        console.log('Video player initialized successfully');
    }
    
    setupVideoEventListeners() {
        if (!this.video) {
            console.log('Video element not available for event listeners');
            return;
        }
        
        console.log('Setting up video event listeners...');
        
        // Remove existing listeners to prevent duplicates
        this.removeVideoEventListeners();
        
        // Add new listeners
        this.video.addEventListener('loadstart', () => this.handleVideoLoadStart());
        this.video.addEventListener('loadedmetadata', () => this.handleVideoLoadedMetadata());
        this.video.addEventListener('loadeddata', () => this.handleVideoLoadedData());
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
        this.video.addEventListener('click', () => {
            console.log('Video clicked from setupVideoEventListeners!');
            this.togglePlayPause();
        });
        
        console.log('Video event listeners set up successfully');
    }
    
    removeVideoEventListeners() {
        if (!this.video) return;
        
        // Clone the video element to remove all event listeners
        const newVideo = this.video.cloneNode(true);
        this.video.parentNode.replaceChild(newVideo, this.video);
        this.video = newVideo;
    }
    
    handleVideoLoadStart() {
        this.videoState.isSeeking = false;
        this.showStatusMessage('Loading video...', 'info');
    }
    
    handleVideoLoadedMetadata() {
        this.videoState.duration = this.video.duration;
        this.updateVideoInfo();
        this.updateVideoControls();
    }
    
    handleVideoLoadedData() {
        this.showStatusMessage('Video loaded', 'success');
    }
    
    handleVideoCanPlay() {
        this.videoState.isInitialized = true;
    }
    
    handleVideoPlay() {
        this.videoState.isPlaying = true;
        this.updateVideoControls();
    }
    
    handleVideoPause() {
        this.videoState.isPlaying = false;
        this.updateVideoControls();
    }
    
    handleVideoEnded() {
        this.videoState.isPlaying = false;
        this.updateVideoControls();
        this.onVideoEnded();
    }
    
    handleVideoTimeUpdate() {
        if (!this.videoState.isSeeking) {
            this.videoState.currentTime = this.video.currentTime;
            this.updateProgress();
        }
    }
    
    handleVideoVolumeChange() {
        this.videoState.volume = this.video.volume;
        this.videoState.isMuted = this.video.muted;
        this.updateVideoControls();
    }
    
    handleVideoRateChange() {
        this.videoState.playbackRate = this.video.playbackRate;
        this.updateVideoControls();
    }
    
    handleVideoError(e) {
        console.error('Video error:', e);
        this.showStatusMessage('Video playback error occurred', 'error');
        this.videoState.isPlaying = false;
        this.updateVideoControls();
    }
    
    handleVideoSeeking() {
        this.videoState.isSeeking = true;
    }
    
    handleVideoSeeked() {
        this.videoState.isSeeking = false;
        this.videoState.currentTime = this.video.currentTime;
    }
    
    updateVideoControls() {
        if (!this.videoState.isInitialized) return;
        
        // Update play/pause button
        if (this.playPauseBtn) {
            this.playPauseBtn.innerHTML = this.videoState.isPlaying ? 
                '<i class="fas fa-pause" aria-hidden="true"></i>' : 
                '<i class="fas fa-play" aria-hidden="true"></i>';
        }
        
        // Update mute button
        if (this.muteBtn) {
            this.muteBtn.innerHTML = this.videoState.isMuted ? 
                '<i class="fas fa-volume-mute" aria-hidden="true"></i>' : 
                '<i class="fas fa-volume-up" aria-hidden="true"></i>';
        }
        
        // Update volume slider
        if (this.volumeSlider) {
            this.volumeSlider.value = this.videoState.isMuted ? 0 : this.videoState.volume * 100;
        }
        
        // Update speed select
        if (this.speedSelect) {
            this.speedSelect.value = this.videoState.playbackRate;
        }
    }
    
    // ========================================
    // INPUT VALIDATION & SANITIZATION
    // ========================================
    
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
                if (options.pattern && !options.pattern.test(trimmedInput)) {
                    return { isValid: false, error: options.patternError || 'Input format is invalid' };
                }
                break;
                
            case 'number':
                const num = parseFloat(trimmedInput);
                if (isNaN(num)) {
                    return { isValid: false, error: 'Input must be a valid number' };
                }
                if (options.min !== undefined && num < options.min) {
                    return { isValid: false, error: `Value must be at least ${options.min}` };
                }
                if (options.max !== undefined && num > options.max) {
                    return { isValid: false, error: `Value must be no more than ${options.max}` };
                }
                break;
                
            case 'path':
                if (typeof trimmedInput !== 'string') {
                    return { isValid: false, error: 'Path must be a string' };
                }
                // Check for dangerous path patterns
                if (trimmedInput.includes('..') || trimmedInput.includes('//') || trimmedInput.startsWith('/')) {
                    return { isValid: false, error: 'Invalid path format' };
                }
                break;
                
            case 'email':
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailPattern.test(trimmedInput)) {
                    return { isValid: false, error: 'Invalid email format' };
                }
                break;
        }
        
        return { isValid: true, value: trimmedInput };
    }
    
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/['"]/g, '') // Remove quotes that could break JSON
            .replace(/[\\]/g, '') // Remove backslashes
            .trim();
    }
    
    validateSearchQuery(query) {
        const validation = this.validateInput(query, 'string', {
            minLength: 1,
            maxLength: 100,
            pattern: /^[a-zA-Z0-9\s\-_.,!?]+$/,
            patternError: 'Search query contains invalid characters'
        });
        
        if (!validation.isValid) {
            this.showStatusMessage(validation.error, 'warning');
            return null;
        }
        
        return this.sanitizeInput(validation.value);
    }
    
    validatePlaylistName(name) {
        const validation = this.validateInput(name, 'string', {
            minLength: 1,
            maxLength: 50,
            pattern: /^[a-zA-Z0-9\s\-_]+$/,
            patternError: 'Playlist name can only contain letters, numbers, spaces, hyphens, and underscores'
        });
        
        if (!validation.isValid) {
            this.showStatusMessage(validation.error, 'warning');
            return null;
        }
        
        return this.sanitizeInput(validation.value);
    }
    
    validateVideoPath(path) {
        const validation = this.validateInput(path, 'path');
        
        if (!validation.isValid) {
            this.showStatusMessage(validation.error, 'error');
            return null;
        }
        
        return this.sanitizeInput(validation.value);
    }
    
    validateVolume(volume) {
        const validation = this.validateInput(volume, 'number', {
            min: 0,
            max: 100
        });
        
        if (!validation.isValid) {
            this.showStatusMessage(validation.error, 'warning');
            return null;
        }
        
        return validation.value;
    }
    
    validatePlaybackSpeed(speed) {
        const validation = this.validateInput(speed, 'number', {
            min: 0.25,
            max: 3.0
        });
        
        if (!validation.isValid) {
            this.showStatusMessage(validation.error, 'warning');
            return null;
        }
        
        return validation.value;
    }
    
    // ========================================
    // ASYNC OPERATION MANAGEMENT
    // ========================================
    
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
    
    cancelActiveRequests() {
        this.activeRequests.clear();
        this.loadingStates.clear();
    }
    
    debounce(func, wait, context = '') {
        return (...args) => {
            if (this.debounceTimeout) {
                clearTimeout(this.debounceTimeout);
            }
            
            this.debounceTimeout = setTimeout(() => {
                func.apply(this, args);
            }, wait);
        };
    }
    
    throttle(func, limit, context = '') {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // ========================================
    // VIDEO CLICK HANDLING
    // ========================================
    
    attachVideoClickListener() {
        if (!this.video) {
            console.log('Video element not available for click listener');
            return;
        }
        
        // Remove existing click listener to avoid duplicates
        this.video.removeEventListener('click', this.handleVideoClick);
        
        // Add click listener to video element
        this.video.addEventListener('click', this.handleVideoClick);
        
        console.log('Video click listener attached');
    }
    
    handleVideoClick = (event) => {
        console.log('Video clicked!', event);
        event.preventDefault();
        event.stopPropagation();
        this.togglePlayPause();
    }
    
    // Alternative approach: detect user interaction with video
    handleVideoUserInteraction = () => {
        console.log('User interacted with video');
        // This will be called when user clicks play/pause on native controls
        // We can use this to sync our custom controls
    }
    
    // ========================================
    // CLEANUP & MEMORY MANAGEMENT
    // ========================================
    
    cleanup() {
        // Cancel all active requests
        this.cancelActiveRequests();
        
        // Clear timeouts and intervals
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        // Remove video event listeners
        this.removeVideoEventListeners();
        
        // Clear loading states
        this.loadingStates.clear();
        
        // Save current state
        this.saveProgress();
        this.saveRecentlyPlayed();
    }
    
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AdvancedVideoPlayerBrowser();
});