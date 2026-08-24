// tests/unit/os-detect.test.js — vitest unit tests for os-detect
//
// Phase 3 — 多平台支持 (user 8/24 13:50 SGT 反馈)
// 验证自动检测 Windows / Linux / macOS + env var 覆盖

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'os'
import {
  detectPlatform,
  getBashPath,
  getCollabPath,
  isWindows,
  isMacOS,
} from '../../src/os-detect.js'

describe('os-detect', () => {
  describe('detectPlatform', () => {
    it('should detect current platform', () => {
      const result = detectPlatform()
      expect(result.platform).toBe(process.platform)
      expect(result.homeDir).toBe(os.homedir())
      expect(typeof result.defaultBashPath).toBe('string')
      expect(typeof result.defaultCollabPath).toBe('string')
    })

    it('should return Windows paths on win32', () => {
      // Mock process.platform
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      const result = detectPlatform()
      expect(result.platform).toBe('win32')
      expect(result.defaultBashPath).toContain('bash.exe')
      expect(result.defaultCollabPath).toMatch(/^[A-Z]:\//i) // Windows drive letter
      expect(result.pathSeparator).toBe('/')

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('should return Linux paths on linux', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })

      const result = detectPlatform()
      expect(result.platform).toBe('linux')
      expect(result.defaultBashPath).toBe('/bin/bash')
      // On Linux, defaultCollabPath should NOT have Windows-style backslashes
      // (it's environment-dependent whether it starts with / or has Windows drive letter,
      // so we just check for the myopenclaw component + POSIX path)
      expect(result.defaultCollabPath).toContain('myopenclaw/scripts/mcp-collab-claude.sh')
      expect(result.defaultCollabPath).not.toContain('\\')

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('should return macOS paths on darwin', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'darwin' })

      const result = detectPlatform()
      expect(result.platform).toBe('darwin')
      expect(result.defaultBashPath).toBe('/bin/bash')
      expect(result.defaultCollabPath).toContain('myopenclaw/scripts/mcp-collab-claude.sh')
      expect(result.defaultCollabPath).not.toContain('\\')

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })
  })

  describe('getBashPath', () => {
    it('should use config override (highest priority)', () => {
      const result = getBashPath('/custom/bash/path')
      expect(result).toBe('/custom/bash/path')
    })

    it('should use env var CLAUDE_BASH_PATH', () => {
      const original = process.env.CLAUDE_BASH_PATH
      process.env.CLAUDE_BASH_PATH = '/env/bash/path'
      const result = getBashPath()
      expect(result).toBe('/env/bash/path')
      if (original === undefined) delete process.env.CLAUDE_BASH_PATH
      else process.env.CLAUDE_BASH_PATH = original
    })

    it('should use env var CCP_BASH_PATH', () => {
      const original = process.env.CCP_BASH_PATH
      process.env.CCP_BASH_PATH = '/ccp/bash/path'
      const result = getBashPath()
      expect(result).toBe('/ccp/bash/path')
      if (original === undefined) delete process.env.CCP_BASH_PATH
      else process.env.CCP_BASH_PATH = original
    })

    it('should fall back to detected default', () => {
      const original1 = process.env.CLAUDE_BASH_PATH
      const original2 = process.env.CCP_BASH_PATH
      delete process.env.CLAUDE_BASH_PATH
      delete process.env.CCP_BASH_PATH
      const result = getBashPath()
      expect(result).toBe(detectPlatform().defaultBashPath)
      if (original1 !== undefined) process.env.CLAUDE_BASH_PATH = original1
      if (original2 !== undefined) process.env.CCP_BASH_PATH = original2
    })
  })

  describe('getCollabPath', () => {
    it('should use config override (highest priority)', () => {
      const result = getCollabPath('/custom/collab/path.sh')
      expect(result).toBe('/custom/collab/path.sh')
    })

    it('should use env var CLAUDE_COLLAB', () => {
      const original = process.env.CLAUDE_COLLAB
      process.env.CLAUDE_COLLAB = '/env/collab/path.sh'
      const result = getCollabPath()
      expect(result).toBe('/env/collab/path.sh')
      if (original === undefined) delete process.env.CLAUDE_COLLAB
      else process.env.CLAUDE_COLLAB = original
    })

    it('should use env var CCP_COLLAB_SCRIPT', () => {
      const original = process.env.CCP_COLLAB_SCRIPT
      process.env.CCP_COLLAB_SCRIPT = '/ccp/collab/path.sh'
      const result = getCollabPath()
      expect(result).toBe('/ccp/collab/path.sh')
      if (original === undefined) delete process.env.CCP_COLLAB_SCRIPT
      else process.env.CCP_COLLAB_SCRIPT = original
    })

    it('should fall back to detected default', () => {
      const original1 = process.env.CLAUDE_COLLAB
      const original2 = process.env.CCP_COLLAB_SCRIPT
      delete process.env.CLAUDE_COLLAB
      delete process.env.CCP_COLLAB_SCRIPT
      const result = getCollabPath()
      expect(result).toBe(detectPlatform().defaultCollabPath)
      if (original1 !== undefined) process.env.CLAUDE_COLLAB = original1
      if (original2 !== undefined) process.env.CCP_COLLAB_SCRIPT = original2
    })
  })

  describe('isWindows / isMacOS / isLinux', () => {
    it('isWindows should return true on win32', () => {
      const original = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })
      expect(isWindows()).toBe(true)
      Object.defineProperty(process, 'platform', { value: original })
    })

    it('isWindows should return false on linux', () => {
      const original = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(isWindows()).toBe(false)
      Object.defineProperty(process, 'platform', { value: original })
    })

    it('isMacOS should return true on darwin', () => {
      const original = process.platform
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(isMacOS()).toBe(true)
      Object.defineProperty(process, 'platform', { value: original })
    })

    it('isLinux should return true on linux', async () => {
      const { isLinux } = await import('../../src/os-detect.js')
      const original = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(isLinux()).toBe(true)
      Object.defineProperty(process, 'platform', { value: original })
    })
  })
})