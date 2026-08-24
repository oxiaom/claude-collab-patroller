// tests/unit/sources-collab-mcp.test.js — vitest unit tests for collab-mcp source
//
// Phase 3 — 测试覆盖扩展
// 验证 to_user='all' broadcast 消息被 include (user 8/24 13:50 SGT 反馈)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile } from 'child_process'
import CollabMCPSource from '../../src/sources/collab-mcp.js'

describe('CollabMCPSource', () => {
  let source
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ccp-source-test-'))
    writeFileSync(join(tmpDir, 'mcp-collab-claude.sh'), '#!/bin/bash\necho ""\n')
    source = new CollabMCPSource({
      scriptPath: join(tmpDir, 'mcp-collab-claude.sh'),
      bashPath: process.platform === 'win32' ? 'C:/Program Files (x86)/Git/bin/bash.exe' : '/bin/bash',
    })
  })

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
    vi.clearAllMocks()
  })

  describe('poll - to_user filter', () => {
    it('should include msgs to_user=claude', async () => {
      const messages = [{ id: 1, from_user: 'baobei', to_user: 'claude', acked: false, content: 'direct', created_at: '' }]
      execFile.mockResolvedValue({ stdout: JSON.stringify({ result: { messages } }), stderr: '' })
      const result = await source.poll()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
    })

    it('should include msgs to_user=all (broadcast)', async () => {
      const messages = [{ id: 2, from_user: 'baobei', to_user: 'all', acked: false, content: 'broadcast', created_at: '' }]
      execFile.mockResolvedValue({ stdout: JSON.stringify({ result: { messages } }), stderr: '' })
      const result = await source.poll()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(2)
      expect(result[0].from).toBe('baobei')
    })

    it('should exclude msgs to_user=baobei (not for me)', async () => {
      const messages = [{ id: 3, from_user: 'kimi', to_user: 'baobei', acked: false, content: 'not for me', created_at: '' }]
      execFile.mockResolvedValue({ stdout: JSON.stringify({ result: { messages } }), stderr: '' })
      const result = await source.poll()
      expect(result).toHaveLength(0)
    })

    it('should exclude msgs to_user=kimi (not for me)', async () => {
      const messages = [{ id: 4, from_user: 'baobei', to_user: 'kimi', acked: false, content: 'not for me', created_at: '' }]
      execFile.mockResolvedValue({ stdout: JSON.stringify({ result: { messages } }), stderr: '' })
      const result = await source.poll()
      expect(result).toHaveLength(0)
    })
  })

  describe('poll - acked filter', () => {
    it('should exclude acked msgs', async () => {
      const messages = [{ id: 5, from_user: 'baobei', to_user: 'claude', acked: true, content: 'acked', created_at: '' }]
      execFile.mockResolvedValue({ stdout: JSON.stringify({ result: { messages } }), stderr: '' })
      const result = await source.poll()
      expect(result).toHaveLength(0)
    })

    it('should exclude acked=1 (number)', async () => {
      const messages = [{ id: 6, from_user: 'baobei', to_user: 'claude', acked: 1, content: 'acked int', created_at: '' }]
      execFile.mockResolvedValue({ stdout: JSON.stringify({ result: { messages } }), stderr: '' })
      const result = await source.poll()
      expect(result).toHaveLength(0)
    })
  })

  describe('poll - from_user filter', () => {
    it('should exclude self-messages (from_user=claude)', async () => {
      const messages = [
        { id: 7, from_user: 'claude', to_user: 'claude', acked: false, content: 'self', created_at: '' },
        { id: 8, from_user: 'claude', to_user: 'all', acked: false, content: 'self broadcast', created_at: '' }
      ]
      execFile.mockResolvedValue({ stdout: JSON.stringify({ result: { messages } }), stderr: '' })
      const result = await source.poll()
      expect(result).toHaveLength(0)
    })
  })

  describe('poll - combined', () => {
    it('should return mixed filter result', async () => {
      const messages = [
        { id: 10, from_user: 'baobei', to_user: 'claude', acked: false, content: 'direct', created_at: '' },
        { id: 11, from_user: 'baobei', to_user: 'all', acked: false, content: 'broadcast', created_at: '' },
        { id: 12, from_user: 'kimi', to_user: 'claude', acked: false, content: 'direct kimi', created_at: '' },
        { id: 13, from_user: 'baobei', to_user: 'claude', acked: true, content: 'acked', created_at: '' },
        { id: 14, from_user: 'baobei', to_user: 'kimi', acked: false, content: 'for kimi', created_at: '' },
        { id: 15, from_user: 'claude', to_user: 'claude', acked: false, content: 'self', created_at: '' },
      ]
      execFile.mockResolvedValue({ stdout: JSON.stringify({ result: { messages } }), stderr: '' })
      const result = await source.poll()
      expect(result).toHaveLength(3)
      const ids = result.map(m => m.id).sort()
      expect(ids).toEqual([10, 11, 12])
    })
  })
})
