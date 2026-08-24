// tests/unit/instance-lock.test.js — vitest unit tests for InstanceLock
//
// Phase 1.5 — 测试覆盖
// 验证单实例锁 + stale 检测

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import InstanceLock from '../../src/instance-lock.js'
import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('InstanceLock', () => {
  let lockPath
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ccp-lock-test-'))
    lockPath = join(tmpDir, 'test.lock')
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  it('should acquire lock when no existing file', () => {
    const lock = new InstanceLock(lockPath)
    const result = lock.acquire()
    expect(result.acquired).toBe(true)
    expect(result.pid).toBe(process.pid)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('should refuse lock when existing process alive', () => {
    // Write a lock file with current PID (alive)
    writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      acquired_at: new Date().toISOString(),
      version: '0.7.0',
    }))

    const lock = new InstanceLock(lockPath)
    const result = lock.acquire()
    expect(result.acquired).toBe(false)
    expect(result.existingPid).toBe(process.pid)
  })

  it('should remove stale lock from dead PID', () => {
    // Write a lock with a definitely-dead PID (999999)
    writeFileSync(lockPath, JSON.stringify({
      pid: 999999,
      acquired_at: new Date().toISOString(),
      version: '0.7.0',
    }))

    const lock = new InstanceLock(lockPath)
    const result = lock.acquire()
    // Should acquire after removing stale lock
    expect(result.acquired).toBe(true)
    expect(existsSync(lockPath)).toBe(true)
    // New lock should have current PID
    const data = JSON.parse(readFileSync(lockPath, 'utf8'))
    expect(data.pid).toBe(process.pid)
  })

  it('should remove lock file older than 5 minutes even if PID alive (defensive)', () => {
    // Write a lock with current PID but OLD acquired_at
    const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      acquired_at: oldTime,
      version: '0.7.0',
    }))

    const lock = new InstanceLock(lockPath)
    const result = lock.acquire()
    // Should acquire after removing stale lock (defensive: lock age > 5min)
    expect(result.acquired).toBe(true)
  })

  it('release should remove lock file', () => {
    const lock = new InstanceLock(lockPath)
    lock.acquire()
    expect(existsSync(lockPath)).toBe(true)

    lock.release()
    expect(existsSync(lockPath)).toBe(false)
  })

  it('release should not remove lock owned by different PID', () => {
    // Write a lock owned by different PID
    writeFileSync(lockPath, JSON.stringify({
      pid: 888888,
      acquired_at: new Date().toISOString(),
    }))

    const lock = new InstanceLock(lockPath)
    // Don't acquire (would refuse), just call release
    lock.release()
    // Lock should still exist (owned by 888888)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('release should handle missing lock file gracefully', () => {
    const lock = new InstanceLock(lockPath)
    // Never acquired, just release
    expect(() => lock.release()).not.toThrow()
  })

  it('release should handle corrupt lock file gracefully', () => {
    writeFileSync(lockPath, 'not json {{{')
    const lock = new InstanceLock(lockPath)
    // Release should not throw
    expect(() => lock.release()).not.toThrow()
  })
})