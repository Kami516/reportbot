module.exports = {
    apps: [{
      name: 'chainabuse-bot',
      script: './node_modules/.bin/next',
      args: 'start',
      cwd: '/home/bots/reportbot',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        AUTO_START_MONITOR: 'true'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      // Health monitoring
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true
    }]
  };