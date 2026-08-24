// sources/collab-mcp.js — collab-mcp source adapter (v0.3.0 Node.js port, v0.7.2 refactored)
//
// 移植自原 bash msg-watcher-collab.sh 的 collab-mcp 协议逻辑.
// 通过 mcp-collab-claude.sh (claude 物理隔离, Lesson #110) 调用:
//   - poll:  list-pending --type messages
//   - ack:   ack --id <msg_id>
//
// 过滤: to_user=claude || to_user=all || allowToUsers.includes(to_user)
//        && !acked && from_user!=claude
//
// v0.7.2 Phase 3.1 重构: 拆 _fetch (exec bash) + _parse (JSON+filter) 让 unit test 可测

const { execFile } = require('child_process')
const util = require('util')
const execp = util.promisify(execFile)
const Source = require('./base')
const { isWindows, getBashPath, getCollabPath } = require('../os-detect')

class CollabMCPSource extends Source {
  /**
   * @param {Object} config
   * @param {string} config.scriptPath mcp-collab-claude.sh 路径
   * @param {string} [config.apiKeyFile] claude-api-key 路径 (Lesson #110 物理隔离)
   * @param {number} [config.pollTimeoutMs] 每次调 list-pending 的超时 (默认 30s)
   * @param {string[]} [config.allowToUsers=['xiaomu','kimi']] 允许的 to_user 白名单 (Phase 3.2)
   */
  constructor(config) {
    super({ name: 'collab-mcp', type: 'collab-mcp', ...config })
    // Node.js 在 Windows 上 forward slash 路径 OK, POSIX path (/d/...) 不 OK
    this.scriptPath = config.scriptPath
      || process.env.CLAUDE_COLLAB
      || getCollabPath()
    this.apiKeyFile = config.apiKeyFile
    this.pollTimeoutMs = config.pollTimeoutMs || 30000
    // execFile 在 Windows 需要 bash 包装 bash 脚本
    this.bashPath = config.bashPath
      || getBashPath()
    // Phase 3.2: 白名单 allowToUsers (baobei→xiaomu cc 通道)
    this.allowToUsers = config.allowToUsers
      || (process.env.CCP_ALLOW_TO_USERS
          ? process.env.CCP_ALLOW_TO_USERS.split(',').map(s => s.trim()).filter(Boolean)
          : ['xiaomu', 'kimi'])
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
    // Fails loud (telegrammer fails-loud #2): API 可达 (用 _fetch verify)
    try {
      await this._fetch(['list-pending', '--type', 'messages'])
    } catch (e) {
      throw new Error(`collab-mcp API not reachable at startup: ${e.message}`)
    }
  }

  /**
   * _fetch — 实际 exec mcp-collab-claude.sh 拿 stdout
   * @private
   * @param {string[]} args - e.g. ['list-pending', '--type', 'messages']
   * @returns {Promise<string>} stdout
   */
  async _fetch(args) {
    const scriptPath = isWindows() ? this.scriptPath.replace(/\\/g, '/') : this.scriptPath
    const cmd = `"${scriptPath}" ${args.join(' ')}`
    const result = await execp(this.bashPath, ['-c', cmd], {
      timeout: this.pollTimeoutMs,
      windowsHide: isWindows(),
    })
    return result.stdout
  }

  /**
   * _parse — 解析 JSON stdout + 应用 filter (测试可单独 mock stdout)
   * @private
   * @param {string} stdout - JSON 字符串 from _fetch
   * @returns {Array<{id, from, content, timestamp, source, raw}>}
   */
  _parse(stdout) {
    let data
    try {
      data = JSON.parse(stdout)
    } catch (e) {
      console.error(`[${this.name}] JSON parse error: ${e.message}`)
      return []
    }
    const msgs = data?.result?.messages || []
    return msgs
      .filter(m => {
        // Phase 3.2: 白名单 allowlist (baobei→xiaomu cc 通道)
        const toUser = m.to_user
        const isAllowed = toUser === 'claude' || toUser === 'all' || this.allowToUsers.includes(toUser)
        return isAllowed && !m.acked && m.from_user !== 'claude'
      })
      .map(m => ({
        id: m.id,
        from: m.from_user,
        content: m.content,
        timestamp: m.created_at,
        source: this.name,
        raw: m,
      }))
  }

  /**
   * poll — 调 _fetch 拿 stdout, 调 _parse 拿 msgs
   * @returns {Promise<Array>}
   */
  async poll() {
    let stdout
    try {
      stdout = await this._fetch(['list-pending', '--type', 'messages'])
    } catch (e) {
      console.error(`[${this.name}] poll error: ${e.message}`)
      return []
    }
    return this._parse(stdout)
  }

  /**
   * ack — 调 _fetch 调 mcp-collab-claude.sh ack --id
   * @param {Object} msg
   */
  async ack(msg) {
    try {
      await this._fetch(['ack', '--id', String(msg.id)])
    } catch (e) {
      console.error(`[${this.name}] ack #${msg.id} error: ${e.message}`)
    }
  }
}

module.exports = CollabMCPSource
