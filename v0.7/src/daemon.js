#!/usr/bin/env node
// daemon.js — claude-collab-patroller v0.7.0 main entry
//
// Phase 1.2: 持久 Node.js daemon (替代 Bash respawn daemon)
// 解决 Bash 580s cap, 7×24 跑, PM2/systemd 守护
//
// 设计目标:
//   - 持续运行 (PM2/systemd auto-restart on crash)
//   - 多 source 并行 (collab-mcp + telegram stub)
//   - 多 channel wake (file-marker + claude-print + send-message)
//   - Health endpoint (HTTP /health) for monitoring
//   - Structured JSON logging
//   - Graceful shutdown (SIGTERM/SIGINT → finish current poll → exit)
//
// 不依赖:
//   - claude.exe daemon (single point of failure 缓解)
//   - Bash 580s cap (持久化)
//   - Background Agent sub-agent (架构简化)

const Watcher = require('./watcher')
const Wake = require('./wake')
const logger = require('./logger')
const { setLogLevel } = logger
const health = require('./health')
const config = require('./config')

class Daemon {
  constructor() {
    this.watcher = null
    this.healthServer = null
    this.shuttingDown = false
    this.startTime = Date.now()
  }

  async start() {
    logger.info('startup', {
      version: require('../package.json').version,
      pid: process.pid,
      node: process.version,
      platform: process.platform,
    })

    // Init Wake (multi-channel dispatcher)
    const wake = new Wake(config.wake)

    // Init Watcher (multi-source poll loop)
    this.watcher = new Watcher({
      pollIntervalMs: config.pollIntervalMs,
      sources: config.sources,
      wake,
      onError: (err, ctx) => logger.error('source-error', { error: err.message, ...ctx }),
    })

    // Init Health HTTP endpoint
    if (config.health.enabled) {
      this.healthServer = health.createServer({
        getStatus: () => ({
          status: 'ok',
          pid: process.pid,
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          sources: this.watcher.getSourcesStatus(),
          metrics: this.watcher.getMetrics(),
        }),
        port: config.health.port,
        host: config.health.host,
      })
    }

    // Start watcher
    try {
      await this.watcher.start()
      logger.info('watcher-started', {
        sourceCount: this.watcher.sources.length,
        pollIntervalMs: config.pollIntervalMs,
      })
    } catch (e) {
      logger.error('watcher-start-failed', { error: e.message })
      process.exit(1)
    }

    // Start health server
    if (this.healthServer) {
      try {
        await this.healthServer.start()
        logger.info('health-server-started', { port: config.health.port, host: config.health.host })
      } catch (e) {
        logger.warn('health-server-failed', { error: e.message })
      }
    }

    // Graceful shutdown
    const shutdown = async (signal) => {
      if (this.shuttingDown) return
      this.shuttingDown = true
      logger.info('shutdown-start', { signal })

      try {
        if (this.healthServer) await this.healthServer.stop()
        if (this.watcher) await this.watcher.stop()
        logger.info('shutdown-complete', { uptimeSec: Math.floor((Date.now() - this.startTime) / 1000) })
        process.exit(0)
      } catch (e) {
        logger.error('shutdown-error', { error: e.message })
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('uncaughtException', (err) => {
      logger.error('uncaught-exception', { error: err.message, stack: err.stack })
      // 不立即退出, 让 PM2/systemd 决定 (auto-restart)
    })
    process.on('unhandledRejection', (reason) => {
      logger.error('unhandled-rejection', { reason: String(reason) })
    })

    logger.info('daemon-ready', { uptimeMs: Date.now() - this.startTime })
  }
}

// CLI entry
if (require.main === module) {
  // Parse --verbose flag
  if (process.argv.includes('--verbose')) {
    setLogLevel('debug')
  }

  const daemon = new Daemon()
  daemon.start().catch((e) => {
    logger.error('fatal', { error: e.message, stack: e.stack })
    process.exit(1)
  })
}

module.exports = Daemon