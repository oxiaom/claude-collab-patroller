// watchdog.js — claude.exe (claude-code daemon) crash detection (Phase 1.4)
//
// 老实承认限制:
//   - claude.exe 是 Claude Code 主进程, 运行 claude session 的 parent
//   - 外部 daemon (我们 v0.7) **不能**真正 restart claude.exe
//   - 只能: monitor + alert + metric (kill -0 检查 PID 是否活着)
//
// 设计:
//   - 周期 (60s) 用 kill -0 检查 claude.exe PID
//   - PID 死了: 记录 metric + log error + 通过 webhook/file 告警
//   - 持续监控, 不会因为 claude.exe crash 而退出 (因为 v0.7 daemon 独立进程)
//
// 真 restart claude.exe 需要:
//   - ops 配 systemd / Windows Service (claude-code 本身不支持 daemon 模式)
//   - 或者 main session 用户手动重启
//
// 此模块是监控 + 告警, 不是真的 restart

const fs = require('fs')
const { execSync } = require('child_process')
const logger = require('./logger')

class Watchdog {
  constructor({ claudePid, checkIntervalMs, onCrash }) {
    this.claudePid = claudePid || process.env.CCP_CLAUDE_PID
    this.checkIntervalMs = checkIntervalMs || 60000 // 60s default
    this.onCrash = onCrash || ((err) => logger.error('claude-crash-detected', { error: err.message }))
    this.running = false

    this.metrics = {
      checks: 0,
      crashes_detected: 0,
      last_check_ts: null,
      last_alive_ts: null,
      last_dead_ts: null,
    }
  }

  /**
   * 检查 claude.exe PID 是否活着
   * @returns {boolean} true if alive, false if dead
   */
  isAlive(pid) {
    if (!pid) return false
    try {
      // kill -0 = signal 0 = check process exists (no actual signal sent)
      process.kill(pid, 0)
      return true
    } catch (e) {
      return false
    }
  }

  async start() {
    if (!this.claudePid) {
      logger.warn('watchdog-no-pid', {
        message: 'CCP_CLAUDE_PID env var not set, watchdog disabled',
        hint: 'Set CCP_CLAUDE_PID to claude.exe PID for crash detection',
      })
      return
    }

    this.running = true
    logger.info('watchdog-started', {
      claudePid: this.claudePid,
      checkIntervalMs: this.checkIntervalMs,
    })

    // Initial check
    await this._checkOnce()

    // Periodic loop
    while (this.running) {
      await new Promise(r => setTimeout(r, this.checkIntervalMs))
      await this._checkOnce()
    }
  }

  async _checkOnce() {
    this.metrics.checks++
    this.metrics.last_check_ts = new Date().toISOString()

    const alive = this.isAlive(this.claudePid)
    if (alive) {
      this.metrics.last_alive_ts = this.metrics.last_check_ts
      logger.debug('watchdog-alive', { pid: this.claudePid })
    } else {
      this.metrics.last_dead_ts = this.metrics.last_check_ts
      this.metrics.crashes_detected++
      logger.error('watchdog-dead', {
        pid: this.claudePid,
        note: 'claude.exe daemon crashed (or PID changed). Plugin v0.7 daemon continues running independently.',
        metric: 'crashes_detected',
        value: this.metrics.crashes_detected,
      })
      // Trigger callback (alert)
      try {
        await this.onCrash(new Error(`claude.exe PID ${this.claudePid} not alive`))
      } catch (e) {
        logger.error('watchdog-callback-error', { error: e.message })
      }
    }
  }

  async stop() {
    this.running = false
    logger.info('watchdog-stopped', { checks: this.metrics.checks })
  }

  getMetrics() {
    return { ...this.metrics }
  }
}

module.exports = Watchdog