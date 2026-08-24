// dedupe.js — message dedupe (auto-patrol v5 Lesson #428 移植)
//
// 5 分钟内同 childSessionKey 只触发一次 wake, 防止 race condition 重复推送.
// key 格式: `<source>:<from>:<id_or_content_hash>`
// 过期清理: dedupe.cleanup() 在主循环每轮调用, 删除 >windowMs 的条目.

const crypto = require('crypto')

class Dedupe {
  /**
   * @param {number} windowMs 去重窗口 (ms), 默认 5 分钟
   */
  constructor(windowMs = 5 * 60 * 1000) {
    this.windowMs = windowMs
    this.seen = new Map() // key -> timestamp (ms)
  }

  /**
   * 生成 dedupe key
   * @param {Message} msg
   * @returns {string}
   */
  key(msg) {
    const idPart = msg.id ? String(msg.id) : crypto
      .createHash('sha256')
      .update(msg.content || '')
      .digest('hex')
      .slice(0, 16)
    return `${msg.source || 'unknown'}:${msg.from || 'unknown'}:${idPart}`
  }

  /**
   * 是否在去重窗口内见过
   * @param {Message} msg
   * @returns {boolean}
   */
  isSeen(msg) {
    const k = this.key(msg)
    const ts = this.seen.get(k)
    if (ts && Date.now() - ts < this.windowMs) {
      return true
    }
    return false
  }

  /**
   * 标记已见
   * @param {Message} msg
   */
  markSeen(msg) {
    const k = this.key(msg)
    this.seen.set(k, Date.now())
  }

  /**
   * 清理过期条目 (避免内存泄漏)
   */
  cleanup() {
    const now = Date.now()
    let removed = 0
    for (const [k, ts] of this.seen) {
      if (now - ts > this.windowMs) {
        this.seen.delete(k)
        removed++
      }
    }
    if (removed > 0) {
      console.log(`[dedupe] cleanup removed ${removed} expired entries (${this.seen.size} remaining)`)
    }
  }

  /**
   * 调试: 当前 dedupe 状态
   */
  status() {
    return {
      windowMs: this.windowMs,
      entries: this.seen.size,
    }
  }
}

module.exports = Dedupe
