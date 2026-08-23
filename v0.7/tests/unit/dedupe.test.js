// tests/unit/dedupe.test.js — vitest unit tests for Dedupe
//
// Phase 1.5 — 测试覆盖
// 验证 5-min dedupe 窗口 + cleanup 行为

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Dedupe from '../../src/dedupe.js'

describe('Dedupe', () => {
  let dedupe
  let now = 1000000 // Fixed timestamp for test

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    dedupe = new Dedupe(5 * 60 * 1000) // 5 min window
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should mark new msg as not seen', () => {
    const msg = { id: 1, from: 'baobei', content: 'x' }
    expect(dedupe.isSeen(msg)).toBe(false)
  })

  it('should mark seen msg as seen after markSeen', () => {
    const msg = { id: 2, from: 'baobei', content: 'x' }
    dedupe.markSeen(msg)
    expect(dedupe.isSeen(msg)).toBe(true)
  })

  it('should generate stable key from source+from+id', () => {
    const msg1 = { id: 1, from: 'baobei', content: 'x', source: 'collab-mcp' }
    const msg2 = { id: 1, from: 'baobei', content: 'y', source: 'collab-mcp' } // diff content
    dedupe.markSeen(msg1)
    expect(dedupe.isSeen(msg2)).toBe(true) // same key
  })

  it('should generate different key for different source', () => {
    const msg1 = { id: 1, from: 'baobei', content: 'x', source: 'collab-mcp' }
    const msg2 = { id: 1, from: 'baobei', content: 'x', source: 'telegram' }
    dedupe.markSeen(msg1)
    expect(dedupe.isSeen(msg2)).toBe(false)
  })

  it('should forget after window expires', () => {
    const msg = { id: 1, from: 'baobei', content: 'x' }
    dedupe.markSeen(msg)
    expect(dedupe.isSeen(msg)).toBe(true)

    // Advance time by 6 minutes (past 5-min window)
    vi.setSystemTime(now + 6 * 60 * 1000)
    expect(dedupe.isSeen(msg)).toBe(false)
  })

  it('should still remember within window', () => {
    const msg = { id: 1, from: 'baobei', content: 'x' }
    dedupe.markSeen(msg)

    // Advance 4 minutes (within window)
    vi.setSystemTime(now + 4 * 60 * 1000)
    expect(dedupe.isSeen(msg)).toBe(true)
  })

  it('should use sha256 hash for content when no id', () => {
    const msg1 = { from: 'baobei', content: 'unique content' }
    const msg2 = { from: 'baobei', content: 'unique content' }
    dedupe.markSeen(msg1)
    expect(dedupe.isSeen(msg2)).toBe(true)

    const msg3 = { from: 'baobei', content: 'different content' }
    expect(dedupe.isSeen(msg3)).toBe(false)
  })

  it('cleanup should remove expired entries', () => {
    dedupe.markSeen({ id: 1, from: 'baobei', content: 'x' })
    dedupe.markSeen({ id: 2, from: 'kimi', content: 'y' })

    // Advance past window
    vi.setSystemTime(now + 6 * 60 * 1000)
    dedupe.cleanup()

    const status = dedupe.status()
    expect(status.entries).toBe(0)
  })

  it('cleanup should keep entries within window', () => {
    dedupe.markSeen({ id: 1, from: 'baobei', content: 'x' })
    dedupe.cleanup()
    expect(dedupe.status().entries).toBe(1)
  })

  it('status should report window and entries count', () => {
    dedupe.markSeen({ id: 1, from: 'baobei', content: 'x' })
    dedupe.markSeen({ id: 2, from: 'kimi', content: 'y' })
    const status = dedupe.status()
    expect(status.windowMs).toBe(5 * 60 * 1000)
    expect(status.entries).toBe(2)
  })
})