// tests/unit/sources-collab-mcp.test.js — vitest unit tests for CollabMCPSource
//
// Phase 3.1 重构 (v0.7.2): 测试 _parse 方法 (不 mock execFile, 不走 util.promisify)
// 之前 mock execFile 失败 (util.promisify + vi.mock 不兼容), 重构后 _parse 是纯函数, 测它即可
//
// 覆盖:
// - _parse JSON 解析
// - to_user filter (claude / all / allowlist)
// - acked filter (skip acked)
// - from_user filter (skip self)
// - 边界 (空数据 / 错 JSON / null result)

import { describe, it, expect, beforeEach } from 'vitest'
import CollabMCPSource from '../../src/sources/collab-mcp.js'

// Helper: build JSON stdout that mcp-collab-claude.sh list-pending 返回
const buildStdout = (messages) => JSON.stringify({
  jsonrpc: '2.0',
  result: { messages },
})

describe('CollabMCPSource._parse', () => {
  let source
  beforeEach(() => {
    source = new CollabMCPSource({
      scriptPath: 'D:/myopenclaw/scripts/mcp-collab-claude.sh',
      bashPath: 'C:/Program Files (x86)/Git/bin/bash.exe',
      allowToUsers: ['xiaomu', 'kimi'],
    })
  })

  describe('JSON 解析', () => {
    it('should return [] on invalid JSON', () => {
      const result = source._parse('not valid json {{{')
      expect(result).toEqual([])
    })

    it('should return [] when result missing', () => {
      const result = source._parse(JSON.stringify({ jsonrpc: '2.0' }))
      expect(result).toEqual([])
    })

    it('should return [] when messages missing', () => {
      const result = source._parse(JSON.stringify({ result: {} }))
      expect(result).toEqual([])
    })

    it('should return [] on empty messages array', () => {
      const result = source._parse(buildStdout([]))
      expect(result).toEqual([])
    })
  })

  describe('to_user filter (Phase 3.2 allowlist)', () => {
    it('should include msg to_user=claude', () => {
      const stdout = buildStdout([
        { id: 1, from_user: 'baobei', to_user: 'claude', acked: false, content: 'direct', created_at: '2026-08-24' }
      ])
      const result = source._parse(stdout)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
    })

    it('should include msg to_user=all (broadcast)', () => {
      const stdout = buildStdout([
        { id: 2, from_user: 'baobei', to_user: 'all', acked: false, content: 'broadcast', created_at: '2026-08-24' }
      ])
      const result = source._parse(stdout)
      expect(result).toHaveLength(1)
    })

    it('should include msg to_user in allowlist (xiaomu, kimi)', () => {
      const stdout = buildStdout([
        { id: 3, from_user: 'baobei', to_user: 'xiaomu', acked: false, content: 'cc1', created_at: '' },
        { id: 4, from_user: 'baobei', to_user: 'kimi', acked: false, content: 'cc2', created_at: '' },
      ])
      const result = source._parse(stdout)
      expect(result).toHaveLength(2)
    })

    it('should exclude msg to_user not in allowlist (e.g. 5pmr5)', () => {
      const stdout = buildStdout([
        { id: 5, from_user: 'baobei', to_user: '5pmr5', acked: false, content: 'nope', created_at: '' },
        { id: 6, from_user: 'baobei', to_user: 'stranger', acked: false, content: 'nope', created_at: '' },
      ])
      const result = source._parse(stdout)
      expect(result).toHaveLength(0)
    })
  })

  describe('acked filter', () => {
    it('should exclude acked=true msgs', () => {
      const stdout = buildStdout([
        { id: 7, from_user: 'baobei', to_user: 'claude', acked: true, content: 'acked', created_at: '' },
      ])
      const result = source._parse(stdout)
      expect(result).toHaveLength(0)
    })

    it('should exclude acked=1 (number) msgs', () => {
      const stdout = buildStdout([
        { id: 8, from_user: 'baobei', to_user: 'claude', acked: 1, content: 'acked int', created_at: '' },
      ])
      const result = source._parse(stdout)
      expect(result).toHaveLength(0)
    })
  })

  describe('from_user filter (skip self)', () => {
    it('should exclude self-messages (from_user=claude)', () => {
      const stdout = buildStdout([
        { id: 9, from_user: 'claude', to_user: 'claude', acked: false, content: 'self', created_at: '' },
        { id: 10, from_user: 'claude', to_user: 'all', acked: false, content: 'self broadcast', created_at: '' },
      ])
      const result = source._parse(stdout)
      expect(result).toHaveLength(0)
    })
  })

  describe('mapping (id / from / content / timestamp / source)', () => {
    it('should map mcp fields to source msg shape', () => {
      const stdout = buildStdout([
        { id: 11, from_user: 'baobei', to_user: 'claude', acked: false, content: 'hello', created_at: '2026-08-24T10:00:00Z' }
      ])
      const result = source._parse(stdout)
      expect(result[0]).toEqual({
        id: 11,
        from: 'baobei',
        content: 'hello',
        timestamp: '2026-08-24T10:00:00Z',
        source: 'collab-mcp',
        raw: expect.objectContaining({ id: 11, from_user: 'baobei' }),
      })
    })
  })

  describe('combined filter', () => {
    it('should apply all filters together', () => {
      const stdout = buildStdout([
        { id: 10, from_user: 'baobei', to_user: 'claude', acked: false, content: 'include', created_at: '' },
        { id: 11, from_user: 'baobei', to_user: 'all', acked: false, content: 'include', created_at: '' },
        { id: 12, from_user: 'kimi', to_user: 'claude', acked: false, content: 'include', created_at: '' },
        { id: 13, from_user: 'baobei', to_user: 'claude', acked: true, content: 'exclude', created_at: '' },
        { id: 14, from_user: 'baobei', to_user: 'kimi', acked: false, content: 'include (cc)', created_at: '' },
        { id: 15, from_user: 'baobei', to_user: 'stranger', acked: false, content: 'exclude', created_at: '' },
        { id: 16, from_user: 'claude', to_user: 'claude', acked: false, content: 'exclude self', created_at: '' },
      ])
      const result = source._parse(stdout)
      const ids = result.map(m => m.id).sort()
      // 10/11/12/14 should pass, 13/15/16 should be excluded
      expect(ids).toEqual([10, 11, 12, 14])
    })
  })

  describe('custom allowToUsers config', () => {
    it('should respect config.allowToUsers', () => {
      const customSource = new CollabMCPSource({
        scriptPath: 'D:/myopenclaw/scripts/mcp-collab-claude.sh',
        allowToUsers: ['custom1', 'custom2'],
      })
      const stdout = buildStdout([
        { id: 20, from_user: 'baobei', to_user: 'custom1', acked: false, content: 'ok', created_at: '' },
        { id: 21, from_user: 'baobei', to_user: 'xiaomu', acked: false, content: 'nope', created_at: '' },
        { id: 22, from_user: 'baobei', to_user: 'kimi', acked: false, content: 'nope', created_at: '' },
      ])
      const result = customSource._parse(stdout)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(20)
    })

    it('should respect CCP_ALLOW_TO_USERS env var', () => {
      const old = process.env.CCP_ALLOW_TO_USERS
      process.env.CCP_ALLOW_TO_USERS = 'env1,env2,env3'
      const envSource = new CollabMCPSource({
        scriptPath: 'D:/myopenclaw/scripts/mcp-collab-claude.sh',
      })
      const stdout = buildStdout([
        { id: 30, from_user: 'baobei', to_user: 'env1', acked: false, content: 'ok', created_at: '' },
        { id: 31, from_user: 'baobei', to_user: 'env2', acked: false, content: 'ok', created_at: '' },
        { id: 32, from_user: 'baobei', to_user: 'env3', acked: false, content: 'ok', created_at: '' },
        { id: 33, from_user: 'baobei', to_user: 'xiaomu', acked: false, content: 'nope', created_at: '' },
      ])
      const result = envSource._parse(stdout)
      expect(result).toHaveLength(3)
      if (old === undefined) delete process.env.CCP_ALLOW_TO_USERS
      else process.env.CCP_ALLOW_TO_USERS = old
    })
  })
})
