module.exports = {
  apps: [
    {
      name: 'video-player',
      script: 'server.js',
      cwd: '/app/videoPlayer',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G', // Reduced for better memory management
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        UV_THREADPOOL_SIZE: 16, // Increase thread pool for I/O operations
        NODE_OPTIONS: '--max-old-space-size=1024 --max-semi-space-size=64'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 4000,
        instances: 2, // Fewer instances in development
        UV_THREADPOOL_SIZE: 8
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4000,
        instances: 4, // Half of production instances
        UV_THREADPOOL_SIZE: 12
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,
      wait_ready: true,
      // Performance optimizations
      increment_var: 'PORT',
      instance_var: 'INSTANCE_ID',
      pmx: true,
      vizion: false,
      // Graceful shutdown
      kill_retry_time: 100,
      // Memory and CPU monitoring
      monitoring: false, // Disable PM2 monitoring for better performance
      // Process management
      min_uptime: '10s',
      max_restarts: 5,
      // File watching exclusions
      ignore_watch: [
        'node_modules',
        'logs',
        'thumbnails',
        'videos',
        'hls',
        '.git',
        '*.log',
        '*.json',
        '*.tmp'
      ],
      // Node.js optimizations
      node_args: [
        '--max-old-space-size=1024',
        '--max-semi-space-size=64',
        '--optimize-for-size',
        '--gc-interval=100',
        '--expose-gc'
      ],
      // Deployment hooks
      post_update: ['npm install --production', 'echo "Video Player updated"'],
      pre_setup: 'echo "Setting up Video Player environment"',
      post_setup: 'echo "Video Player environment setup complete"'
    }
  ],

  deploy: {
    production: {
      user: 'gtoptuno',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/videoPlayer.git',
      path: '/Users/gtoptuno/Code/videoPlayer',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    },
    development: {
      user: 'gtoptuno',
      host: 'localhost',
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/videoPlayer.git',
      path: '/Users/gtoptuno/Code/videoPlayer',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env development',
      'pre-setup': ''
    }
  }
};
