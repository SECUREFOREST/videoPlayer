# 🎬 Advanced Video Player Browser

A comprehensive Node.js application for browsing files and watching videos with advanced features like playlists, favorites, search, and more.

## ✨ Features

### 🎥 Video Support
- **Multiple Formats**: MP4, AVI, MOV, MKV, WebM, M4V, FLV, WMV, 3GP, OGV
- **Thumbnail Generation**: Automatic video thumbnails using FFmpeg
- **Progress Tracking**: Resume videos from where you left off
- **Fullscreen Mode**: Immersive viewing experience

### 🔍 Search & Navigation
- **Real-time Search**: Search across all files and directories
- **Advanced Filtering**: Filter by file type, size, date
- **Multiple Sorting**: Sort by name, size, date, or type
- **Grid/List Views**: Toggle between different viewing modes

### 📋 Playlist Management
- **Create Playlists**: Organize your favorite videos
- **Queue Management**: Add videos to playlists
- **Auto-play**: Continuous playback through playlists

### ❤️ Favorites System
- **Quick Access**: Mark videos as favorites
- **Persistent Storage**: Favorites saved between sessions
- **Easy Management**: Add/remove favorites with one click

### ⌨️ Keyboard Shortcuts
- **Space**: Play/Pause
- **F**: Toggle fullscreen
- **M**: Mute/Unmute
- **←/→**: Seek backward/forward (10 seconds)
- **Escape**: Exit fullscreen or close video

### 🎮 Advanced Video Controls
- **Custom Controls**: Enhanced video player interface
- **Speed Control**: Playback speeds from 0.5x to 2x
- **Volume Control**: Fine-tuned audio control
- **Progress Bar**: Click to seek to any position

### 🖱️ Drag & Drop
- **File Upload**: Drag video files to upload (UI ready)
- **Visual Feedback**: Clear drag and drop indicators

## 🚀 Installation

1. **Clone or download** the project
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Install FFmpeg** (for thumbnail generation):
   - **macOS**: `brew install ffmpeg`
   - **Ubuntu/Debian**: `sudo apt install ffmpeg`
   - **Windows**: Download from [FFmpeg website](https://ffmpeg.org/download.html)

4. **Start the server**:
   ```bash
   npm start
   ```
   or for development:
   ```bash
   npm run dev
   ```

5. **Open your browser** and go to `http://localhost:3000`

## 📁 Project Structure

```
videoPlayer/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── public/                # Client-side files
│   ├── index.html         # Main HTML file
│   ├── style.css          # Styling
│   └── script.js          # JavaScript functionality
├── thumbnails/            # Generated video thumbnails
├── videos/                # Video files directory
├── playlists.json         # Playlist data (auto-created)
└── favorites.json         # Favorites data (auto-created)
```

## 🎯 Usage

### Basic Navigation
1. **Browse Files**: Use the file browser to navigate directories
2. **Play Videos**: Click on any video file to start playback
3. **Search**: Use the search bar to find specific files
4. **Filter**: Use the dropdown filters to narrow down results

### Advanced Features
1. **Create Playlists**: 
   - Click "Create Playlist" button
   - Add videos to your playlist
   - Save for later viewing

2. **Add to Favorites**:
   - Click the heart icon while playing a video
   - Access favorites from the Favorites tab

3. **Use Keyboard Shortcuts**:
   - Press Space to play/pause
   - Press F for fullscreen
   - Use arrow keys to seek

4. **Switch Views**:
   - Toggle between grid and list view
   - Grid view shows video thumbnails

## 🔧 Configuration

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

## 🛠️ API Endpoints

### File Browsing
- `GET /api/browse` - Get directory contents with filtering and sorting
- `GET /api/search` - Search files recursively
- `GET /api/video-info` - Get video file information

### Thumbnails
- `GET /api/thumbnail` - Generate video thumbnail

### Playlists
- `GET /api/playlists` - Get all playlists
- `POST /api/playlists` - Create new playlist

### Favorites
- `GET /api/favorites` - Get all favorites
- `POST /api/favorites` - Add to favorites
- `DELETE /api/favorites/:id` - Remove from favorites

## 🎨 Customization

### Styling
Modify `public/style.css` to customize the appearance:
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

1. **Thumbnails not generating**:
   - Ensure FFmpeg is installed and accessible
   - Check file permissions for the thumbnails directory

2. **Videos not playing**:
   - Verify the video format is supported
   - Check if the video file is corrupted
   - Ensure proper MIME type configuration

3. **Search not working**:
   - Check if the search path is accessible
   - Verify file permissions

4. **Playlists not saving**:
   - Check write permissions for the project directory
   - Ensure JSON files are not corrupted

### Performance Tips

1. **Large Directories**: Use filtering to limit results
2. **Thumbnail Generation**: First-time thumbnail generation may be slow
3. **Memory Usage**: Close unused tabs to free up memory

## 🔮 Future Enhancements

Potential features for future versions:
- Video streaming support
- Subtitle support
- Video editing capabilities
- Cloud storage integration
- Mobile app version
- Real-time collaboration
- Video metadata editing
- Advanced analytics

## 📄 License

MIT License - feel free to use and modify as needed.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

**Enjoy your enhanced video browsing experience! 🎬✨**
