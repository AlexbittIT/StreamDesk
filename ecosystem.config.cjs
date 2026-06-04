// PM2 конфигурация для StreamDesk (CommonJS — .cjs из-за "type": "module" в package.json)
module.exports = {
  apps: [{
    name: 'streamdesk',
    cwd: __dirname,
    script: 'dist/index.js',
    interpreter: 'node',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      HOST: '0.0.0.0'
    },
    error_file: '/var/log/pm2/streamdesk-error.log',
    out_file: '/var/log/pm2/streamdesk-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
};
