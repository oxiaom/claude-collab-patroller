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
const { writeFileSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')

class Wake {
  /**
   * @param {Object} config
   * @param {string} [config.method='claude-print'] wake 通道
   * @param {string} [config.claudePath='claude'] claude CLI 路径 (PATH 上即可)
   * @param {string} [config.fileMarkerDir] file-marker 写入目录
   */
  constructor(config = {}) {
    this.method = config.method || process.env.CCP_WAKE_METHOD || 'claude-print'
    this.claudePath = config.claudePath || 'claude'
    this.fileMarkerDir = config.fileMarkerDir || process.env.CCP_WAKE_MARKER_DIR
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
      case 'file-marker':
        return this._fileMarker(msg)
      case 'send-message':
        return this._sendMessage(prompt, msg)
      case 'webhook':
        return this._webhook(prompt, msg)
      default:
        return { method: this.method, ok: false, error: `unknown method: ${this.method}` }
    }
  }

  /**
   * send-message: wake main session via Claude Code IPC
   *
   * 实现机制 (Phase 1.3):
   *   1. 写 wake marker 文件 (跟 file-marker 一样, 但带 session-id)
   *   2. spawn `claude --resume <main_session_id> --print <prompt>` 试图注入到 main session
   *   3. (fallback) 如果 --resume spawn 新 session 不 inject, 改用 file-marker + main session 自己轮询
   *
   * 限制 (老实承认):
   *   - claude-code 当前没暴露从外部进程 inject 到 running session 的 API
   *   - --resume 实测是 spawn 新 session (同 sessionId), 不是 inject 到现有 59872 daemon
   *   - 真正 wake main session 需要 Background Agent sub-agent + SendMessage tool
   *   - 外部 daemon 无法 spawn  sub-agent (claude --bg 不暴露 SendMessage)
   *
   * 推荐方案:
   *   - 用 `method: file-marker` + main session 启动时跑 Background Agent (如 a119676497106ea3f) 读 marker + SendMessage
   *   - send-message method 仅作为 Phase 1.3 实验, 记录限制
   */
  async _sendMessage(prompt, msg) {
    // 先写 marker (跟 file-marker 一样)
    const markerResult = await this._fileMarker(msg)
    if (!markerResult.ok) {
      return { method: 'send-message', ok: false, error: 'file-marker failed: ' + markerResult.error }
    }

    // 试图 spawn claude --resume 注入到 main session
    // 实际: --resume spawn 新 session (用同 sessionId), 不 inject 到现有 daemon
    // 所以 send-message 实际等同于 file-marker + claude --print spawn
    const mainSessionId = this.mainSessionId || process.env.CCP_MAIN_SESSION_ID
    if (!mainSessionId) {
      return {
        method: 'send-message',
        ok: false,
        error: 'mainSessionId not set (CCP_MAIN_SESSION_ID env var); falling back to file-marker only',
        markerPath: markerResult.path,
      }
    }

    // 尝试 spawn claude --resume (实验性 — 已知限制)
    return new Promise((resolve) => {
      try {
        const injectPrompt = `[AUTO-WAKE · plugin v0.7] ${prompt}`
        const proc = spawn('claude', [
          '--resume', mainSessionId,
          '--print', injectPrompt,
        ], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          shell: true,
        })
        proc.unref()
        proc.on('error', (err) => {
          resolve({
            method: 'send-message',
            ok: false,
            error: 'claude --resume spawn failed: ' + err.message,
            markerPath: markerResult.path,
          })
        })
        proc.on('spawn', () => {
          resolve({
            method: 'send-message',
            ok: true,
            pid: proc.pid,
            markerPath: markerResult.path,
            note: 'marker written + claude --resume spawned (experimental — may spawn new session not inject)',
          })
        })
      } catch (e) {
        resolve({ method: 'send-message', ok: false, error: e.message })
      }
    })
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

  async _fileMarker(msg) {
    if (!this.fileMarkerDir) {
      return { method: 'file-marker', ok: false, error: 'fileMarkerDir not set' }
    }
    try {
      if (!existsSync(this.fileMarkerDir)) {
        mkdirSync(this.fileMarkerDir, { recursive: true })
      }
      const filename = `wake-${msg.id}-${msg.from || 'unknown'}-${Date.now()}.json`
      const path = join(this.fileMarkerDir, filename)
      const data = {
        msg_id: msg.id,
        from_user: msg.from,
        action: 'WAKE',
        timestamp: new Date().toISOString(),
        content_preview: (msg.content || '').slice(0, 500),
      }
      writeFileSync(path, JSON.stringify(data, null, 2))
      return { method: 'file-marker', ok: true, path }
    } catch (e) {
      return { method: 'file-marker', ok: false, error: e.message }
    }
  }
}

module.exports = Wake
