// tests/unit/prometheus.test.js — vitest unit tests for Prometheus metrics
//
// Phase 2.1 — 测试覆盖

import { describe, it, expect } from 'vitest'
import { formatPrometheusMetrics } from '../../src/prometheus.js'

describe('Prometheus metrics', () => {
  it('should format basic metrics in Prometheus text format', () => {
    const status = {
      status: 'ok',
      pid: 1234,
      uptime: 3600,
      sources: [{ name: 'collab-mcp', type: 'collab-mcp' }],
      metrics: {
        polls: 100,
        wakes_sent: 5,
        reminds_sent: 1,
        errors: 0,
        last_poll_ts: '2026-08-24T05:30:00Z',
        watchdog: {
          checks: 60,
          crashes_detected: 0,
          last_alive_ts: '2026-08-24T05:30:00Z',
          last_dead_ts: null,
        },
      },
    }
    const text = formatPrometheusMetrics(status)
    expect(text).toContain('# HELP claude_collab_patroller_daemon_up')
    expect(text).toContain('# TYPE claude_collab_patroller_daemon_up gauge')
    expect(text).toContain('claude_collab_patroller_daemon_up 1')
    expect(text).toContain('claude_collab_patroller_uptime_seconds 3600')
    expect(text).toContain('claude_collab_patroller_polls_total 100')
    expect(text).toContain('claude_collab_patroller_wakes_sent_total 5')
    expect(text).toContain('claude_collab_patroller_reminds_sent_total 1')
    expect(text).toContain('claude_collab_patroller_errors_total 0')
    expect(text).toContain('claude_collab_patroller_source_up{source="collab-mcp"} 1')
    expect(text).toContain('claude_collab_patroller_claude_alive 1')
    expect(text).toContain('claude_collab_patroller_claude_crashes_total 0')
    expect(text).toContain('claude_collab_patroller_claude_checks_total 60')
  })

  it('should handle missing metrics gracefully', () => {
    const status = {}
    const text = formatPrometheusMetrics(status)
    expect(text).toContain('claude_collab_patroller_daemon_up 1')
    expect(text).toContain('claude_collab_patroller_polls_total 0')
    expect(text).toContain('claude_collab_patroller_wakes_sent_total 0')
    expect(text).toContain('claude_collab_patroller_errors_total 0')
  })

  it('should handle null last_poll_ts', () => {
    const status = { metrics: { last_poll_ts: null } }
    const text = formatPrometheusMetrics(status)
    expect(text).toContain('claude_collab_patroller_last_poll_timestamp_seconds 0')
  })

  it('should convert ISO timestamp to Unix epoch seconds', () => {
    const isoTs = '2026-08-24T05:30:00.000Z'
    const expectedUnix = Math.floor(new Date(isoTs).getTime() / 1000)
    const status = { metrics: { last_poll_ts: isoTs } }
    const text = formatPrometheusMetrics(status)
    expect(text).toContain(`claude_collab_patroller_last_poll_timestamp_seconds ${expectedUnix}`)
  })

  it('should include HELP + TYPE comments for all metrics', () => {
    const status = { sources: [], metrics: { watchdog: {} } }
    const text = formatPrometheusMetrics(status)
    // Count HELP comments
    const helpCount = (text.match(/# HELP/g) || []).length
    const typeCount = (text.match(/# TYPE/g) || []).length
    expect(helpCount).toBeGreaterThan(5)
    expect(typeCount).toBeGreaterThan(5)
    expect(helpCount).toBe(typeCount) // HELP and TYPE should be equal
  })

  it('should emit one source_up per source', () => {
    const status = {
      sources: [
        { name: 'collab-mcp', type: 'collab-mcp' },
        { name: 'telegram', type: 'telegram' },
      ],
    }
    const text = formatPrometheusMetrics(status)
    expect(text).toContain('source_up{source="collab-mcp"} 1')
    expect(text).toContain('source_up{source="telegram"} 1')
  })
})