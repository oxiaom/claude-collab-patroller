// ecosystem.config.js — PM2 configuration for v0.7 daemon
//
// 用户 8/24 01:25 SGT 拍板 B (Phase 1 only):
//   - 持久化 + 可靠性, 2-3 周
//   - 5 critical 项: 580s cap / Wake IPC / SPoF / 测试 / CI
//   - Phase 1.2: Node.js daemon + PM2 守护 (本文件)
//
// 用法:
//   npm install -g pm2
//   pm2 start ecosystem.config.js
//   pm2 status
//   pm2 logs claude-collab-patroller-daemon
//   pm2 save  (开机自启)
//   pm2 startup

module.exports = {
  apps: [{
    name: 'claude-collab-patroller-daemon',
    script: './src/daemon.js',
    node_args: ['--max-old-space-size=512'],
    instances: 1,
    exec_mode: 'fork', // 单实例 (有 instance-lock, 不需要 cluster)
    autorestart: true, // crash 自动 restart
    restart_delay: 5000, // 5s 后 restart
    max_restarts: 10, // 最多 10 次 restart (避免 restart loop)
    min_uptime: '10s', // 至少跑 10s 才算 successful start
    max_memory_restart: '300M', // 超 300M 自动 restart
    env: {
      NODE_ENV: 'production',
      CCP_POLL_INTERVAL: '10000',
      CCP_WAKE_METHOD: 'claude-print',
      CCP_HEALTH_PORT: '7777',
      CCP_LOG_LEVEL: 'info',
      CCP_LOG_FORMAT: 'json',
    },
    // Logging
    out_file: '~/.claude/patrol/logs/pm2-out.log',
    error_file: '~/.claude/patrol/logs/pm2-err.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Health monitoring
    listen_timeout: 8000,
    kill_timeout: 5000,
    wait_ready: true,
  }],
}