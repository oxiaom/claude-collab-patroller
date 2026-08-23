#!/bin/bash
# lock.sh — PID lock 管理 for claude-collab-patroller
# 仿 claude-code-telegrammer lib/lock.sh (acquire_lock / release_lock / check_stale).
# 来源: claude-code-telegrammer 2026-04-10, license AGPL-3.0.

set -euo pipefail

DEFAULT_LOCK_PATH="${CLAUDE_PATROL_LOCK:-${HOME}/.claude/patrol/patrol.lock}"

# ── Acquire lock ──────────────────────────────────────
acquire_lock() {
  local lock_path="${1:-$DEFAULT_LOCK_PATH}"
  local lock_dir
  lock_dir=$(dirname "$lock_path")
  mkdir -p "$lock_dir"

  if [[ -f "$lock_path" ]]; then
    local existing_pid
    existing_pid=$(cat "$lock_path" 2>/dev/null || echo "")
    if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
      log_error "Lock held by PID $existing_pid ($lock_path)"
      return 1
    else
      log_warn "Removing stale lock (PID $existing_pid no longer running)"
      rm -f "$lock_path"
    fi
  fi

  echo "$$" > "$lock_path"
  log_info "Lock acquired (PID $$)"
  return 0
}

# ── Release lock ───────────────────────────────────────
release_lock() {
  local lock_path="${1:-$DEFAULT_LOCK_PATH}"

  if [[ ! -f "$lock_path" ]]; then return 0; fi

  local lock_pid
  lock_pid=$(cat "$lock_path" 2>/dev/null || echo "")

  if [[ "$lock_pid" == "$$" ]]; then
    rm -f "$lock_path"
    log_info "Lock released"
  else
    log_warn "Lock owned by PID $lock_pid, not releasing (we are $$)"
  fi

  return 0
}

# ── Check if locked ────────────────────────────────────
is_locked() {
  local lock_path="${1:-$DEFAULT_LOCK_PATH}"

  if [[ ! -f "$lock_path" ]]; then return 1; fi

  local lock_pid
  lock_pid=$(cat "$lock_path" 2>/dev/null || echo "")

  if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
    return 0
  fi

  return 1
}

# ── Self-test (telegrammer 模式) ──────────────────────
if [[ "${1:-}" == "--self-test" ]]; then
  if ! declare -f log_info &>/dev/null; then
    log_info() { echo "[INFO]  $*"; }
    log_warn() { echo "[WARN]  $*"; }
    log_error() { echo "[ERROR] $*"; }
    log_debug() { :; }
  fi

  tmplock=$(mktemp /tmp/claude-collab-patroller-lock-test.XXXXXX)
  rm -f "$tmplock"

  echo "lock self-test"
  echo "=============="

  is_locked "$tmplock" && echo "  FAIL: not locked initially" || echo "  PASS: not locked initially"

  acquire_lock "$tmplock"
  is_locked "$tmplock" && echo "  PASS: locked after acquire" || echo "  FAIL: locked after acquire"

  release_lock "$tmplock"
  is_locked "$tmplock" && echo "  FAIL: unlocked after release" || echo "  PASS: unlocked after release"

  # Stale lock detection
  echo "99999999" > "$tmplock"
  is_locked "$tmplock" && echo "  FAIL: stale lock treated as locked" || echo "  PASS: stale lock treated as unlocked"

  rm -f "$tmplock"
  echo "=============="
fi
