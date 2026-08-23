#!/bin/bash
# msg-watcher-collab.sh — claude-collab-patroller 主 watcher
# 仿 claude-code-telegrammer 设计 (PID lock + clean shutdown + fails loud + 8s 长轮询)
# 协议: collab-mcp (mcp-collab-claude.sh, claude 物理隔离 Lesson #110).
# 来源设计: claude-code-telegrammer 2026-04-10, license AGPL-3.0.
#
# 铁律 (kimi 8/22 教训): 改本脚本 = 先杀进程 + 再改 + 再起. 改 lock.sh/common.sh 同理.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# Source telegrammer-style lib (从 plugin 内, 不用 ~/.claude/patrol/ 老路径)
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/lock.sh"

# ── Config (claude 物理隔离: mcp-collab-claude.sh + claude-api-key) ──
COLLAB="${CLAUDE_COLLAB:-/d/myopenclaw/scripts/mcp-collab-claude.sh}"
INTERVAL="${CCP_WATCH_INTERVAL:-8}"
FAIL_OPEN_INTERVAL="${CCP_FAIL_OPEN_INTERVAL:-60}"
API_KEY_FILE="${CLAUDE_API_KEY_FILE:-/c/Users/SUISHUO-GK/.collab-mcp/claude-api-key}"

# ── Fails loud at startup (telegrammer fails-loud 模式) ──
# Guard #1: API key 文件存在
if [[ ! -f "$API_KEY_FILE" ]]; then
  log_error "FATAL: claude-api-key not found at $API_KEY_FILE (Lesson #110 物理隔离)"
  exit 1
fi

# Guard #2: collab-mcp 脚本存在
if [[ ! -x "$COLLAB" && ! -f "$COLLAB" ]]; then
  log_error "FATAL: mcp-collab-claude.sh not found at $COLLAB"
  exit 1
fi

# Guard #3: env var unexpanded ${…} (telegrammer fails-loud #1)
if ! env_guard "CLAUDE_PATROL_LOCK" "CLAUDE_COLLAB" 2>/dev/null; then
  log_error "FATAL: unexpanded \${…} placeholder in env vars"
  exit 1
fi

# Guard #4: API 可达性 (telegrammer fails-loud: getMe 类比 → list-pending)
if ! "$COLLAB" list-pending --type messages &>/dev/null; then
  log_error "FATAL: collab-mcp API not reachable at startup"
  exit 1
fi

# ── Acquire lock ──
acquire_lock || { log_error "Another instance running"; exit 1; }

log_info "claude-collab-patroller started (PID $$, interval=${INTERVAL}s, collab=$COLLAB)"

# ── Clean shutdown (telegrammer shutdown + kimi 教训) ──
shutdown() {
  log_info "Shutting down (PID $$, signal $1)"
  release_lock
  exit 0
}
trap 'shutdown SIGTERM' SIGTERM
trap 'shutdown SIGINT' SIGINT

# ── Main loop: 长轮询 collab-mcp list-pending ──
while true; do
  # 接受消息: collab-mcp list-pending (替代 telegrammer getUpdates long-poll)
  resp=$("$COLLAB" list-pending --type messages 2>/dev/null || echo "")

  if [[ -z "$resp" ]]; then
    sleep "$INTERVAL"
    continue
  fi

  # Parse: 找 to_user=claude && !acked && from_user!=claude (排除自己发的)
  has_mine=$(echo "$resp" | python -c "
import json, sys
try:
  d = json.load(sys.stdin)
  msgs = d.get('result', {}).get('messages', [])
  mine = [m for m in msgs if not m.get('acked') and m.get('to_user') == 'claude' and m.get('from_user') != 'claude']
  if mine:
    print(f'YES:{mine[0][\"id\"]}:{mine[0][\"from_user\"]}')
  else:
    print('NO')
except Exception as e:
  print(f'FAIL:{str(e)[:80]}')
" 2>/dev/null || echo "FAIL:parse-error")

  if [[ "$has_mine" == YES:* ]]; then
    msg_info=${has_mine#YES:}
    msg_id=${msg_info%%:*}
    msg_from=${msg_info#*:}
    log_info "WAKE: msg #$msg_id from $msg_from for claude"

    # 方案 A: 立刻 ack 触发此 WAKE 的消息, 防无限循环 (8/23 12:32 教训)
    if ack_output=$("$COLLAB" ack --id "$msg_id" 2>&1); then
      if [[ "$ack_output" == *'"ok": true'* ]] || [[ "$ack_output" == *'"acked": 1'* ]]; then
        log_info "acked #$msg_id (防无限循环)"
      else
        log_warn "ack #$msg_id 异常: $ack_output"
      fi
    else
      log_error "ack #$msg_id 命令失败, 仍自续命 (下一轮会重复触发)"
    fi

    # 释放 lock 让自续命新实例能拿到 (8/23 12:37 教训: 不释放会留 stale lock 冲突)
    release_lock

    # 🆕 v0.6.0 升级: Auto-process 模式 — Start-Process claude --print 处理新消息
    # 之前 bug: 只 ack + 自续命 + exit 0, claude 主 session 不知道有消息
    # 现在: 每次新消息自动 spawn 一个 claude --print 实例, 处理消息后退出
    # 优点: 不依赖 user prompt 触发 UserPromptSubmit hook, 不依赖主 session 主动 list-pending
    # 限制: 是 "auto-process" (spawn 新 claude 实例) 不是 "auto-wake main session" (注入主 session)
    #       因为 claude-code 当前没暴露从外部注入到 running session 的机制
    wake_prompt="[PATROL-WAKE · msg #${msg_id} from ${msg_from}] 跑: bash D:/myopenclaw/scripts/mcp-collab-claude.sh read --from ${msg_from} --limit 1 拿完整内容, 按 Auto-work-and-reply 铁律处理 (Read → Work → Reply → Memory). 本 msg 已被 watcher auto-ack 标已读, 你直接处理内容即可. 处理完 exit."
    powershell -NoProfile -Command "Start-Process -FilePath 'claude' -ArgumentList '--print', '${wake_prompt}' -WindowStyle Hidden" 2>/dev/null
    if [[ $? -eq 0 ]]; then
      log_info "auto-process spawned: claude --print for msg #$msg_id"
    else
      log_warn "auto-process Start-Process failed (msg #$msg_id), 仍 self-renew"
    fi

    # Self-renew via Start-Process (kimi 8/22 教训: 不用 setsid/nohup, 收割连坐)
    powershell -NoProfile -Command "Start-Process -FilePath 'C:\Program Files (x86)\Git\bin\bash.exe' -ArgumentList '$(cygpath -w "$SCRIPT_DIR/$SCRIPT_NAME" 2>/dev/null || echo "$SCRIPT_DIR/$SCRIPT_NAME")' -WindowStyle Hidden" 2>/dev/null
    exit 0
  elif [[ "$has_mine" == "NO" ]]; then
    sleep "$INTERVAL"
  else
    # Fail-open (kimi 8/22 16:46 教训: 不可漏消息, 宁可错醒)
    log_warn "WAKE-UNVERIFIED: $has_mine, fail-open ${FAIL_OPEN_INTERVAL}s 节流"
    sleep "$FAIL_OPEN_INTERVAL"
    powershell -NoProfile -Command "Start-Process -FilePath 'C:\Program Files (x86)\Git\bin\bash.exe' -ArgumentList '$(cygpath -w "$SCRIPT_DIR/$SCRIPT_NAME" 2>/dev/null || echo "$SCRIPT_DIR/$SCRIPT_NAME")' -WindowStyle Hidden" 2>/dev/null
    exit 0
  fi
done
