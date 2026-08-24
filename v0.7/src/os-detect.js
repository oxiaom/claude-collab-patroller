// os-detect.js — 跨平台 OS 自动检测 + 默认路径
//
// 自动识别 Windows / Linux / macOS + 返回适合的默认路径
// 用户可通过 env var 覆盖: CLAUDE_COLLAB / CLAUDE_BASH_PATH
//
// 设计原则 (Phase 3 — 多平台支持):
//   - 检测 process.platform (node 内置, 跨平台)
//   - 优先用 env var (灵活性)
//   - fallback 到平台特定默认路径
//   - Linux/macOS 用 POSIX path, Windows 用 forward slash (Node.js 都接受)
//   - bash 路径: Windows = Git Bash, Linux/macOS = /bin/bash

const os = require('os')
const path = require('path')

/**
 * Detect platform and return default paths
 * @returns {Object} { platform, defaultBashPath, defaultCollabPath, homeDir }
 */
function detectPlatform() {
  const platform = process.platform // 'win32' | 'linux' | 'darwin' | etc.
  const homeDir = os.homedir() // cross-platform home dir

  let defaultBashPath
  let defaultCollabPath
  let pathSeparator

  switch (platform) {
    case 'win32':
      // Windows: Git Bash 默认装在 C:\Program Files (x86)\Git\bin\bash.exe
      // 但 64-bit Git 也可能在 C:\Program Files\Git\bin\bash.exe
      defaultBashPath = 'C:/Program Files (x86)/Git/bin/bash.exe'
      // Windows 上 mcp-collab-claude.sh 通常在 D:\myopenclaw\scripts\
      defaultCollabPath = 'D:/myopenclaw/scripts/mcp-collab-claude.sh'
      pathSeparator = '/'
      break

    case 'darwin':
      // macOS: bash 通常在 /bin/bash (system) 或 /opt/homebrew/bin/bash (Homebrew)
      defaultBashPath = '/bin/bash'
      // macOS 上 mcp-collab-claude.sh 通常在 ~/myopenclaw/scripts/
      // 用 POSIX path (forward slash), 不是 path.join (会受 platform separator 影响)
      const macHome = homeDir.replace(/\\/g, '/')
      defaultCollabPath = `${macHome}/myopenclaw/scripts/mcp-collab-claude.sh`
      pathSeparator = '/'
      break

    case 'linux':
    default:
      // Linux: bash 通常在 /bin/bash
      defaultBashPath = '/bin/bash'
      // Linux 上 mcp-collab-claude.sh 通常在 /opt/myopenclaw/scripts/ 或 ~/myopenclaw/scripts/
      // 用 POSIX path (forward slash), 不是 path.join
      const linuxHome = homeDir.replace(/\\/g, '/')
      defaultCollabPath = process.env.CLAUDE_COLLAB_LINUX_DEFAULT
        || `${linuxHome}/myopenclaw/scripts/mcp-collab-claude.sh`
      pathSeparator = '/'
      break
  }

  return {
    platform,
    homeDir,
    defaultBashPath,
    defaultCollabPath,
    pathSeparator,
  }
}

/**
 * Get bash path with env override + auto-detect
 * @param {string} [configBashPath] explicit config override
 * @returns {string} bash executable path
 */
function getBashPath(configBashPath) {
  return configBashPath
    || process.env.CLAUDE_BASH_PATH
    || process.env.CCP_BASH_PATH
    || detectPlatform().defaultBashPath
}

/**
 * Get collab-mcp script path with env override + auto-detect
 * @param {string} [configScriptPath] explicit config override
 * @returns {string} collab-mcp script path
 */
function getCollabPath(configScriptPath) {
  return configScriptPath
    || process.env.CLAUDE_COLLAB
    || process.env.CCP_COLLAB_SCRIPT
    || detectPlatform().defaultCollabPath
}

/**
 * Check if running on Windows
 * @returns {boolean}
 */
function isWindows() {
  return process.platform === 'win32'
}

/**
 * Check if running on macOS
 * @returns {boolean}
 */
function isMacOS() {
  return process.platform === 'darwin'
}

/**
 * Check if running on Linux
 * @returns {boolean}
 */
function isLinux() {
  return process.platform === 'linux'
}

module.exports = {
  detectPlatform,
  getBashPath,
  getCollabPath,
  isWindows,
  isMacOS,
  isLinux,
}