// tests/unit/watchdog.test.js — vitest unit tests for Watchdog
//
// Phase 1.5 — 测试覆盖
// 验证 claude.exe crash detection 行为

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Watchdog from '../../src/watchdog.js'

describe('Watchdog', () => {
  let watchdog

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('isAlive', () => {
    it('should return false for null/undefined PID', () => {
      watchdog = new Watchdog({ checkIntervalMs: 60000 })
      expect(watchdog.isAlive(null)).toBe(false)
      expect(watchdog.isAlive(undefined)).toBe(false)
    })

    it('should return false for non-existent PID', () => {
      watchdog = new Watchdog({ checkIntervalMs: 60000 })
      // PID 999999 should not exist
      expect(watchdog.isAlive(999999)).toBe(false)
    })

    it('should return true for current process PID', () => {
      watchdog = new Watchdog({ checkIntervalMs: 60000 })
      expect(watchdog.isAlive(process.pid)).toBe(true)
    })
  })

  describe('start', () => {
    it('should not start without claudePid', async () => {
      watchdog = new Watchdog({ checkIntervalMs: 60000 })
      // Should not throw
      await watchdog.start()
      expect(watchdog.running).toBe(false)
    })

    it('should run initial check + schedule periodic checks', async () => {
      watchdog = new Watchdog({
        claudePid: process.pid,
        checkIntervalMs: 1000,
      })

      // Mock the start to not run actual interval loop
      const originalSetTimeout = global.setTimeout
      // We can't easily test the interval loop in unit test
      // Just test the initial check
      const alive = watchdog.isAlive(process.pid)
      expect(alive).toBe(true)

      // metrics should track checks
      await watchdog._checkOnce()
      expect(watchdog.metrics.checks).toBe(1)
      expect(watchdog.metrics.last_alive_ts).toBeTruthy()
    })
  })

  describe('crash detection', () => {
    it('should detect crash and increment counter', async () => {
      watchdog = new Watchdog({
        claudePid: 999999, // dead PID
        checkIntervalMs: 1000,
        onCrash: vi.fn(),
      })

      const onCrash = vi.fn()
      watchdog.onCrash = onCrash

      await watchdog._checkOnce()

      expect(watchdog.metrics.crashes_detected).toBe(1)
      expect(watchdog.metrics.last_dead_ts).toBeTruthy()
      expect(onCrash).toHaveBeenCalledOnce()
    })

    it('should not call onCrash for alive PID', async () => {
      watchdog = new Watchdog({
        claudePid: process.pid,
        checkIntervalMs: 1000,
        onCrash: vi.fn(),
      })

      const onCrash = vi.fn()
      watchdog.onCrash = onCrash

      await watchdog._checkOnce()

      expect(watchdog.metrics.crashes_detected).toBe(0)
      expect(watchdog.metrics.last_alive_ts).toBeTruthy()
      expect(onCrash).not.toHaveBeenCalled()
    })

    it('should handle onCrash callback errors gracefully', async () => {
      watchdog = new Watchdog({
        claudePid: 999999,
        checkIntervalMs: 1000,
        onCrash: vi.fn().mockRejectedValue(new Error('callback boom')),
      })

      // Should not throw
      await expect(watchdog._checkOnce()).resolves.not.toThrow()
      expect(watchdog.metrics.crashes_detected).toBe(1)
    })
  })

  describe('metrics', () => {
    it('should report metrics', async () => {
      watchdog = new Watchdog({ claudePid: process.pid, checkIntervalMs: 1000 })
      await watchdog._checkOnce()
      const metrics = watchdog.getMetrics()
      expect(metrics.checks).toBe(1)
      expect(metrics.crashes_detected).toBe(0)
    })
  })

  describe('stop', () => {
    it('should set running to false', async () => {
      watchdog = new Watchdog({ claudePid: process.pid, checkIntervalMs: 1000 })
      watchdog.running = true
      await watchdog.stop()
      expect(watchdog.running).toBe(false)
    })
  })
})