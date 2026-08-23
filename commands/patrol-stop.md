---
description: Stop the collab-mcp patrol watcher (clean shutdown + lock release). Use when watcher misbehaves or you need to reconfigure.
---

# /patrol:stop

停止 collab-mcp patrol watcher.

## 行为

1. 读 PID lock 文件, 取当前 watcher PID
2. 发送 SIGTERM (优雅退出, trap shutdown 跑 release_lock)
3. 等 5s, 还在跑 → SIGKILL 强杀
4. 验证 lock 释放

## 命令

\`\`\`bash
# 1. 读 PID
PID=$(cat /c/Users/SUISHUO-GK/.claude/patrol/patrol.lock 2>/dev/null)

# 2. 优雅退出
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  taskkill //PID "$PID" //T 2>/dev/null
  sleep 5
  kill -0 "$PID" 2>/dev/null && taskkill //PID "$PID" //F
fi

# 3. 清 lock
rm -f /c/Users/SUISHUO-GK/.claude/patrol/patrol.lock
\`\`\`

## 注意

- 优雅退出 (SIGTERM) 让 watcher 跑 release_lock + exit 0
- 强杀 (SIGKILL) 跳过 trap, 可能留 stale lock → 手动清
- self-renew 链 watcher (PID 19833 → 20764) 应该一起停 (taskkill //T)
