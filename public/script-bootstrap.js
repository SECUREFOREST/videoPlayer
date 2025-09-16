// Modern Video Player Browser with Bootstrap
class ModernVideoPlayerBrowser {
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
        this.focusedElement = null;
        this.keyboardNavigation = true;
        this.selectedPlaylistId = null;
        
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
        this.gridViewRadio = document.getElementById('grid-view');
        this.listViewRadio = document.getElementById('list-view');
        
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
        this.loadDirectory();
        this.loadPlaylists();
        this.loadFavorites();
        this.loadProgressFromStorage();
    }
    
    bindEvents() {
        // Navigation
        if (this.backBtn) this.backBtn.addEventListener('click', () => this.goBack());
        if (this.refreshBtn) this.refreshBtn.addEventListener('click', () => this.loadDirectory());
        
        // View toggle
        if (this.gridViewRadio) this.gridViewRadio.addEventListener('change', () => this.toggleView(true));
        if (this.listViewRadio) this.listViewRadio.addEventListener('change', () => this.toggleView(false));
        
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
                this.loadDirectory();
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
        if (this.createPlaylistBtn) this.createPlaylistBtn.addEventListener('click', () => this.showPlaylistModal());
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
                sortBy: this.sortBy.value || 'name',
                sortOrder: this.sortOrder.value || 'asc',
                filterType: this.filterType.value || 'all'
            });
            
            const response = await fetch(`/api/browse?${params}`);
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
        
        div.innerHTML = `
            <div class="file-icon me-3">${icon}</div>
            <div class="file-info flex-grow-1">
                <div class="file-name">${item.name}</div>
                <div class="file-details d-flex gap-3">
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
        
        col.appendChild(div);
        return col;
    }
    
    createGridItem(item) {
        const col = document.createElement('div');
        col.className = 'col-md-4 col-lg-3 col-xl-2';
        
        const div = document.createElement('div');
        div.className = 'file-grid-item h-100';
        
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
        
        col.appendChild(div);
        return col;
    }
    
    async loadThumbnail(item, container) {
        if (!item || !container || !item.path) {
            console.warn('Invalid parameters for thumbnail loading');
            return;
        }
        
        try {
            console.log('Loading thumbnail for:', item.name, 'Path:', item.path);
            const response = await fetch(`/api/thumbnail?path=${encodeURIComponent(item.path)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Thumbnail API response:', data);
            
            if (data.thumbnailUrl) {
                const img = document.createElement('img');
                img.src = data.thumbnailUrl;
                img.className = 'thumbnail';
                img.alt = item.name;
                img.onload = () => console.log('Thumbnail loaded successfully:', data.thumbnailUrl);
                img.onerror = (e) => {
                    console.warn('Thumbnail failed to load:', data.thumbnailUrl, e);
                    // Remove the broken image
                    if (img.parentNode) {
                        img.parentNode.removeChild(img);
                    }
                };
                container.insertBefore(img, container.firstChild);
            } else {
                console.log('No thumbnail URL returned for:', item.name);
            }
        } catch (error) {
            console.warn('Thumbnail generation failed for', item.name, ':', error.message);
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
                this.videoTitle.innerHTML = `<i class="fas fa-play-circle me-2"></i>${videoData.name}`;
                
                const videoUrl = `/videos/${encodeURIComponent(item.path)}`;
                this.videoSource.src = videoUrl;
                this.videoSource.type = videoData.mimeType;
                this.video.src = videoUrl;
                
                this.video.load();
                
                // Update video info
                this.updateVideoInfo(videoData);
                
                // Show modal
                this.videoPlayerModal.show();
                
                // Restore progress if available
                this.restoreProgress(item.path);
                
                // Autoplay the video
                this.video.play().catch(error => {
                    console.log('Autoplay failed:', error);
                });
            } else {
                this.showStatusMessage('Error loading video: ' + videoData.error, 'error');
            }
        } catch (error) {
            this.showStatusMessage('Error loading video: ' + error.message, 'error');
        }
    }
    
    updateVideoInfo(videoData = null) {
        if (videoData) {
            const size = this.formatFileSize(videoData.size);
            const date = this.formatDate(videoData.modified);
            this.videoInfo.innerHTML = `
                <strong>File:</strong> ${videoData.name}<br>
                <strong>Size:</strong> ${size}<br>
                <strong>Modified:</strong> ${date}<br>
                <strong>Format:</strong> ${videoData.extension.toUpperCase()}
            `;
        } else if (this.currentVideo && this.video) {
            // Fallback for when called without videoData
            this.videoInfo.innerHTML = `
                <strong>File:</strong> ${this.currentVideo.name}<br>
                <strong>Duration:</strong> ${this.formatTime(this.video.duration)}<br>
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
        this.currentVideo = null;
    }
    
    onVideoEnded() {
        this.playNextInPlaylist();
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
    
    toggleView(isGrid) {
        this.isGridView = isGrid;
        this.gridViewRadio.checked = isGrid;
        this.listViewRadio.checked = !isGrid;
        this.loadDirectory();
    }
    
    switchTab(tabName) {
        console.log('Switching to tab:', tabName);
        
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
        }
    }
    
    async performSearch() {
        if (this.isLoading('search')) {
            console.log('Search already in progress, skipping...');
            return;
        }
        
        const searchTerm = this.validateSearchQuery(this.searchInput.value);
        if (!searchTerm) return;
        
        console.log('Performing search for:', searchTerm, 'Filter type:', this.filterType.value);
        
        return this.safeAsyncOperation(async () => {
            const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}&type=${this.filterType.value || 'all'}`);
            
            const data = await response.json();
            
            console.log('Search API response:', data);
            
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
        console.log('Rendering search results:', this.searchResults.length, 'items');
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
        
        console.log('Filtered results:', filteredResults.length, 'items');
        
        if (filteredResults.length === 0) {
            this.searchList.innerHTML = '<div class="col-12"><div class="text-center text-muted py-4"><i class="fas fa-search fa-2x mb-2"></i><p>No results found (filtered out system files)</p></div></div>';
            return;
        }
        
        filteredResults.forEach(item => {
            const col = document.createElement('div');
            col.className = 'col-12';
            
            const div = document.createElement('div');
            div.className = 'search-item p-3 d-flex align-items-center';
            
            const icon = this.getFileIcon(item);
            const size = this.formatFileSize(item.size);
            const date = this.formatDate(item.modified);
            
            div.innerHTML = `
                <div class="file-icon me-3">${icon}</div>
                <div class="search-info flex-grow-1">
                    <div class="search-name">${item.name}</div>
                    <div class="search-path text-muted small">${item.relativePath}</div>
                    <div class="file-details d-flex gap-3 small text-muted">
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
            
            col.appendChild(div);
            this.searchList.appendChild(col);
            console.log('Added search result item:', item.name);
        });
        
        console.log('Search results rendered. Total items in DOM:', this.searchList.children.length);
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
            this.playlistList.innerHTML = '<div class="col-12"><div class="text-center text-muted py-4"><i class="fas fa-list fa-2x mb-2"></i><p>No playlists created yet</p></div></div>';
            return;
        }
        
        this.playlists.forEach(playlist => {
            const col = document.createElement('div');
            col.className = 'col-12';
            
            const div = document.createElement('div');
            div.className = 'playlist-item p-3 d-flex align-items-center';
            
            div.innerHTML = `
                <div class="playlist-info flex-grow-1">
                    <div class="playlist-name">${playlist.name}</div>
                    <div class="playlist-count text-muted small">${playlist.videos.length} videos</div>
                </div>
                <div class="playlist-actions">
                    <button class="btn btn-sm btn-outline-primary me-2" onclick="app.playPlaylist('${playlist.id}')">
                        <i class="fas fa-play me-1"></i>Play
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="app.deletePlaylist('${playlist.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            col.appendChild(div);
            this.playlistList.appendChild(col);
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
            this.favoritesList.innerHTML = '<div class="col-12"><div class="text-center text-muted py-4"><i class="fas fa-heart fa-2x mb-2"></i><p>No favorites added yet</p></div></div>';
            return;
        }
        
        this.favorites.forEach(favorite => {
            const col = document.createElement('div');
            col.className = 'col-12';
            
            const div = document.createElement('div');
            div.className = 'favorite-item p-3 d-flex align-items-center';
            
            div.innerHTML = `
                <div class="file-icon me-3">🎬</div>
                <div class="favorite-info flex-grow-1">
                    <div class="favorite-name">${favorite.name}</div>
                    <div class="favorite-path text-muted small">${favorite.path}</div>
                </div>
                <div class="favorite-actions">
                    <button class="btn btn-sm btn-outline-primary me-2" onclick="app.playVideo({path: '${favorite.path}', name: '${favorite.name}', isVideo: true})">
                        <i class="fas fa-play me-1"></i>Play
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="app.removeFavorite('${favorite.id}')">
                        <i class="fas fa-heart-broken"></i>
                    </button>
                </div>
            `;
            
            col.appendChild(div);
            this.favoritesList.appendChild(col);
        });
    }
    
    async addToPlaylist() {
        if (!this.currentVideo) return;
        
        this.showPlaylistModal();
        this.playlistVideos.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-video me-2"></i>${this.currentVideo.name}
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
            
            freshExistingTab.addEventListener('click', () => {
                this.selectedPlaylistId = null;
                // Clear any selected playlist
                const existingPlaylistsList = document.getElementById('existing-playlists-list');
                if (existingPlaylistsList) {
                    existingPlaylistsList.querySelectorAll('.list-group-item').forEach(item => {
                        item.classList.remove('active');
                    });
                }
            });
            
            freshNewTab.addEventListener('click', () => {
                this.selectedPlaylistId = null;
                // Clear any selected playlist
                const existingPlaylistsList = document.getElementById('existing-playlists-list');
                if (existingPlaylistsList) {
                    existingPlaylistsList.querySelectorAll('.list-group-item').forEach(item => {
                        item.classList.remove('active');
                    });
                }
            });
        }
    }
    
    showPlaylistModal() {
        this.playlistModal.show();
    }
    
    async loadExistingPlaylists() {
        try {
            const response = await fetch('/api/playlists');
            const data = await response.json();
            
            const existingPlaylistsList = document.getElementById('existing-playlists-list');
            const noPlaylistsMessage = document.getElementById('no-playlists-message');
            
            if (data.playlists && data.playlists.length > 0) {
                existingPlaylistsList.innerHTML = '';
                noPlaylistsMessage.style.display = 'none';
                
                data.playlists.forEach(playlist => {
                    const playlistItem = document.createElement('div');
                    playlistItem.className = 'list-group-item list-group-item-action bg-dark text-light border-secondary';
                    playlistItem.style.cursor = 'pointer';
                    playlistItem.innerHTML = `
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${playlist.name}</h6>
                            <small>${playlist.videos.length} videos</small>
                        </div>
                        <small class="text-muted">Created: ${new Date(playlist.created).toLocaleDateString()}</small>
                    `;
                    
                    playlistItem.addEventListener('click', () => {
                        // Remove active class from all items
                        existingPlaylistsList.querySelectorAll('.list-group-item').forEach(item => {
                            item.classList.remove('active');
                        });
                        // Add active class to clicked item
                        playlistItem.classList.add('active');
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
        
        // Reset tab to existing playlists
        const existingTab = document.getElementById('existing-playlist-tab');
        const newTab = document.getElementById('new-playlist-tab');
        if (existingTab && newTab) {
            existingTab.classList.add('active');
            newTab.classList.remove('active');
            document.getElementById('existing-playlist-pane').classList.add('show', 'active');
            document.getElementById('new-playlist-pane').classList.remove('show', 'active');
        }
        
        // Clear selected playlist
        const existingPlaylistsList = document.getElementById('existing-playlists-list');
        if (existingPlaylistsList) {
            existingPlaylistsList.querySelectorAll('.list-group-item').forEach(item => {
                item.classList.remove('active');
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
            if (!newPlaylistPane || !newPlaylistPane.classList.contains('active')) {
                this.showStatusMessage('Please select a playlist or create a new one', 'warning');
                return;
            }
            
            // Create new playlist
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
    }
    
    async addVideoToExistingPlaylist() {
        if (!this.selectedPlaylistId || !this.currentVideo) return;
        
        try {
            const response = await fetch(`/api/playlists/${this.selectedPlaylistId}/add-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video: this.currentVideo })
            });
            
            if (response.ok) {
                this.hidePlaylistModal();
                this.loadPlaylists();
                this.showStatusMessage('Video added to playlist successfully!', 'success');
            } else {
                const data = await response.json();
                this.showStatusMessage('Failed to add video to playlist: ' + data.error, 'error');
            }
        } catch (error) {
            this.showStatusMessage('Error adding video to playlist: ' + error.message, 'error');
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
                this.favoriteBtn.innerHTML = '<i class="fas fa-heart me-1"></i>Favorited';
                this.favoriteBtn.classList.remove('btn-outline-danger');
                this.favoriteBtn.classList.add('btn-danger');
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
            switch(e.key) {
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
        
        console.log('Initializing video player...');
        
        this.videoState.isInitialized = true;
        this.videoState.volume = this.video.volume || 1.0;
        this.videoState.isMuted = this.video.muted || false;
        this.videoState.playbackRate = this.video.playbackRate || 1.0;
        
        this.setupVideoEventListeners();
        console.log('Video player initialized successfully');
    }
    
    setupVideoEventListeners() {
        if (!this.video) return;
        
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
    }
    
    handleVideoLoadStart() {
        console.log('Video load started');
        this.videoState.isSeeking = false;
    }
    
    handleVideoLoadedMetadata() {
        console.log('Video metadata loaded, duration:', this.video.duration);
        this.videoState.duration = this.video.duration;
        this.updateVideoInfo();
    }
    
    handleVideoLoadedData() {
        console.log('Video data loaded');
    }
    
    handleVideoCanPlay() {
        console.log('Video can play');
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
        }
    }
    
    handleVideoVolumeChange() {
        this.videoState.volume = this.video.volume;
        this.videoState.isMuted = this.video.muted;
    }
    
    handleVideoRateChange() {
        this.videoState.playbackRate = this.video.playbackRate;
    }
    
    handleVideoError(e) {
        console.error('Video error:', e);
        this.showStatusMessage('Video playback error occurred', 'error');
        this.videoState.isPlaying = false;
    }
    
    handleVideoSeeking() {
        this.videoState.isSeeking = true;
    }
    
    handleVideoSeeked() {
        this.videoState.isSeeking = false;
        this.videoState.currentTime = this.video.currentTime;
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
        this.focusedElement = e.target;
        e.target.classList.add('focus-visible');
    }
    
    handleFocusOut(e) {
        e.target.classList.remove('focus-visible');
    }
    
    handleKeyboardUp(e) {
        if (e.key === 'Tab') {
            this.keyboardNavigation = true;
            document.body.classList.add('keyboard-navigation');
        }
    }
    
    // Status messages
    showStatusMessage(message, type = 'info', duration = 3000) {
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
        this.showStatusMessage(`Error: ${error.message || 'Something went wrong'}`, 'error');
        this.announceToScreenReader(`Error: ${error.message || 'Something went wrong'}`);
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
    
    // Utility methods - validateInput is defined above in the Input validation section
    
    showLoading() {
        // Simple loading indicator
        const loadingEl = document.querySelector('.loading');
        if (loadingEl) loadingEl.style.display = 'block';
    }
    
    hideLoading() {
        const loadingEl = document.querySelector('.loading');
        if (loadingEl) loadingEl.style.display = 'none';
    }
    
    showError(message) {
        console.error(message);
        // You could implement a toast notification here
    }
    
    showStatusMessage(message, type = 'info') {
        console.log(`${type.toUpperCase()}: ${message}`);
        // You could implement a toast notification here
    }
    
    handleKeyboard(e) {
        // Basic keyboard navigation
        if (e.key === 'Escape') {
            if (this.videoPlayerModal && this.videoPlayerModal._isShown) {
                this.closeVideo();
            }
        }
    }
    
    handleKeyboardUp(e) {
        // Handle key up events if needed
    }
    
    handleFocusIn(e) {
        this.focusedElement = e.target;
    }
    
    handleFocusOut(e) {
        // Handle focus out if needed
    }
    
    setupAriaLiveRegion() {
        // Create ARIA live region for screen readers
        if (!document.getElementById('aria-live-region')) {
            const liveRegion = document.createElement('div');
            liveRegion.id = 'aria-live-region';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            document.body.appendChild(liveRegion);
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
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        this.loadingStates.clear();
        this.saveAllProgress();
    }
    
    cancelActiveRequests() {
        this.activeRequests.clear();
        this.loadingStates.clear();
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
