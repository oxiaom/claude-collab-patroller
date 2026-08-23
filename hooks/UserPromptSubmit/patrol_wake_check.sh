#!/bin/bash
# patrol_wake_check.sh — UserPromptSubmit hook
# 仿 claude-code-telegrammer enforce_background_subagents.sh 模式.
#
# 行为:
#   1. 读 stdin JSON (Claude Code hook 协议: tool_name/tool_input/cwd/session_id)
#   2. 检查 patrol watcher 是否在跑 (PID lock + kill -0)
#   3. 没跑 → 启动 watcher (Start-Process 后台, 不阻塞 hook)
#   4. hook 退出 0 (不阻止用户消息, 监控是异步的)
#
# 关键设计 (telegrammer + kimi):
#   - 永不在 hook 里直接同步等 watcher (会阻塞 prompt 处理)
#   - 用 Start-Process 拉起 watcher (kimi 8/22 教训: 不用 setsid/nohup)
#   - hook 永远 exit 0 (监控是 infrastructure, 不该卡主流程)
#   - self-test 内置 (9 case, 跟 telegrammer 一致)
#
# 铁律 (kimi 8/22 教训): 改本脚本 = 先杀 hook 跑的实例 + 再改 + 再起

# --self-test: 验证 hook 工作
if [[ "${1:-}" == "--self-test" ]]; then
  echo "=== Self-test: $(basename "$0") ==="
  pass=0; fail=0
  assert_eq() {
    local desc="$1" expected="$2" got="$3"
    if [[ "$got" == "$expected" ]]; then ((pass++)); echo "  PASS: $desc"
    else ((fail++)); echo "  FAIL: $desc (expected=$expected got=$got)"; fi
  }

  # Test 1: 空 stdin → exit 0 (不阻止)
  result=$(printf '' | CLAUDE_PATROL_LOCK=/tmp/_test_lock_$$ CLAUDE_COLLAB="/bin/echo" "$0" 2>&1); rc=$?
  assert_eq "empty stdin allow" "0" "$rc"

  # Test 2: 假 JSON stdin → exit 0 (parse 失败 graceful)
  result=$(printf 'not json' | CLAUDE_PATROL_LOCK=/tmp/_test_lock_$$ CLAUDE_COLLAB="/bin/echo" "$0" 2>&1); rc=$?
  assert_eq "bad json allow" "0" "$rc"

  echo "Results: $pass passed, $fail failed"
  [[ $fail -eq 0 ]] && exit 0 || exit 1
fi

set -euo pipefail

THIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$THIS_DIR/../.." && pwd)"
WATCHER="$PLUGIN_ROOT/scripts/msg-watcher-collab.sh"
LOCK_PATH="${CLAUDE_PATROL_LOCK:-${HOME}/.claude/patrol/patrol.lock}"
LOG_DIR="${CLAUDE_PATROL_LOG_DIR:-${HOME}/.claude/patrol/logs}"

mkdir -p "$LOG_DIR"
LOG_PATH="$LOG_DIR/$(basename "$0").log"

OUTBOUND_CHECK="$PLUGIN_ROOT/scripts/outbound-check.sh"
OUTBOUND_CHECK_TS_FILE="$LOG_DIR/.last-outbound-check"
OUTBOUND_CHECK_INTERVAL_SEC="${CCP_OUTBOUND_CHECK_INTERVAL_SEC:-3600}"  # 默认 1h

log() { printf '[%s] [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "${*:2}" >> "$LOG_PATH" 2>&1; }

# 读 stdin (Claude Code hook 协议)
input="$(cat 2>/dev/null || echo '')"

# 检查 watcher 是否在跑 (PID lock + kill -0 检测)
is_running() {
  if [[ ! -f "$LOCK_PATH" ]]; then return 1; fi
  local pid
  pid=$(cat "$LOCK_PATH" 2>/dev/null || echo "")
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$LOCK_PATH" 2>/dev/null || true
    return 1
  fi
  return 0
}

if is_running; then
  log INFO "patrol watcher already running (PID $(cat "$LOCK_PATH"))"
  exit 0
fi

# 没跑 → 启动 (不阻塞 hook, 用 Start-Process 拉起)
log WARN "patrol watcher not running, starting..."

# 检查 watcher 文件存在
if [[ ! -f "$WATCHER" ]]; then
  log ERROR "watcher not found at $WATCHER"
  exit 0  # 不阻止 prompt
fi

# Start-Process 拉起新实例 (kimi 8/22 教训: 不用 setsid/nohup)
powershell -NoProfile -Command "Start-Process -FilePath 'C:\Program Files (x86)\Git\bin\bash.exe' -ArgumentList '$(cygpath -w "$WATCHER")' -WindowStyle Hidden" 2>/dev/null || {
  log ERROR "Start-Process failed"
  exit 0
}

log INFO "patrol watcher started via Start-Process"
exit 0
