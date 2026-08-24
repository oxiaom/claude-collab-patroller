#!/bin/bash
# check-unreplied.sh — 检测 claude 是否漏回复 baobei/kimi/xiaomu 的 msg
#
# 核心逻辑 (Lesson #NEW-8/23-unreplied-detection):
#   "未回复" ≠ "未 ack"
#   - patrol watcher 可能已经 auto-ack 了 msg (acked=1), 但 main session 还没 send reply
#   - 必须检查 from baobei/kimi/xiaomu 的所有 to=claude msg, 跟 claude outbound 对比
#   - 没找到对应 outbound reply 的 = 漏回复
#
# 用法:
#   bash scripts/check-unreplied.sh           # 检查全部
#   bash scripts/check-unreplied.sh --fix    # 列出 + 显示建议回复
#
# 依赖: mcp-collab-claude.sh (claude 物理隔离 Lesson #110)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLAB="${CLAUDE_COLLAB:-/d/myopenclaw/scripts/mcp-collab-claude.sh}"
SENDERS=("baobei" "kimi" "xiaomu" "小木")
LIMIT=200

echo "=== 检查 claude 是否漏回复 ==="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# 1. 拿所有 from non-claude to claude 的 msg (含已 ack)
# Lesson #NEW-8/23-unreplied-detection: 必须用 read --from (含 acked=1), 不能用 list-pending (只返回 acked=0)
# 因为 patrol watcher 会 auto-ack, acked=1 但 main session 没 reply 也会漏掉
echo "[1/2] 读所有 from non-claude → claude msgs (含已 ack, 排除自发自收)..."

# 用 read --from 拿 baobei/kimi/xiaomu/小木 全部 (含 acked)
# read --from 返回 {"jsonrpc": "2.0", "result": [...]} — result 直接是 list
INBOX_RESULT=""
for sender in "${SENDERS[@]}"; do
    SENDER_MSGS=$(bash "$COLLAB" read --from "$sender" --limit "$LIMIT" 2>&1 | python -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)

# read --from 返回 d['result'] 是 list; list-pending 返回 d['result']['messages'] 是 list
if isinstance(d, dict):
    msgs = d.get('result', [])
    if isinstance(msgs, dict):
        msgs = msgs.get('messages', [])
elif isinstance(d, list):
    msgs = d
else:
    sys.exit(1)

RECV = 'claude'
for m in msgs:
    if m.get('from_user') == '$sender' and m.get('to_user') == RECV:
        print(f\"{m['id']}|{m['from_user']}|{m['to_user']}|{m.get('acked', 0)}|{m.get('created_at', '')}|{m.get('content', '')[:300]}\")
" 2>/dev/null)
    INBOX_RESULT="${INBOX_RESULT}${SENDER_MSGS}"$'\n'
done

# 去重 + 排序 (最新在前, 限制数量)
INBOX_RESULT=$(echo "$INBOX_RESULT" | grep -v '^$' | sort -t'|' -k1 -n -r | uniq | head -n "$LIMIT")

if [ -z "$INBOX_RESULT" ]; then
    echo "  (无相关 msg)"
    echo ""
    echo "✅ 没有漏回复的 msg"
    exit 0
fi

INBOX_COUNT=$(echo "$INBOX_RESULT" | wc -l)
echo "  找到 $INBOX_COUNT 条 from non-claude → claude msgs"

# 2. 拿 claude outbound (我 send 给 baobei/kimi/xiaomu 的)
echo ""
echo "[2/2] 读 claude outbound (to baobei/kimi/xiaomu)..."
OUTBOUND_JSON=$(bash "$COLLAB" read --from claude --limit 200 2>&1)

OUTBOUND_IDS=$(echo "$OUTBOUND_JSON" | python -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)

# read --from 返回 d['result'] 是 list; 兼容 dict 套 messages 形式
if isinstance(d, dict):
    msgs = d.get('result', [])
    if isinstance(msgs, dict):
        msgs = msgs.get('messages', [])
elif isinstance(d, list):
    msgs = d
else:
    sys.exit(1)

RECVS = {'baobei', 'kimi', 'xiaomu', '小木'}
ids = set()
contents = {}  # id → content (用于 inbound 引用检测)
for m in msgs:
    if m.get('to_user') in RECVS:
        mid = m['id']
        ids.add(mid)
        contents[mid] = m.get('content', '')

# 输出所有 claude outbound id + content (用于 inbound 引用检测)
for i in sorted(ids, reverse=True):
    print(f'{i}|{contents[i][:500]}')
" 2>/dev/null)

# 3. 对比: 每条 inbound 找对应 outbound (content 引用 / id 匹配 / 时间相关)
echo ""
echo "[3/3] 检测未回复 (inbound 没对应 outbound)..."
echo ""

UNREPLIED=0
TOTAL_INBOX=$(echo "$INBOX_RESULT" | grep -v '^$' | wc -l)
TOTAL_OUTBOX=$(echo "$OUTBOUND_IDS" | grep -v '^$' | wc -l)
PROCESSED=0
echo "$INBOX_RESULT" | while IFS='|' read -r msg_id from_user to_user acked created_at content; do
    if [ -z "$msg_id" ]; then continue; fi

    PROCESSED=$((PROCESSED + 1))

    # 启发式匹配: claude outbound content 是否引用 msg_id (e.g., "#16456" or "msg #$msg_id")
    has_reply=$(echo "$OUTBOUND_IDS" | grep -c "#$msg_id\b" || true)

    if [ "$has_reply" -eq 0 ]; then
        UNREPLIED=$((UNREPLIED + 1))
        echo "❌ 漏回复 #$msg_id"
        echo "   from: $from_user → to: $to_user"
        echo "   acked: $acked (patrol 是否已 auto-ack)"
        echo "   time: $created_at"
        echo "   content (前 200): ${content:0:200}..."
        echo ""
    fi
done

echo ""
echo "=== 检查完成 ==="
echo "  inbound (from non-claude): $TOTAL_INBOX"
echo "  outbound (to non-claude): $TOTAL_OUTBOX"
echo ""
echo "⚠️  上面标记 ❌ 的 = claude 漏回复, 需要 send reply"
echo "   (如果 msg 是 announce/broadcast 类可忽略, 但按协议 '有消息必回' 应该 ack + reply)"
