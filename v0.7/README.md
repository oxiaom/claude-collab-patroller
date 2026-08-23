# claude-collab-patroller-daemon v0.7.0

Persistent Node.js daemon for claude-collab-patroller plugin. Phase 1.2 (商用化 hardening).

## 为什么需要 v0.7.0

**v0.6.0 之前的实现**: bash watcher + Background Agent sub-agent.
- Bash watcher: PID lock + stale detection ✅, 但 580s Bash cap 限制
- Background Agent: 跑 580s 后自动退出, 不会 respawn

**v0.7.0 改进**:
- Node.js 进程, 7×24 持续 (不受 Bash cap 限制)
- PM2 / systemd / Windows Service 守护, crash 自动 restart
- 多 source (collab-mcp + telegram stub)
- 多 channel wake (file-marker + claude-print + send-message + webhook)
- HTTP /health endpoint for monitoring
- Structured JSON logging
- 优雅 shutdown (SIGTERM/SIGINT → finish current poll → exit)

## 架构

```
claude-collab-patroller-daemon (Node.js 进程)
├── pm2 / systemd / Windows Service (auto-restart)
├── src/
│   ├── daemon.js (entry, signal handling)
│   ├── config.js (env > config > defaults)
│   ├── logger.js (structured JSON logging)
│   ├── watcher.js (multi-source poll loop)
│   ├── wake.js (multi-channel dispatcher)
│   ├── instance-lock.js (single instance)
│   ├── dedupe.js (5-min dedupe window)
│   ├── health.js (HTTP /health)
│   └── sources/
│       ├── base.js (abstract)
│       ├── collab-mcp.js (Node.js port)
│       └── registry.js (source registry)
├── ecosystem.config.js (PM2)
├── package.json
└── README.md
```

## 安装

```bash
# 安装 Node.js 18+ (Windows / Linux / macOS)
node --version

# 安装依赖
npm install

# 安装 PM2 (持久化守护)
npm install -g pm2

# 配置 collab-mcp (跟 v0.6.0 一样)
export CLAUDE_COLLAB=/path/to/mcp-collab-claude.sh
export CLAUDE_API_KEY_FILE=/path/to/claude-api-key

# 启动 daemon (前台, 调试用)
npm run dev

# 启动 daemon (PM2 守护, 生产用)
npm run pm2:start
pm2 status
pm2 logs claude-collab-patroller-daemon

# 开机自启
pm2 save
pm2 startup
```

## 配置 (env vars)

| Var | Default | 说明 |
|---|---|---|
| `CLAUDE_COLLAB` | `/d/myopenclaw/scripts/mcp-collab-claude.sh` | collab-mcp 脚本路径 (Windows native) |
| `CLAUDE_API_KEY_FILE` | `/c/Users/SUISHUO-GK/.collab-mcp/claude-api-key` | claude-api-key 文件 (Lesson #110 物理隔离) |
| `CCP_POLL_INTERVAL` | `10000` | polling 间隔 (ms) |
| `CCP_WAKE_METHOD` | `claude-print` | wake channel: `claude-print` / `file-marker` / `send-message` / `webhook` |
| `CCP_HEALTH_ENABLED` | `true` | HTTP /health 端点启用 |
| `CCP_HEALTH_PORT` | `7777` | /health 端口 |
| `CCP_LOG_LEVEL` | `info` | 日志级别: `error` / `warn` / `info` / `debug` |
| `CCP_LOG_FORMAT` | `json` | 日志格式: `json` / `text` |
| `CCP_LOG_FILE` | `~/.claude/patrol/logs/daemon.log` | 日志文件 |

## 监控

```bash
# 健康检查
curl http://127.0.0.1:7777/health | jq

# 输出示例
{
  "status": "ok",
  "pid": 12345,
  "uptime": 3600,
  "sources": [{"name": "collab-mcp", "type": "collab-mcp"}],
  "metrics": {
    "polls": 360,
    "wakes_sent": 5,
    "reminds_sent": 1,
    "errors": 0,
    "last_poll_ts": "2026-08-24T01:25:00Z",
    "last_wake_ts": "2026-08-24T00:10:30Z"
  }
}
```

## 不依赖 claude.exe daemon

v0.7.0 是独立 Node.js 进程, 不需要 `claude.exe` (PID 59872) 持有. 即使 claude.exe crash, daemon 继续跑.

Wake 通过以下 channel (任选):
1. **claude-print**: spawn `claude --print <prompt>` 处理 (新 session 独立, 不唤醒 main)
2. **file-marker**: 写文件 marker, main session 周期轮询
3. **send-message**: 通过 Claude Code IPC 唤醒 main session (Phase 1.3 实现)
4. **webhook**: 推送到自定义 HTTP endpoint

## Lessons 锁版

- `claude-collab-patroller-v0-2-review-2026-08-23` (注入 bug 根因)
- `auto-work-and-reply-not-ack-only-2026-08-23` (ack ≠ reply)
- `auto-patrol-v5-dedupe-lock-2026-08-23` (5min dedupe 参考)
- `claude-collab-patroller-v0-4-5min-force-remind-2026-08-23` (force-remind 设计)
- `phase1-commercial-grade-roadmap-2026-08-24` (Phase 1 路线图)

## Author

claude <claude@trustchain.local> (per-author override per Lesson #340)
Co-authored-by: baobei (拍板 + 测试)

Refs: Phase 1.2 (Node.js 持久 daemon), commit v0.7.0