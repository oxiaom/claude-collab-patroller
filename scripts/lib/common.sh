#!/bin/bash
# common.sh — 共享工具 for claude-collab-patroller
# 仿 claude-code-telegrammer lib/common.sh (logging + env guard + YAML parsing).
# 来源: claude-code-telegrammer 2026-04-10, license AGPL-3.0.

set -euo pipefail

# ── Constants ─────────────────────────────────────────
export CCP_VERSION="0.1.0"
CCP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CCP_DIR
CCP_LOG_DIR="${CCP_LOG_DIR:-${HOME}/.claude/patrol/logs}"
mkdir -p "$CCP_LOG_DIR"

# ── Logging (telegrammer common.sh log_info/warn/error/debug) ──
log() {
  local level="$1"
  shift
  printf '[%s] [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$level" "$*" >> "$CCP_LOG_DIR/ccp.log" 2>&1
  if [[ "${CCP_LOG_STDOUT:-0}" == "1" ]]; then
    printf '[%s] [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$level" "$*" >&2
  fi
}

log_info()  { log "INFO"  "$@"; }
log_warn()  { log "WARN"  "$@"; }
log_error() { log "ERROR" "$@"; }
log_debug() { [[ "${CCP_DEBUG:-0}" == "1" ]] && log "DEBUG" "$@"; return 0; }

# ── Env guard (telegrammer fails-loud #1: unexpanded ${…}) ──
# 检查关键 env var 有没有未展开的 ${…} 占位符 (launcher 没 source .env)
env_guard() {
  local guard_failed=0
  for var in "$@"; do
    local val="${!var:-}"
    if [[ "$val" == *'${'* ]]; then
      log_error "env guard failed: $var='$val' contains unexpanded \${…} placeholder"
      guard_failed=1
    fi
  done
  return $guard_failed
}

# ── Resolve script absolute path (跨平台, 兼容 Git Bash + Windows) ──
resolve_path() {
  local p="$1"
  if command -v cygpath &>/dev/null; then
    cygpath -w "$p" 2>/dev/null || echo "$p"
  else
    echo "$p"
  fi
}
