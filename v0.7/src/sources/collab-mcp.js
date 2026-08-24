// sources/collab-mcp.js — collab-mcp source adapter (v0.3.0 Node.js port)
//
// 移植自原 bash msg-watcher-collab.sh 的 collab-mcp 协议逻辑.
// 通过 mcp-collab-claude.sh (claude 物理隔离, Lesson #110) 调用:
//   - poll:  list-pending --type messages
//   - ack:   ack --id <msg_id>
// 过滤: to_user=claude && !acked && from_user!=claude (排除自发自收)

const { execFile } = require('child_process')
const util = require('util')
const execp = util.promisify(execFile)
const Source = require('./base')

class CollabMCPSource extends Source {
  /**
   * @param {Object} config
   * @param {string} config.scriptPath mcp-collab-claude.sh 路径 (Windows: D:/myopenclaw/scripts/mcp-collab-claude.sh; POSIX: /d/myopenclaw/...)
   * @param {string} [config.apiKeyFile] claude-api-key 路径 (Lesson #110 物理隔离)
   * @param {number} [config.pollTimeoutMs] 每次调 list-pending 的超时 (默认 30s)
   */
  constructor(config) {
    super({ name: 'collab-mcp', type: 'collab-mcp', ...config })
    // Node.js 在 Windows 上 forward slash 路径 OK, POSIX path (/d/...) 不 OK
    // 默认 Windows native, 其他平台 POSIX
    this.scriptPath = config.scriptPath
      || process.env.CLAUDE_COLLAB
      || (process.platform === 'win32'
          ? 'D:/myopenclaw/scripts/mcp-collab-claude.sh'
          : '/d/myopenclaw/scripts/mcp-collab-claude.sh')
    this.apiKeyFile = config.apiKeyFile
    this.pollTimeoutMs = config.pollTimeoutMs || 30000
    // execFile 在 Windows 需要 bash 包装 bash 脚本
    this.bashPath = config.bashPath
      || (process.platform === 'win32'
          ? 'C:/Program Files (x86)/Git/bin/bash.exe'
          : '/bin/bash')
  }

  async init() {
    // Fails loud (telegrammer fails-loud #1): 脚本存在
    const fs = require('fs')
    const scriptPath = isWindows() ? this.scriptPath.replace(/\\/g, '/') : this.scriptPath
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`mcp-collab-claude.sh not found at ${scriptPath}`)
    }
    if (!fs.existsSync(this.bashPath)) {
      throw new Error(`bash not found at ${this.bashPath}`)
    }
    if (this.apiKeyFile && !fs.existsSync(this.apiKeyFile)) {
      throw new Error(`claude-api-key not found at ${this.apiKeyFile}`)
    }
    // Fails loud (telegrammer fails-loud #2): API 可达
    try {
      const cmd = `"${scriptPath}" list-pending --type messages`
      await execp(this.bashPath, ['-c', cmd], {
        timeout: this.pollTimeoutMs,
        windowsHide: isWindows(),
      })
    } catch (e) {
      throw new Error(`collab-mcp API not reachable at startup: ${e.message}`)
    }
  }

  async poll() {
    let stdout
    try {
      // 用 bash -c wrapper (脚本是 bash, 不是 native exe)
      // Phase 3: 跨平台 — Windows 跟 Linux/macOS 都用同样模式
      const scriptPath = isWindows() ? this.scriptPath.replace(/\\/g, '/') : this.scriptPath
      const cmd = `"${scriptPath}" list-pending --type messages`
      const result = await execp(this.bashPath, ['-c', cmd], {
        timeout: this.pollTimeoutMs,
        windowsHide: isWindows(),
      })
      stdout = result.stdout
    } catch (e) {
      console.error(`[${this.name}] poll error: ${e.message}`)
      return []
    }

    let data
    try {
      data = JSON.parse(stdout)
    } catch (e) {
      console.error(`[${this.name}] JSON parse error: ${e.message}`)
      return []
    }

    const msgs = data?.result?.messages || []
    return msgs
      .filter(m =>
        // Accept both direct messages to claude + broadcast messages to all
        // (to_user === 'all' = broadcast, claude IS part of 'all' so include)
        (m.to_user === 'claude' || m.to_user === 'all')
        && !m.acked
        && m.from_user !== 'claude'
      )
      .map(m => ({
        id: m.id,
        from: m.from_user,
        content: m.content,
        timestamp: m.created_at,
        source: this.name,
        raw: m,
      }))
  }

  async ack(msg) {
    try {
      const scriptPath = isWindows() ? this.scriptPath.replace(/\\/g, '/') : this.scriptPath
      const cmd = `"${scriptPath}" ack --id ${msg.id}`
      await execp(this.bashPath, ['-c', cmd], {
        timeout: 10000,
        windowsHide: isWindows(),
      })
    } catch (e) {
      console.error(`[${this.name}] ack #${msg.id} error: ${e.message}`)
    }
  }
}

module.exports = CollabMCPSource
