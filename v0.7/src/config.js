// config.js — daemon configuration
// 优先级: env > config file > defaults

const path = require('path')
const os = require('os')

const config = {
  // Watcher polling
  pollIntervalMs: parseInt(process.env.CCP_POLL_INTERVAL || '10000', 10), // 10s default

  // Multi-source configuration
  sources: [
    {
      type: 'collab-mcp',
      name: 'collab-mcp',
      scriptPath: process.env.CLAUDE_COLLAB
        || (process.platform === 'win32'
            ? 'D:/myopenclaw/scripts/mcp-collab-claude.sh'
            : '/d/myopenclaw/scripts/mcp-collab-claude.sh'),
      apiKeyFile: process.env.CLAUDE_API_KEY_FILE,
      pollTimeoutMs: 30000,
      // Phase 3.2: 白名单 (baobei→xiaomu cc 通道)
      // CCP_ALLOW_TO_USERS env var 覆盖, comma-separated
      allowToUsers: process.env.CCP_ALLOW_TO_USERS
        ? process.env.CCP_ALLOW_TO_USERS.split(',').map(s => s.trim()).filter(Boolean)
        : ['xiaomu', 'kimi'],
      enabled: true,
    },
    // Future: telegram source
    // {
    //   type: 'telegram',
    //   name: 'telegram-main',
    //   token: process.env.TELEGRAM_BOT_TOKEN,
    //   chatId: process.env.TELEGRAM_CHAT_ID,
    //   enabled: false,  // disabled by default, opt-in
    // },
  ].filter(s => s.enabled !== false),

  // Wake (multi-channel dispatcher)
  wake: {
    method: process.env.CCP_WAKE_METHOD || 'claude-print', // claude-print / file-marker / send-message / webhook
    claudePath: process.env.CCP_CLAUDE_PATH || 'claude',
    fileMarkerDir: process.env.CCP_WAKE_MARKER_DIR
      || path.join(process.env.USERPROFILE || os.homedir(), '.claude', 'patrol', 'wake-markers'),
  },

  // Health HTTP endpoint (for monitoring)
  health: {
    enabled: process.env.CCP_HEALTH_ENABLED !== 'false', // default enabled
    host: process.env.CCP_HEALTH_HOST || '127.0.0.1',
    port: parseInt(process.env.CCP_HEALTH_PORT || '7777', 10),
  },

  // Logging
  logging: {
    level: process.env.CCP_LOG_LEVEL || 'info',
    jsonFormat: process.env.CCP_LOG_FORMAT !== 'text', // default JSON
    destination: process.env.CCP_LOG_DEST || 'file', // file / stdout / both
    filePath: process.env.CCP_LOG_FILE
      || path.join(process.env.USERPROFILE || os.homedir(), '.claude', 'patrol', 'logs', 'daemon.log'),
  },

  // Process management
  process: {
    pidFile: process.env.CCP_PID_FILE
      || path.join(process.env.USERPROFILE || os.homedir(), '.claude', 'patrol', 'daemon.pid'),
  },
}

module.exports = config