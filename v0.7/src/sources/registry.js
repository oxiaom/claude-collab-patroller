// sources/registry.js — source registry for claude-collab-patroller v0.3.0
//
// 新 source 加入步骤:
//   1. 创建 src/sources/<name>.js 继承 Source 基类
//   2. 在本文件 import + registry.set('<type>', SourceClass)
//   3. 在 start.js config.sources 加 { type: '<type>', name: '...', ...config }

const CollabMCPSource = require('./collab-mcp')
const TelegramSource = require('./telegram')

const registry = new Map()
registry.set('collab-mcp', CollabMCPSource)
registry.set('telegram', TelegramSource)

module.exports = {
  /** @param {string} type @returns {typeof Source|undefined} */
  get: (type) => registry.get(type),
  /** @returns {string[]} */
  list: () => Array.from(registry.keys()),
  /** Register a new source type (for plugins extending claude-collab-patroller) */
  register: (type, SourceClass) => registry.set(type, SourceClass),
}
