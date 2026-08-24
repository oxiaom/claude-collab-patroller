// sources/base.js — abstract Source class for claude-collab-patroller v0.3.0
//
// 所有 chat source 适配器继承此类, 实现 poll/ack/shutdown 接口.
// 多源架构: collab-mcp / telegram / slack / discord / 微信 等都可注册.

class Source {
  /**
   * @param {Object} config source 配置
   * @param {string} config.name source 名 (e.g. "collab-mcp", "telegram-main")
   * @param {string} [config.type] source 类型 (用于 registry)
   */
  constructor(config) {
    if (!config.name) throw new Error('source name required')
    this.name = config.name
    this.type = config.type || 'unknown'
    this.config = config
  }

  /**
   * 初始化 source (认证 / 连接 / webhook 注册)
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error(`${this.name}: init() not implemented`)
  }

  /**
   * 轮询新消息
   * @returns {Promise<Message[]>} 新消息数组 (未读 / 未 ack)
   *   Message shape: { id, from, content, timestamp, raw, source }
   */
  async poll() {
    throw new Error(`${this.name}: poll() not implemented`)
  }

  /**
   * 标记消息已读 (可选 — 有些 source 不支持 ack, e.g. telegram)
   * @param {Message} msg
   * @returns {Promise<void>}
   */
  async ack(_msg) {
    // 默认 noop
  }

  /**
   * 清理 (关闭连接 / 取消 webhook)
   * @returns {Promise<void>}
   */
  async shutdown() {
    // 默认 noop
  }
}

module.exports = Source
