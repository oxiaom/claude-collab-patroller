// sources/telegram.js — telegram source adapter (v0.7 stub)
//
// 跟 v0.3.0 同: 示例 stub 实现, 等 TELEGRAM_BOT_TOKEN 实跑
// Phase 1.5 测试可加 mock 实现
//
// 真实部署需要:
//   1. @BotFather 创建 bot, 拿 token
//   2. config.token + config.chatId
//   3. 取消 privacy mode 或用 inline 模式

const Source = require('./base')

class TelegramSource extends Source {
  constructor(config) {
    super({ name: 'telegram', type: 'telegram', ...config })
    this.token = config.token || process.env.TELEGRAM_BOT_TOKEN
    this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID
    this.pollMode = config.pollMode !== false
    this.pollTimeoutMs = config.pollTimeoutMs || 30000
    this.allowedSenders = config.allowedSenders || []
    this.lastUpdateId = 0
  }

  async init() {
    if (!this.token) {
      throw new Error('telegram: token required (env TELEGRAM_BOT_TOKEN or config.token)')
    }
    if (!this.chatId) {
      throw new Error('telegram: chatId required (env TELEGRAM_CHAT_ID or config.chatId)')
    }
    // Stub: 实际部署时调 getMe 验证
    // const res = await fetch(`https://api.telegram.org/bot${this.token}/getMe`)
    // const data = await res.json()
    // if (!data.ok) throw new Error(...)
  }

  async poll() {
    // Stub: 返回空 (等 Phase 1.5 写真实实现)
    // 真实实现: long poll getUpdates
    return []
  }

  async ack(msg) {
    // Telegram 没有 ack 概念, 用 update offset 标记已读
    this.lastUpdateId = Math.max(this.lastUpdateId, msg.raw?.update_id || 0)
  }

  async shutdown() {
    // No persistent connection to close
  }
}

module.exports = TelegramSource