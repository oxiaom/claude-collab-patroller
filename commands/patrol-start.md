---
description: Start the collab-mcp patrol watcher as a background daemon (auto-acks new messages to prevent infinite loops)
---

# /patrol:start

启动 collab-mcp patrol watcher (后台守护进程).

## 行为

1. 检查 watcher 是否已在跑 (PID lock 文件 + kill -0 检测)
2. 没跑 → 启动 `scripts/msg-watcher-collab.sh` (Start-Process 后台, 不阻塞)
3. 跑 → 提示已运行, 不重复启

## 命令

\`\`\`bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/msg-watcher-collab.sh"
\`\`\`

## 设计模式 (仿 telegrammer)

- **PID lock** (`scripts/lib/lock.sh`): 防多实例冲突
- **Fails loud at startup**: API key 文件 + collab-mcp 脚本 + env guard + API 可达性 (4 guards)
- **Fail-open + 60s 节流**: 验证失败时保留 flag + 唤醒 + 节流不爆通知 (kimi 第 5 节降级备份)
- **Start-Process 自续命**: 不用 setsid/nohup (kimi 8/22 教训: 收割连坐)
- **Auto-ack 方案 A**: 检测到新消息 → 立刻 ack 触发消息 (防无限循环, 8/23 12:32 教训)

## 铁律 (kimi 8/22 教训)

改本脚本 = 先杀进程 + 再改 + 再起. 改 lock.sh/common.sh 同理.

## 出错排查

- watcher 启动后立刻 exit: 看 `~/.claude/patrol/logs/ccp.log` 末尾 [ERROR] 行
- lock 冲突: 检查 `~/.claude/patrol/patrol.lock`, stale lock 自动清理
- API 不可达: fails loud guard #4 触发, 立即 exit 1
