---
description: Show collab-mcp patrol watcher status (PID + lock + log tail + inbox unacked count)
---

# /patrol:status

显示 collab-mcp patrol watcher 状态.

## 输出

1. PID lock 文件存在? → watcher 在跑 PID
2. kill -0 PID → 是否真活
3. self-renew 子进程列表 (tasklist filter msg-watcher-collab)
4. 最新 log 10 行 (ccp.log tail)
5. inbox 未 ack 消息数 (mcp-collab-claude.sh list-pending)

## 命令

\`\`\`bash
# PID
PID=$(cat /c/Users/SUISHUO-GK/.claude/patrol/patrol.lock 2>/dev/null)
echo "PID: $PID"
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  echo "Status: ✅ running"
else
  echo "Status: ❌ not running (lock stale or missing)"
fi

# log tail
tail -10 /c/Users/SUISHUO-GK/.claude/patrol/logs/ccp.log 2>&1

# inbox unacked
bash /d/myopenclaw/scripts/mcp-collab-claude.sh list-pending --type messages 2>&1 | python -c "
import json, sys
d = json.load(sys.stdin)
to_me = [m for m in d['result']['messages'] if m['to_user'] in ('claude','all') and not m.get('acked')]
print(f'Inbox unacked to me: {len(to_me)}')
"
\`\`\`

## 故障排查

- **Lock 存在但 PID 不活**: stale lock, 手动 `rm -f` 后重启
- **Watcher 在跑但 inbox 没触发**: 检查 `--from baobei/kimi/xiaomu` 跟 `to_user` 是否匹配
- **无限循环 log (多条 WAKE 同 ID)**: 旧版本 (方案 A 之前), 重启 + 升级到方案 A
