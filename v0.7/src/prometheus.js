// prometheus.js — Prometheus metrics export for v0.7 daemon
//
// Phase 2.1 — Observability
// 跟 /health 共享 HTTP server, 加 /metrics endpoint
// Format: Prometheus text exposition format (https://prometheus.io/docs/instrumenting/exposition_formats/)

const logger = require('./logger')

/**
 * Format metrics as Prometheus text exposition format
 * @param {Object} status 健康状态对象 (from /health)
 * @returns {string} Prometheus text format
 */
function formatPrometheusMetrics(status) {
  const m = status.metrics || {}
  const wd = m.watchdog || {}
  const sources = status.sources || []

  const lines = []

  // HELP + TYPE comments
  lines.push('# HELP claude_collab_patroller_daemon_up Daemon process up (1) or down (0)')
  lines.push('# TYPE claude_collab_patroller_daemon_up gauge')
  lines.push(`claude_collab_patroller_daemon_up 1`)

  lines.push('# HELP claude_collab_patroller_uptime_seconds Daemon uptime in seconds')
  lines.push('# TYPE claude_collab_patroller_uptime_seconds gauge')
  lines.push(`claude_collab_patroller_uptime_seconds ${status.uptime || 0}`)

  // Watcher metrics
  lines.push('# HELP claude_collab_patroller_polls_total Total poll cycles executed')
  lines.push('# TYPE claude_collab_patroller_polls_total counter')
  lines.push(`claude_collab_patroller_polls_total ${m.polls || 0}`)

  lines.push('# HELP claude_collab_patroller_wakes_sent_total Total wake events sent (initial wakes)')
  lines.push('# TYPE claude_collab_patroller_wakes_sent_total counter')
  lines.push(`claude_collab_patroller_wakes_sent_total ${m.wakes_sent || 0}`)

  lines.push('# HELP claude_collab_patroller_reminds_sent_total Total force-remind wake events sent')
  lines.push('# TYPE claude_collab_patroller_reminds_sent_total counter')
  lines.push(`claude_collab_patroller_reminds_sent_total ${m.reminds_sent || 0}`)

  lines.push('# HELP claude_collab_patroller_errors_total Total errors encountered')
  lines.push('# TYPE claude_collab_patroller_errors_total counter')
  lines.push(`claude_collab_patroller_errors_total ${m.errors || 0}`)

  lines.push('# HELP claude_collab_patroller_last_poll_timestamp_seconds Unix timestamp of last poll cycle')
  lines.push('# TYPE claude_collab_patroller_last_poll_timestamp_seconds gauge')
  if (m.last_poll_ts) {
    const ts = Math.floor(new Date(m.last_poll_ts).getTime() / 1000)
    lines.push(`claude_collab_patroller_last_poll_timestamp_seconds ${ts}`)
  } else {
    lines.push(`claude_collab_patroller_last_poll_timestamp_seconds 0`)
  }

  // Source up/down (gauge per source)
  lines.push('# HELP claude_collab_patroller_source_up Source availability (1=up, 0=down)')
  lines.push('# TYPE claude_collab_patroller_source_up gauge')
  for (const s of sources) {
    // Currently always 1 if in sources list; future: track actual health
    lines.push(`claude_collab_patroller_source_up{source="${s.name}"} 1`)
  }

  // Watchdog metrics
  lines.push('# HELP claude_collab_patroller_claude_alive Claude.exe process alive (1) or dead (0)')
  lines.push('# TYPE claude_collab_patroller_claude_alive gauge')
  lines.push(`claude_collab_patroller_claude_alive ${wd.last_alive_ts ? 1 : 0}`)

  lines.push('# HELP claude_collab_patroller_claude_crashes_total Total claude.exe crashes detected')
  lines.push('# TYPE claude_collab_patroller_claude_crashes_total counter')
  lines.push(`claude_collab_patroller_claude_crashes_total ${wd.crashes_detected || 0}`)

  lines.push('# HELP claude_collab_patroller_claude_checks_total Total watchdog checks performed')
  lines.push('# TYPE claude_collab_patroller_claude_checks_total counter')
  lines.push(`claude_collab_patroller_claude_checks_total ${wd.checks || 0}`)

  return lines.join('\n') + '\n'
}

/**
 * 创建 /metrics endpoint handler (跟 /health 共享 HTTP server)
 */
function createMetricsHandler({ getStatus }) {
  return {
    handler: (req, res) => {
      if (req.url !== '/metrics') {
        res.writeHead(404)
        res.end('not found')
        return
      }
      try {
        const status = getStatus()
        const text = formatPrometheusMetrics(status)
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' })
        res.end(text)
      } catch (e) {
        logger.error('metrics-error', { error: e.message })
        res.writeHead(500)
        res.end('error')
      }
    },
  }
}

module.exports = { formatPrometheusMetrics, createMetricsHandler }