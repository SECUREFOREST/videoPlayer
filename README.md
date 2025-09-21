# 🎬 Tie them up! - Advanced Video Player

A high-performance Node.js video streaming application with professional-grade features including authentication, playlists, favorites, search, and optimized video delivery. Built with modern web technologies and designed to handle large video collections efficiently.

## ✨ Features

### 🔐 Security & Authentication
- **Password Protection**: Secure access with session-based authentication
- **Session Management**: Persistent login sessions
- **API Security**: Protected endpoints with authentication middleware

### 🎥 Video Support
- **Multiple Formats**: MP4, AVI, MOV, MKV, WebM, M4V, FLV, WMV, 3GP, OGV
- **Range Request Support**: Efficient video streaming with partial content delivery
- **Large File Handling**: Optimized for videos up to 1.6GB+
- **Thumbnail Generation**: Automatic video thumbnails using FFmpeg
- **Progress Tracking**: Resume videos from where you left off
- **Fullscreen Mode**: Immersive viewing experience

### 🔍 Search & Navigation
- **Real-time Search**: Search across all files and directories
- **Advanced Filtering**: Filter by file type (All Files, Videos Only, Directories Only)
- **Multiple Sorting**: Sort by name, duration, or modification date
- **Breadcrumb Navigation**: Easy directory navigation with clickable paths
- **Grid View**: Optimized grid layout for video browsing

### 📋 Playlist Management
- **Create Playlists**: Organize your favorite videos with custom names
- **Drag & Drop**: Reorder playlist items with drag and drop
- **Modal Interface**: Easy playlist management with modern UI
- **Persistent Storage**: Playlists saved between sessions

### ❤️ Favorites System
- **Quick Access**: Mark videos as favorites with heart button
- **Dedicated Tab**: Easy access to all favorite videos
- **Visual Feedback**: Clear indication of favorite status
- **Persistent Storage**: Favorites saved between sessions

### 🎨 Modern UI/UX
- **Bootstrap 5**: Modern, responsive design
- **Dark Theme**: Eye-friendly dark interface
- **Smooth Animations**: Polished user experience
- **Mobile Responsive**: Works on all device sizes
- **Custom Styling**: Professional video player appearance

### ⚡ Performance Optimizations
- **Async File Operations**: Non-blocking file system operations using fs.promises
- **PM2 Clustering**: Multi-process server architecture for production
- **Nginx Integration**: Reverse proxy with upstream configuration
- **Caching Headers**: Optimized browser caching for static assets
- **Gzip Compression**: Reduced bandwidth usage
- **Range Request Support**: Efficient video streaming with 206 Partial Content
- **Memory Efficient**: Handles 600+ videos with minimal memory usage (~45MB RSS)

## 🚀 Installation

### Prerequisites
- **Node.js** (v14 or higher)
- **FFmpeg** (for video processing and thumbnails)
- **PM2** (optional, for production deployment)
- **Nginx** (optional, for reverse proxy)

### Quick Start

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd videoPlayer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install FFmpeg**:
   - **macOS**: `brew install ffmpeg`
   - **Ubuntu/Debian**: `sudo apt install ffmpeg`
   - **Windows**: Download from [FFmpeg website](https://ffmpeg.org/download.html)

4. **Configure the application** (optional):
   - Edit `config.js` to customize the application
   - Change the app name, password, port, and other settings
   - Default password: `bringbeerforpassword`

5. **Start the application**:
   ```bash
   # Development mode
   npm start
   
   # Production mode with PM2 (optional)
   pm2 start ecosystem.config.js
   
   # With Nginx (optional)
   sudo systemctl start nginx
   ```

6. **Access the application**:
   - Open your browser and go to `http://localhost:4000`
   - Enter the password when prompted

## 📁 Project Structure

```
videoPlayer/
├── server.js                    # Main server file with authentication
├── config.js                    # Application configuration
├── package.json                 # Dependencies and scripts
├── ecosystem.config.js          # PM2 configuration
├── nginx.conf                   # Nginx reverse proxy configuration
├── test-performance.js          # Performance testing script
├── public/                      # Client-side files
│   ├── index.html              # Main HTML file with Bootstrap 5
│   ├── style-bootstrap.css     # Custom styling (v9)
│   ├── script-bootstrap.js     # JavaScript functionality (v113)
│   └── favicon.svg             # Application icon
├── thumbnails/                  # Generated video thumbnails
├── videos/                      # Video files directory (602+ videos)
├── logs/                        # PM2 and application logs
├── playlists.json              # Playlist data (auto-created)
└── favorites.json              # Favorites data (auto-created)
```

## 🎯 Usage

### Getting Started
1. **Login**: Enter the password to access the application
2. **Browse Videos**: Navigate through the video collection using the file browser
3. **Play Videos**: Click on any video to open the full-screen player
4. **Search**: Use the search bar to find specific videos or files

### Navigation Features
1. **Breadcrumb Navigation**: Click on folder names to navigate back
2. **Filtering**: Use the Filter dropdown to show All Files, Videos Only, or Directories Only
3. **Sorting**: Sort by Name, Duration, or Date using the Sort dropdown
4. **Search Results**: Access search results from the dedicated Search Results tab

### Playlist Management
1. **Create Playlist**: 
   - Click "Create Playlist" button
   - Enter a playlist name
   - Add videos by clicking the "+" button while playing

2. **Manage Playlists**:
   - View all playlists in the Playlists tab
   - Drag and drop to reorder playlist items
   - Delete playlists or individual items

### Favorites System
1. **Add to Favorites**:
   - Click the heart icon while playing a video
   - Access favorites from the Favorites tab

2. **Manage Favorites**:
   - View all favorite videos in one place
   - Remove favorites by clicking the heart icon again

### Video Player Controls
1. **Playback Controls**: Play, pause, seek, volume control
2. **Fullscreen**: Click the fullscreen button or press F
3. **Video Info**: View video details in the player footer

## 🔧 Configuration

### Application Settings
Edit `config.js` to customize your video player:

```javascript
module.exports = {
    // Application Identity
    name: 'Your Video Player',           // App name shown in UI
    description: 'Your Description',     // Meta description
    
    // Security Settings
    password: 'your-password',          // Login password
    
    // Server Settings
    port: 4000                          // Server port
};
```

### Supported Video Formats
The application supports these video formats:
- MP4 (.mp4)
- AVI (.avi)
- MOV (.mov)
- MKV (.mkv)
- WebM (.webm)
- M4V (.m4v)
- FLV (.flv)
- WMV (.wmv)
- 3GP (.3gp)
- OGV (.ogv)

### Thumbnail Generation
Thumbnails are automatically generated using FFmpeg. If FFmpeg is not installed, the app will still work but without thumbnails.

### Data Storage
- **Playlists**: Stored in `playlists.json`
- **Favorites**: Stored in `favorites.json`
- **Progress**: Stored in browser's localStorage
- **Configuration**: Centralized in `config.js`

### Dynamic Configuration
The application supports dynamic configuration loading:
- **App Name**: Automatically updates in UI (title, navbar, modal)
- **Description**: Updates meta description for SEO
- **Password**: Configurable authentication
- **Port**: Flexible server port configuration

## 🛠️ API Endpoints

### Authentication
- `GET /login` - Login page
- `POST /api/login` - Authenticate user (redirects)
- `POST /api/auth/login` - Authenticate user (JSON response)
- `POST /api/logout` - Logout user

### File Browsing
- `GET /api/browse` - Get directory contents with filtering and sorting
- `GET /api/search` - Search files recursively
- `GET /api/server-status` - Get server status and statistics

### Video Streaming
- `GET /videos/*` - Stream video files with range request support
- `GET /api/thumbnail` - Generate video thumbnail

### Playlists
- `GET /api/playlists` - Get all playlists
- `POST /api/playlists` - Create new playlist
- `PUT /api/playlists/:id` - Update playlist
- `DELETE /api/playlists/:id` - Delete playlist

### Favorites
- `GET /api/favorites` - Get all favorites
- `POST /api/favorites` - Add to favorites
- `DELETE /api/favorites/:id` - Remove from favorites

## 🎨 Customization

### Styling
Modify `public/style-bootstrap.css` to customize the appearance:
- Color scheme
- Layout dimensions
- Animation effects
- Responsive breakpoints

### Features
Add new features by extending the JavaScript classes in `public/script.js`:
- New video controls
- Additional file types
- Custom keyboard shortcuts
- Enhanced search functionality

## 🐛 Troubleshooting

### Common Issues

1. **Authentication issues**:
   - Check if the password in `config.js` is correct
   - Clear browser cookies and try again
   - Ensure session storage is enabled

2. **Thumbnails not generating**:
   - Ensure FFmpeg is installed and accessible
   - Check file permissions for the thumbnails directory
   - Verify video files are not corrupted

3. **Videos not playing**:
   - Verify the video format is supported
   - Check if the video file is corrupted
   - Ensure proper MIME type configuration
   - Check if range requests are working (206 status)

4. **Search not working**:
   - Check if the search path is accessible
   - Verify file permissions
   - Ensure authentication is working

5. **Playlists not saving**:
   - Check write permissions for the project directory
   - Ensure JSON files are not corrupted
   - Verify authentication is working

6. **Performance issues**:
   - Run `node test-performance.js` to diagnose
   - Check memory usage and file system performance
   - Consider using PM2 for production deployment

### Performance Tips

1. **Large Directories**: Use filtering to limit results
2. **Thumbnail Generation**: First-time thumbnail generation may be slow
3. **Memory Usage**: Close unused tabs to free up memory

## 📊 Performance

### Current Performance Metrics
- **File Operations**: ~2-4ms for directory operations
- **Memory Usage**: ~45MB RSS, ~5MB heap
- **API Response Times**: Average 11-12ms
- **Video Collection**: 602+ videos supported
- **Large File Support**: Tested with files up to 1.6GB
- **Range Request Support**: 206 Partial Content responses
- **Authentication**: Session-based with persistent login

### Performance Testing
Run the included performance test:
```bash
node test-performance.js
```

This will test:
- Async file operations
- Memory usage
- API endpoint performance (with authentication)
- Large video file handling
- Range request support
- Video collection analysis (602+ videos)

## 🔮 Future Enhancements

Potential features for future versions:
- Video transcoding pipeline for multiple quality levels
- HLS streaming support for adaptive bitrate
- Subtitle support (.srt, .vtt files)
- Video metadata editing and management
- Advanced analytics and usage statistics
- Cloud storage integration (AWS S3, Google Drive)
- Mobile app version
- Real-time collaboration features
- Video editing capabilities

## 📄 License

MIT License - feel free to use and modify as needed.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

**Enjoy your enhanced video browsing experience! 🎬✨**
