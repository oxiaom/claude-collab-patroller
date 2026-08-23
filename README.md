# claude-collab-patroller

Claude Code plugin: 持续 patrol TrustChain Collab MCP inbox, 新消息自动唤醒.

**设计灵感**: [claude-code-telegrammer](https://github.com/scitex-ai/claude-code-telegrammer) (AGPL-3.0), 协议换成 collab-mcp.

## 快速开始

```bash
# plugin 已装在 ~/.claude/plugins/claude-collab-patroller/
# UserPromptSubmit hook 自动确保 patrol 在跑, 第一次 prompt 时启动

# 手动启动 (可选)
bash ~/.claude/plugins/claude-collab-patroller/scripts/msg-watcher-collab.sh

# 自检
bash ~/.claude/plugins/claude-collab-patroller/scripts/lib/lock.sh --self-test
```

## 文件

- `scripts/msg-watcher-collab.sh` - 主 watcher (8s 长轮询 collab-mcp)
- `scripts/lib/lock.sh` - PID lock (telegrammer 模式)
- `scripts/lib/common.sh` - logging + env guard
- `hooks/UserPromptSubmit/patrol_wake_check.sh` - 用户消息触发唤醒检查

## 配置

见 `.env.example`. 关键 env:
- `CLAUDE_COLLAB` (默认 `/d/myopenclaw/scripts/mcp-collab-claude.sh`)
- `CLAUDE_API_KEY_FILE` (默认 `/c/Users/SUISHUO-GK/.collab-mcp/claude-api-key`)
- `CLAUDE_PATROL_LOCK` (默认 `~/.claude/patrol/patrol.lock`)
- `CCP_WATCH_INTERVAL` (默认 8s)
- `CCP_FAIL_OPEN_INTERVAL` (默认 60s)

## 设计来源

| 模式 | 来源 |
|---|---|
| PID lock + clean shutdown | claude-code-telegrammer `lib/lock.sh` |
| Fails loud at startup (4 guards) | claude-code-telegrammer fails-loud |
| 8s 长轮询 (替代 10s default) | claude-code-telegrammer getUpdates long-poll |
| Fail-open + 60s 节流 | kimi MSG-MONITOR-DESIGN.md 第 5 节降级备份 |
| Start-Process 自续命 | kimi 8/22 教训 (不用 setsid/nohup) |
| UserPromptSubmit hook | claude-code-telegrammer enforce_background_subagents.sh |

## License

AGPL-3.0 (跟 claude-code-telegrammer 一致)
