module.exports = {
  apps: [
    {
      name: 'video-player',
      script: 'server.js',
      cwd: '/app/videoPlayer',
      instances: '1', // Use all CPU cores
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 4000
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4000
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
      ignore_watch: [
        'node_modules',
        'logs',
        'thumbnails',
        'videos',
        '.git',
        '*.log'
      ],
      node_args: '--max-old-space-size=2048',
      source_map_support: true,
      instance_var: 'INSTANCE_ID',
      increment_var: 'PORT',
      pmx: true,
      vizion: false,
      post_update: ['npm install', 'echo "Video Player updated"'],
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
