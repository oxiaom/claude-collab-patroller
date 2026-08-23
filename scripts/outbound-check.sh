#!/bin/bash
# outbound-check.sh — claude outbound 消息回复状态检查
# 仿 claude-code-telegrammer monitor 模式.
#
# 用户 8/23 13:10 SGT 反馈: "所有人消息必须回复 (ack ≠ 回复),
#                         落实到代码层面, 否则对方阻塞等待".
#
# 算法:
#   1. 拉 from=claude 的所有 outbound 消息 (排除测试 message)
#   2. 对每条 to=user, 找后续 from=user, to=claude 的回复
#   3. 没回的 → 警告 (按"未回时长"降序)
#   4. 也反向: from=user, to=claude, 没 ack 没回 → 警告 (对方也阻塞)
#
# 跟 watcher 配合: 用户运行 /patrol:status 时也跑一次

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/common.sh"

COLLAB="${CLAUDE_COLLAB:-/d/myopenclaw/scripts/mcp-collab-claude.sh}"
HORIZON_MIN="${CCP_OUTBOUND_HORIZON_MIN:-60}"  # 默认 60 分钟前的 outbound

log_info "outbound-check started (horizon=${HORIZON_MIN}m)"

# 拉 outbound (from=claude) + inbound (to=claude) 全部
all_resp=$("$COLLAB" list-pending --type messages 2>/dev/null || echo "")

if [[ -z "$all_resp" ]]; then
  log_warn "empty response, skip"
  exit 0
fi

# Python parse
echo "$all_resp" | python -c "
import json, sys
from datetime import datetime, timezone

try:
    d = json.load(sys.stdin)
    msgs = d.get('result', {}).get('messages', [])
    horizon_sec = int('${HORIZON_MIN}') * 60
    now_ts = datetime.now(timezone.utc).timestamp()

    # 分两类
    outbound = [m for m in msgs if m.get('from_user') == 'claude']
    inbound = [m for m in msgs if m.get('to_user') == 'claude' and m.get('from_user') != 'claude']

    # 1. outbound 未回 (我发的, 没收到对方回复)
    unreplied = []
    for out in outbound:
        out_ts_str = out.get('created_at', '')
        try:
            out_ts = datetime.fromisoformat(out_ts_str.replace(' ', 'T')).timestamp()
        except Exception:
            continue
        if now_ts - out_ts < horizon_sec:
            continue  # 太近, 不算未回
        out_to = out.get('to_user', '?')
        # 找后续 from=out_to, to=claude
        reply = None
        for inb in inbound:
            if inb.get('from_user') != out_to:
                continue
            try:
                inb_ts = datetime.fromisoformat(inb.get('created_at', '').replace(' ', 'T')).timestamp()
            except Exception:
                continue
            if inb_ts > out_ts:
                reply = inb
                break
        if not reply:
            mins = int((now_ts - out_ts) / 60)
            unreplied.append({
                'id': out['id'],
                'to': out_to,
                'age_min': mins,
                'preview': out.get('content', '')[:80],
            })

    # 2. inbound 未回 (对方发我, 我没回, 对方阻塞)
    #    '回' = 我发了消息 (outbound), 任何消息都算 'ack of life'
    #    但要更精确: 找 to=对方 (follow-up), 或 to=all (broadcast)
    unreplied_by_me = []
    for inb in inbound:
        if inb.get('acked'):
            continue
        inb_ts_str = inb.get('created_at', '')
        try:
            inb_ts = datetime.fromisoformat(inb_ts_str.replace(' ', 'T')).timestamp()
        except Exception:
            continue
        if now_ts - inb_ts < horizon_sec:
            continue
        inb_from = inb.get('from_user', '?')
        # 找后续 from=claude, to=inb_from
        my_reply = None
        for out in outbound:
            if out.get('to_user') != inb_from:
                continue
            try:
                out_ts = datetime.fromisoformat(out.get('created_at', '').replace(' ', 'T')).timestamp()
            except Exception:
                continue
            if out_ts > inb_ts:
                my_reply = out
                break
        if not my_reply:
            mins = int((now_ts - inb_ts) / 60)
            unreplied_by_me.append({
                'id': inb['id'],
                'from': inb_from,
                'age_min': mins,
                'preview': inb.get('content', '')[:80],
            })

    # 输出
    print('=' * 70)
    print('📤 OUTBOUND 未回 (claude 发, 对方没回)')
    print('=' * 70)
    if not unreplied:
        print('✅ 全部已回')
    else:
        for u in sorted(unreplied, key=lambda x: -x['age_min']):
            print(f'  ⚠️ #{u[\"id\"]} → {u[\"to\"]} ({u[\"age_min\"]}m) | {u[\"preview\"]}...')

    print()
    print('=' * 70)
    print('📥 INBOUND 未回 (对方发 claude, claude 没回, 对方阻塞等待)')
    print('=' * 70)
    if not unreplied_by_me:
        print('✅ 全部已回')
    else:
        for u in sorted(unreplied_by_me, key=lambda x: -x['age_min']):
            print(f'  🚨 #{u[\"id\"]} ← {u[\"from\"]} ({u[\"age_min\"]}m 阻塞) | {u[\"preview\"]}...')
    print()
    print('=' * 70)

except Exception as e:
    print(f'FAIL: parse error {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1
