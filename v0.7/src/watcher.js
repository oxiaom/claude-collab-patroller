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

    // Main loop
    this.running = true
    logger.info('watcher-started', { sourceCount: this.sources.length })

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
        const msgs = await source.poll()
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