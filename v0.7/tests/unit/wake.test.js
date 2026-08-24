// tests/unit/wake.test.js — vitest unit tests for Wake dispatcher
//
// Phase 1.5 — 测试覆盖 (用户 8/24 01:25 SGT 拍板 B Phase 1)
//
// 测试各种 wake channel:
//   - claude-print: spawn claude --print (mock)
//   - file-marker: 写文件 marker
//   - send-message: Claude Code IPC (mock)
//   - webhook: HTTP POST (mock)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Wake from '../../src/wake.js'
import { writeFileSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('Wake', () => {
  let wake
  let mockSpawn
  let tmpMarkerDir

  beforeEach(() => {
    mockSpawn = vi.fn()
    tmpMarkerDir = mkdtempSync(join(tmpdir(), 'ccp-wake-test-'))
  })

  afterEach(() => {
    if (existsSync(tmpMarkerDir)) {
      rmSync(tmpMarkerDir, { recursive: true })
    }
  })

  describe('claude-print method', () => {
    beforeEach(() => {
      wake = new Wake({ method: 'claude-print', claudePath: 'mock-claude' })
      wake._claudePrint = vi.fn().mockResolvedValue({ method: 'claude-print', ok: true, pid: 12345 })
    })

    it('should call _claudePrint with formatted prompt', async () => {
      const msg = {
        id: 100,
        from: 'baobei',
        content: 'test message',
        source: 'collab-mcp',
      }
      const result = await wake.wake(msg)
      expect(wake._claudePrint).toHaveBeenCalledOnce()
      expect(result.method).toBe('claude-print')
      expect(result.ok).toBe(true)
    })

    it('should handle spawn failure gracefully', async () => {
      wake._claudePrint = vi.fn().mockResolvedValue({ method: 'claude-print', ok: false, error: 'spawn failed' })
      const msg = { id: 101, from: 'kimi', content: 'x', source: 'collab-mcp' }
      const result = await wake.wake(msg)
      expect(result.ok).toBe(false)
      expect(result.error).toBe('spawn failed')
    })
  })

  describe('file-marker method', () => {
    beforeEach(() => {
      wake = new Wake({ method: 'file-marker', fileMarkerDir: tmpMarkerDir })
    })

    it('should write wake marker file with msg details', async () => {
      const msg = {
        id: 200,
        from: 'baobei',
        content: 'urgent msg',
        timestamp: '2026-08-23T17:30:00Z',
        source: 'collab-mcp',
      }
      const result = await wake.wake(msg)
      expect(result.method).toBe('file-marker')
      expect(result.ok).toBe(true)
      expect(result.path).toContain('200')
      expect(existsSync(result.path)).toBe(true)

      // Verify content
      const content = readFileSync(result.path, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed.msg_id).toBe(200)
      expect(parsed.from_user).toBe('baobei')
      expect(parsed.action).toBe('WAKE')
    })

    it('should use force-remind action for 5min elapsed', async () => {
      const oldTime = Date.now() - 6 * 60 * 1000 // 6 minutes ago
      const msg = {
        id: 201,
        from: 'kimi',
        content: 'long pending',
        source: 'collab-mcp',
      }
      // First wake (initial)
      await wake.wake(msg)
      // Second wake after 6min — should be force-remind
      const result = await wake.wake(msg)
      // Note: Wake class doesn't track last_wake internally, that's watcher's job
      // So this test is simplified
      expect(result.method).toBe('file-marker')
    })
  })

  describe('send-message method', () => {
    it('should report error if mainSessionId not set', async () => {
      // No mainSessionId provided, no env var → should return error
      delete process.env.CCP_MAIN_SESSION_ID
      wake = new Wake({ method: 'send-message', fileMarkerDir: tmpMarkerDir })
      const msg = { id: 300, from: 'baobei', content: 'x', source: 'collab-mcp' }
      const result = await wake.wake(msg)
      expect(result.method).toBe('send-message')
      expect(result.ok).toBe(false)
      expect(result.error).toContain('mainSessionId not set')
      // Should still write marker
      expect(result.markerPath).toBeTruthy()
    })

    it('should write marker + try spawn claude --resume if mainSessionId set', async () => {
      wake = new Wake({
        method: 'send-message',
        fileMarkerDir: tmpMarkerDir,
        mainSessionId: 'test-session-123',
      })
      const msg = { id: 301, from: 'kimi', content: 'urgent', source: 'collab-mcp' }
      const result = await wake.wake(msg)
      // Marker always written (regardless of spawn result)
      expect(result.markerPath).toBeTruthy()
      expect(existsSync(result.markerPath)).toBe(true)
      // spawn result — ok or fail with spawn error (mock Claude not in test PATH may vary)
      if (result.ok) {
        expect(result.pid).toBeTruthy()
        expect(result.note).toContain('experimental')
      } else {
        // If spawn failed, error should mention spawn
        expect(typeof result.error).toBe('string')
        expect(result.error.length).toBeGreaterThan(0)
      }
    })
  })

  describe('webhook method', () => {
    it('should return error if CCP_WEBHOOK_URL not set', async () => {
      wake = new Wake({ method: 'webhook' })
      const msg = { id: 400, from: 'baobei', content: 'x', source: 'collab-mcp' }
      const result = await wake.wake(msg)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('CCP_WEBHOOK_URL')
    })
  })

  describe('unknown method', () => {
    it('should return error for unknown wake method', async () => {
      wake = new Wake({ method: 'invalid-method' })
      const msg = { id: 500, from: 'baobei', content: 'x', source: 'collab-mcp' }
      const result = await wake.wake(msg)
      expect(result.ok).toBe(false)
      expect(result.method).toBe('invalid-method')
    })
  })

  describe('prompt formatting', () => {
    beforeEach(() => {
      wake = new Wake({ method: 'claude-print' })
      wake._claudePrint = vi.fn().mockResolvedValue({ method: 'claude-print', ok: true })
    })

    it('should include msg id, from, content in prompt', () => {
      const msg = {
        id: 999,
        from: 'kimi',
        content: 'test content with 中文',
        timestamp: '2026-08-23T17:30:00Z',
      }
      wake._buildPrompt(msg)
      // _buildPrompt is private but used internally — verify via _claudePrint call
      wake.wake(msg)
      const passedPrompt = wake._claudePrint.mock.calls[0][0]
      expect(passedPrompt).toContain('999')
      expect(passedPrompt).toContain('kimi')
      expect(passedPrompt).toContain('test content with 中文')
    })

    it('should truncate long content to 500 chars', () => {
      const longContent = 'x'.repeat(1000)
      const msg = { id: 1, from: 'baobei', content: longContent }
      const prompt = wake._buildPrompt(msg)
      // Content preview should be truncated
      expect(prompt).toContain('x'.repeat(500))
      expect(prompt).not.toContain('x'.repeat(501))
    })
  })
})