// wake.js — wake mechanism for claude-collab-patroller v0.3.0
//
// 多通道 wake:
//   1. 'claude-print': Start-Process claude --print <prompt> (spawn 新 claude 实例, auto-process)
//   2. 'send-message': 通过 Claude Code IPC 唤醒主 session (Background Agent + SendMessage, 待实现)
//   3. 'telegram-reply': 直接回复到 telegram (用户已在该 chat 上下文, 无需唤醒)
//   4. 'webhook': 推送到自定义 webhook URL
//
// 设计参考:
//   - Auto-work-and-reply Lesson (8/23 17:42 SGT): ack 不算回复, 必须做工作 + reply
//   - Watcher wake injection bug (claude-collab-patroller-v0-2-review): plugin 必须有唤醒机制

const { spawn } = require('child_process')

class Wake {
  /**
   * @param {Object} config
   * @param {string} [config.method='claude-print'] wake 通道
   * @param {string} [config.claudePath='claude'] claude CLI 路径 (PATH 上即可)
   */
  constructor(config = {}) {
    this.method = config.method || process.env.CCP_WAKE_METHOD || 'claude-print'
    this.claudePath = config.claudePath || 'claude'
  }

  /**
   * 唤醒 claude 处理消息
   * @param {Message} msg
   * @returns {Promise<{method: string, pid?: number, ok: boolean}>}
   */
  async wake(msg) {
    const prompt = this._buildPrompt(msg)

    switch (this.method) {
      case 'claude-print':
        return this._claudePrint(prompt)
      case 'send-message':
        // Future: 通过 Claude Code IPC 调 SendMessage to main
        // 需要 watcher 本身是 Background Agent (per SessionStart hook)
        return { method: 'send-message', ok: false, error: 'not yet implemented' }
      case 'webhook':
        return this._webhook(prompt, msg)
      default:
        return { method: this.method, ok: false, error: `unknown method: ${this.method}` }
    }
  }

  _buildPrompt(msg) {
    return [
      `🔔 [PATROL-WAKE · ${msg.source}]`,
      `新消息 #${msg.id} from ${msg.from} (${msg.timestamp || 'unknown time'})`,
      '',
      '按 Auto-work-and-reply 铁律处理:',
      '  1. Read 完整内容 (跑 read --from 或 --id 拿全 msg)',
      '  2. Work (commit / review / verify / fix)',
      '  3. Reply 给发件人 (send --to <from>)',
      '  4. Memory Lesson 锁版 (重要事件)',
      '  5. 处理完 exit (你是一次性 handler, 不是 main session)',
      '',
      `msg content 摘要:`,
      msg.content ? msg.content.slice(0, 500) : '(empty)',
      '',
      `msg 已被 watcher auto-ack 标已读 (如果 source 支持), 你不需要再 ack, 直接处理内容即可.`,
    ].join('\n')
  }

  _claudePrint(prompt) {
    return new Promise((resolve) => {
      try {
        // Windows 上 `claude` 是 bash/cmd wrapper (不是 .exe), 必须 shell: true
        // shell: true 让 Node.js 通过 cmd.exe 解析 PATH + .cmd/.bat 关联
        const proc = spawn(this.claudePath, ['--print', prompt], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          shell: true, // 关键: Windows 上 claude 是 wrapper 不是 exe
        })
        proc.unref()
        proc.on('error', (err) => {
          console.error(`[wake] claude --print spawn error: ${err.message}`)
          resolve({ method: 'claude-print', ok: false, error: err.message })
        })
        proc.on('spawn', () => {
          console.log(`[wake] claude --print spawned PID ${proc.pid}`)
          resolve({ method: 'claude-print', ok: true, pid: proc.pid })
        })
      } catch (e) {
        resolve({ method: 'claude-print', ok: false, error: e.message })
      }
    })
  }

  async _webhook(prompt, msg) {
    const url = process.env.CCP_WEBHOOK_URL
    if (!url) {
      return { method: 'webhook', ok: false, error: 'CCP_WEBHOOK_URL not set' }
    }
    try {
      const fetch = (await import('node-fetch')).default
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, msg }),
        timeout: 10000,
      })
      return { method: 'webhook', ok: res.ok, status: res.status }
    } catch (e) {
      return { method: 'webhook', ok: false, error: e.message }
    }
  }
}

module.exports = Wake
