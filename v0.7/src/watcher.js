// watcher.js — multi-source poll loop (Phase 1.2 改进版)
//
// 改进点 (vs v0.3.0/v0.4.0 Background Agent):
//   - 真正 persistent (Node.js 进程, 不依赖 Bash 580s cap)
//   - 多 source 并行
//   - 内部 metrics (polls/wakes/errors)
//   - 优雅 shutdown
//   - Health check via getter

const registry = require('./sources/registry')
const InstanceLock = require('./instance-lock')
const Dedupe = require('./dedupe')
const logger = require('./logger')

class Watcher {
  constructor({ pollIntervalMs, sources, wake, onError }) {
    this.pollIntervalMs = pollIntervalMs || 10000
    this.wake = wake
    this.onError = onError || ((err) => logger.error('watcher-error', { error: err.message }))

    this.sources = []
    this.dedupe = new Dedupe(5 * 60 * 1000) // 5-min window
    this.running = false

    // Phase 3.2 fix (real): 跟踪 max msg_id seen, 跳过历史积压
    // v0.7.0/v0.7.1 bug: 启动时没有 maxSeenMsgId 概念, source.poll() 返回所有 unacked msgs,
    // 第一次 poll 写 21+ wake marker 在 1s 内 burst (148 个实测 8/24 14:22 SGT)
    // 修法: 跟踪每个 source 的 max msg_id seen, 启动时设 high water mark (避免重放历史)
    this.startupTime = Date.now()
    this.maxSeenMsgIds = {}  // per-source: {sourceName: maxMsgId}

    // Metrics
    this.metrics = {
      polls: 0,
      wakes_sent: 0,
      reminds_sent: 0,
      errors: 0,
      last_poll_ts: null,
      last_wake_ts: null,
    }

    // Source init configs
    this.sourceConfigs = sources || []
  }

  async start() {
    const fs = require('fs')
    const DBG = 'C:/Users/SUISHUO-GK/AppData/Local/Temp/watcher-start.log'
    const dbg = (m) => { try { fs.appendFileSync(DBG, m + '\n') } catch(e) {} }
    dbg('--- start ---')

    // Init each source
    for (const cfg of this.sourceConfigs) {
      try {
        dbg(`init: type=${cfg.type} name=${cfg.name}`)
        const SourceClass = registry.get(cfg.type)
        if (!SourceClass) {
          dbg(`unknown type: ${cfg.type}`)
          logger.error('source-unknown', { type: cfg.type })
          continue
        }
        const source = new SourceClass(cfg)
        dbg('source instantiated, calling init()')
        await source.init()
        dbg('source init() resolved')
        this.sources.push(source)
        logger.info('source-initialized', { name: source.name, type: cfg.type })
      } catch (e) {
        dbg(`source-init-failed: ${cfg.type} - ${e.message}`)
        dbg(`STACK: ${e.stack}`)
        logger.error('source-init-failed', { type: cfg.type, error: e.message })
        this.metrics.errors++
      }
    }

    if (this.sources.length === 0) {
      throw new Error('no sources initialized')
    }

    // Phase 3.2 fix (real): primer poll 设 high water mark, 不 wake
    // 启动时 poll 一次, 只取 max msg_id 设到 maxSeenMsgIds, **不** 触发 wake
    // 避免 daemon 启动时把历史 148 个未 ack msgs 当新消息 burst 写 wake marker
    for (const source of this.sources) {
      try {
        const primerMsgs = await source.poll()
        if (primerMsgs.length > 0) {
          this.maxSeenMsgIds[source.name] = Math.max(...primerMsgs.map(m => m.id))
          logger.info('primer-set', { source: source.name, maxMsgId: this.maxSeenMsgIds[source.name], skipped: primerMsgs.length })
        } else {
          this.maxSeenMsgIds[source.name] = 0
        }
      } catch (e) {
        logger.warn('primer-failed', { source: source.name, error: e.message })
        this.maxSeenMsgIds[source.name] = 0
      }
    }

    // Main loop
    this.running = true
    logger.info('watcher-started', { sourceCount: this.sources.length, maxSeenMsgIds: this.maxSeenMsgIds })

    // Run loop in background (don't await — let daemon.start() return)
    this.loopPromise = this._loop()

    // Don't await — daemon wants to return and handle signals
    // Shutdown will await loopPromise
  }

  async _loop() {
    while (this.running) {
      try {
        await this._pollCycle()
      } catch (e) {
        this.metrics.errors++
        this.onError(e, { phase: 'poll-cycle' })
      }
      await new Promise(r => setTimeout(r, this.pollIntervalMs))
    }
  }

  async _pollCycle() {
    this.metrics.polls++
    this.metrics.last_poll_ts = new Date().toISOString()

    for (const source of this.sources) {
      try {
        let msgs = await source.poll()

        // Phase 3.2 fix (real): 跳过历史积压 (id <= maxSeenMsgIds[source.name])
        // primer poll 已设 maxSeenMsgIds 到当前最大 id, 这次只处理 > maxSeen
        const maxSeen = this.maxSeenMsgIds[source.name] || 0
        const beforeCount = msgs.length
        msgs = msgs.filter(m => m.id > maxSeen)
        // Update high water mark (per source)
        if (msgs.length > 0) {
          const newMax = Math.max(...msgs.map(m => m.id))
          if (newMax > maxSeen) {
            this.maxSeenMsgIds[source.name] = newMax
          }
        }

        const skipped = beforeCount - msgs.length
        if (skipped > 0) {
          logger.info('backlog-skipped', {
            source: source.name,
            skipped,
            maxSeenMsgId: this.maxSeenMsgIds[source.name],
          })
        }

        for (const msg of msgs) {
          if (this.dedupe.isSeen(msg)) continue
          this.dedupe.markSeen(msg)

          logger.info('new-msg', { source: source.name, msgId: msg.id, from: msg.from })

          // Wake (fire-and-forget)
          this.wake.wake(msg).then(result => {
            if (result.ok) {
              if (result.method === 'claude-print' || result.method === 'send-message') {
                this.metrics.wakes_sent++
                this.metrics.last_wake_ts = new Date().toISOString()
              } else if (result.method === 'force-remind') {
                this.metrics.reminds_sent++
              }
              logger.info('wake-ok', { msgId: msg.id, method: result.method, pid: result.pid })
            } else {
              this.metrics.errors++
              logger.warn('wake-failed', { msgId: msg.id, error: result.error })
            }
          }).catch(e => {
            this.metrics.errors++
            logger.error('wake-exception', { msgId: msg.id, error: e.message })
          })

          // Ack (if source supports)
          source.ack(msg).catch(e => {
            logger.warn('ack-failed', { msgId: msg.id, error: e.message })
          })
        }
      } catch (e) {
        this.metrics.errors++
        this.onError(e, { phase: 'poll', source: source.name })
      }
    }

    this.dedupe.cleanup()
  }

  async stop() {
    logger.info('watcher-stopping')
    this.running = false

    if (this.loopPromise) {
      await this.loopPromise
    }

    for (const source of this.sources) {
      try {
        await source.shutdown()
      } catch (e) {
        logger.warn('source-shutdown-failed', { name: source.name, error: e.message })
      }
    }

    logger.info('watcher-stopped')
  }

  // Health endpoint getters
  getSourcesStatus() {
    return this.sources.map(s => ({
      name: s.name,
      type: s.type || 'unknown',
    }))
  }

  getMetrics() {
    return { ...this.metrics }
  }
}

module.exports = Watcher