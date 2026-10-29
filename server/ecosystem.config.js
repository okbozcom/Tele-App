module.exports = {
  apps: [
    {
      name: 'tele-app',
      script: './dist/server.js',
      instances: 1, // 1 stable instance prevents scheduler lock races and VPS RAM exhaustion
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '600M',
      restart_delay: 4000,
      min_uptime: '10s',
      max_restarts: 15,
      exp_backoff_restart_delay: 100,
      wait_ready: true,
      listen_timeout: 15000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5001,
      },
    },
  ],
};
