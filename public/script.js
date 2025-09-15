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
        
        // DOM elements
        this.initializeElements();
        this.init();
    }
    
    initializeElements() {
        // Main elements
        this.videoPlayer = document.getElementById('video-player');
        this.fileList = document.getElementById('file-list');
        this.currentPathDisplay = document.getElementById('current-path');
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
        this.loadDirectory();
        this.loadPlaylists();
        this.loadFavorites();
        this.loadProgress();
    }
    
    bindEvents() {
        // Navigation
        this.backBtn.addEventListener('click', () => this.goBack());
        this.refreshBtn.addEventListener('click', () => this.loadDirectory());
        this.gridViewBtn.addEventListener('click', () => this.toggleView(true));
        this.listViewBtn.addEventListener('click', () => this.toggleView(false));
        
        // Search and filters
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
        this.video.addEventListener('loadedmetadata', () => this.updateVideoInfo());
        this.video.addEventListener('timeupdate', () => this.updateProgress());
        this.video.addEventListener('ended', () => this.onVideoEnded());
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.progressBar.addEventListener('click', (e) => this.seekTo(e));
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
        
        // Modal
        document.querySelector('.modal-close').addEventListener('click', () => this.hidePlaylistModal());
        this.playlistModal.addEventListener('click', (e) => {
            if (e.target === this.playlistModal) this.hidePlaylistModal();
        });
        
        // Drag and drop
        document.addEventListener('dragover', (e) => this.handleDragOver(e));
        document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        document.addEventListener('drop', (e) => this.handleDrop(e));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Fullscreen events
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
    }
    
    async loadDirectory(path = '') {
        try {
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
                this.updatePathDisplay();
                this.renderFileList(data.items, data.parentPath);
                this.updateBackButton(data.parentPath);
            } else {
                this.showError(data.error || 'Failed to load directory');
            }
        } catch (error) {
            this.showError('Network error: ' + error.message);
        }
    }
    
    renderFileList(items, parentPath) {
        this.fileList.innerHTML = '';
        
        if (parentPath && parentPath !== this.currentPath) {
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
                alert('This file type is not supported. Only video files can be played.');
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
                alert('This file type is not supported. Only video files can be played.');
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
                const filePath = item.path.split('/').map(encodeURIComponent).join('/');
                console.log(filePath)
                videoSource.src = `/videos/${filePath}`;
                console.log(videoSource.src)
                this.videoSource.type = videoData.mimeType;
                this.video.load();
                this.videoPlayer.style.display = 'block';
                this.updateVideoInfo(videoData);
                
                // Restore progress if available
                this.restoreProgress(item.path);
                
                // Switch to video player tab
                this.switchTab('browser');
            } else {
                alert('Error loading video: ' + videoData.error);
            }
        } catch (error) {
            alert('Error loading video: ' + error.message);
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
        if (this.video.paused) {
            this.video.play();
            this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            this.video.pause();
            this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
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
        const rect = this.progressBar.getBoundingClientRect();
        const pos = (event.clientX - rect.left) / rect.width;
        this.video.currentTime = pos * this.video.duration;
    }
    
    toggleMute() {
        this.video.muted = !this.video.muted;
        this.muteBtn.innerHTML = this.video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        this.volumeSlider.value = this.video.muted ? 0 : this.video.volume * 100;
    }
    
    setVolume(value) {
        this.video.volume = value / 100;
        this.video.muted = value == 0;
        this.muteBtn.innerHTML = this.video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    }
    
    setPlaybackSpeed(speed) {
        this.video.playbackRate = parseFloat(speed);
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
        this.backBtn.disabled = !parentPath || parentPath === this.currentPath;
    }
    
    updatePathDisplay() {
        this.currentPathDisplay.textContent = this.currentPath;
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
        }
    }
    
    async performSearch() {
        const searchTerm = this.searchInput.value.trim();
        if (!searchTerm) return;
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}&type=${this.filterType.value}`);
            const data = await response.json();
            
            if (response.ok) {
                this.searchResults = data.results;
                this.renderSearchResults();
                this.searchCount.textContent = `${data.totalResults} results`;
                this.switchTab('search-results');
            } else {
                alert('Search failed: ' + data.error);
            }
        } catch (error) {
            alert('Search error: ' + error.message);
        }
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
        const name = this.playlistName.value.trim();
        if (!name) {
            alert('Please enter a playlist name');
            return;
        }
        
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
                alert('Playlist created successfully!');
            } else {
                const data = await response.json();
                alert('Failed to create playlist: ' + data.error);
            }
        } catch (error) {
            alert('Error creating playlist: ' + error.message);
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
                alert('Added to favorites!');
            } else {
                const data = await response.json();
                if (data.error === 'Already in favorites') {
                    alert('Already in favorites');
                } else {
                    alert('Failed to add to favorites: ' + data.error);
                }
            }
        } catch (error) {
            alert('Error adding to favorites: ' + error.message);
        }
    }
    
    async removeFavorite(id) {
        try {
            const response = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
            
            if (response.ok) {
                this.loadFavorites();
            } else {
                alert('Failed to remove from favorites');
            }
        } catch (error) {
            alert('Error removing from favorites: ' + error.message);
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
            alert(`Dropped ${videoFiles.length} video file(s). Note: File upload is not implemented in this demo.`);
        }
    }
    
    showLoading() {
        this.fileList.innerHTML = '<div class="loading">Loading files...</div>';
    }
    
    showError(message) {
        this.fileList.innerHTML = `<div class="error">${message}</div>`;
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AdvancedVideoPlayerBrowser();
});