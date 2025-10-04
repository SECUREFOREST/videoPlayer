# Server Modules

This directory contains the modularized components of the video player server.

## Module Structure

### `config.js`
- Application configuration constants
- File paths and supported extensions
- Centralized configuration management

### `ffmpeg.js`
- FFmpeg and FFprobe path resolution
- FFmpeg installation validation
- Video processing utilities

### `fileUtils.js`
- File system operations
- Path resolution and security
- File type checking and MIME types
- Directory operations

### `auth.js`
- Authentication middleware
- Login page HTML generation
- Session management

### `videoProcessing.js`
- Video duration caching
- HLS file processing
- Thumbnail generation
- Video metadata extraction

### `routes.js`
- API route handlers
- File browsing endpoints
- Search functionality
- Playlist and favorites management

### `server.js`
- Main server setup
- Middleware configuration
- Static file serving
- Server initialization

## Usage

The main `server.js` file in the root directory now simply imports and starts the modularized server:

```javascript
const { startServer } = require('./modules/server');
startServer();
```

## Benefits

1. **Maintainability**: Each module has a single responsibility
2. **Testability**: Individual modules can be tested in isolation
3. **Reusability**: Modules can be imported and used elsewhere
4. **Organization**: Related functionality is grouped together
5. **Scalability**: Easy to add new features or modify existing ones

## Dependencies

Each module properly declares its dependencies and exports only what's needed, following Node.js best practices for modular architecture.
