# Architecture — claude-collab-patroller v0.7.0

## Overview

claude-collab-patroller v0.7.0 is a persistent Node.js daemon for monitoring chat sources (collab-mcp, telegram, future) and waking claude main session when new messages arrive.

**Phase 1 商用化 hardening** (8/24 user拍板 B):
- 替代 v0.6.0 bash watcher + Background Agent sub-agent 架构
- 解决 Bash 580s cap 限制
- 多 source + 多 channel wake + 健康检查 + 结构化日志

## Components

```
┌─────────────────────────────────────────────────────────┐
│ claude-collab-patroller-daemon (Node.js, persistent)   │
│                                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│ │ Watcher  │  │  Wake    │  │ Watchdog │               │
│ │          │  │          │  │          │               │
│ │ multi-   │──▶ multi-   │  │ claude   │               │
│ │ source   │  │ channel  │  │ .exe     │               │
│ │ poll     │  │ wake     │  │ crash    │               │
│ │ loop     │  │          │  │ detect   │               │
│ └──────────┘  └──────────┘  └──────────┘               │
│       │             │              │                    │
│       ▼             ▼              ▼                    │
│ ┌─────────────────────────┐  ┌──────────┐            │
│ │ Sources                  │  │ Health   │            │
│ │ - collab-mcp             │  │ /health  │            │
│ │ - telegram (stub)        │  │ HTTP     │            │
│ └─────────────────────────┘  └──────────┘            │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Polling Loop (every 10s)

```
Watcher.tick()
  ↓ for each source
Source.poll()
  ↓ (e.g., mcp-collab-claude.sh list-pending --type messages)
Parse JSON
  ↓ filter: to_user=claude && !acked && from in {baobei,kimi,xiaomu,小木}
For each new msg:
  ↓ Dedupe.isSeen() (5-min window)
  ↓ mark seen + log "new-msg"
Wake.wake(msg) (fire-and-forget)
  ├─ claude-print: spawn `claude --print <prompt>` (new session)
  ├─ file-marker: write wake-{id}-{from}-{ts}.json
  ├─ send-message: marker + claude --resume (experimental)
  └─ webhook: POST to CCP_WEBHOOK_URL
Source.ack(msg)
```

### 2. Wake Flow (claude-print, default)

```
Wake._claudePrint(prompt)
  ↓ spawn `claude` via Node.js child_process.spawn (detached)
  ↓ shell: true (Windows .cmd wrapper)
claude.exe (new session, PID <var>)
  ↓ Read prompt (msg id, from, content)
  ↓ 按 Auto-work-and-reply 铁律处理 (Read → Work → Reply → Memory)
  ↓ Exit
```

### 3. Wake Flow (file-marker, fallback)

```
Wake._fileMarker(msg)
  ↓ mkdir -p CCP_WAKE_MARKER_DIR
  ↓ write wake-{id}-{from}-{ts}.json
Main session (separately, periodically):
  ↓ scan CCP_WAKE_MARKER_DIR
  ↓ for each marker: Read msg + Work + Reply + ack
  ↓ delete marker
```

### 4. Wake Flow (send-message, experimental)

```
Wake._sendMessage(prompt, msg)
  ↓ write wake marker (same as file-marker)
  ↓ spawn `claude --resume <main_session_id> --print <prompt>` (experimental)
```

### 5. Watchdog Flow (every 60s)

```
Watchdog.tick()
  ↓ kill -0 CCP_CLAUDE_PID (signal 0 = check exists)
If alive: log debug "watchdog-alive"
If dead:
  ↓ log error "watchdog-dead"
  ↓ metrics.crashes_detected++
  ↓ onCrash callback (alert)
```

## Concurrency Model

```
Watcher (single main loop)
  └── for each source: await source.poll() (sequential)
       └── for each msg: Wake.wake() (fire-and-forget, no await)

Watchdog (independent loop, 60s)
  └── kill -0 check (no async, fast)

Health HTTP server (independent)
  └── Express-like on http://127.0.0.1:7777
```

**Single-threaded** Node.js with async/await. No worker threads (yet).

## State Management

- **In-memory only**: `Watcher.metrics`, `Dedupe.seen` (Map), `Watchdog.metrics`
- **Persisted**:
  - `claude-api-key` (file, Lesson #110 物理隔离)
  - `daemon.log` (structured JSON, append-only)
  - `wake-marker-{id}-{from}-{ts}.json` (wake markers for main session to pick up)

**Stateless across restarts**: Daemon reinitializes from `list-pending` on start.

## Failure Modes

### Mode 1: Daemon crashes

- PM2/systemd restarts daemon
- Daemon reinitializes, picks up `list-pending` (new msgs since last poll)
- No data loss (mcp API persistent)

### Mode 2: Watcher source fails (e.g., mcp API down)

- `Watcher._pollCycle()` catches error, logs, increments `metrics.errors`
- Continues polling (don't exit)
- Other sources unaffected (if multi-source)

### Mode 3: Wake fails (e.g., claude not in PATH)

- `Wake.wake()` returns `{ ok: false, error: ... }`
- Logged as `wake-failed`, `metrics.errors++`
- Daemon continues (wake failures don't kill daemon)

### Mode 4: Watchdog detects claude.exe crash

- `metrics.crashes_detected++`
- onCrash callback fires (alert: log + metric)
- Daemon continues (we can't restart claude.exe — that's Claude Code parent process)

### Mode 5: Health endpoint down

- PM2/systemd detects via HTTP /health
- Auto-restart daemon
- Same as Mode 1

## Configuration

All config via env vars (Priority: env > config file > defaults).

| Var | Default | Phase | Description |
|---|---|---|---|
| `CLAUDE_COLLAB` | `/d/myopenclaw/scripts/mcp-collab-claude.sh` | 1.2 | collab-mcp script path |
| `CLAUDE_API_KEY_FILE` | `/c/Users/SUISHUO-GK/.collab-mcp/claude-api-key` | 1.2 | claude-api-key (Lesson #110) |
| `CCP_POLL_INTERVAL` | `10000` | 1.2 | Poll interval ms |
| `CCP_WAKE_METHOD` | `claude-print` | 1.3 | Wake channel |
| `CCP_WAKE_MARKER_DIR` | `~/.claude/patrol/wake-markers` | 1.3 | File-marker dir |
| `CCP_MAIN_SESSION_ID` | (unset) | 1.3 | For send-message (experimental) |
| `CCP_WEBHOOK_URL` | (unset) | 1.3 | Webhook endpoint |
| `CCP_HEALTH_ENABLED` | `true` | 1.2 | /health endpoint |
| `CCP_HEALTH_PORT` | `7777` | 1.2 | /health port |
| `CCP_CLAUDE_PID` | (unset) | 1.4 | For crash detection |
| `CCP_LOG_LEVEL` | `info` | 1.2 | Log level |
| `CCP_LOG_FORMAT` | `json` | 1.2 | Log format |

## Deployment

### Quick start (dev)

```bash
cd v0.7
npm install
npm run dev  # foreground, with --verbose
```

### Production (PM2)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Production (systemd)

```ini
# /etc/systemd/system/claude-collab-patroller.service
[Unit]
Description=claude-collab-patroller daemon
After=network.target

[Service]
Type=simple
User=claude
WorkingDirectory=/path/to/v0.7
ExecStart=/usr/bin/node src/daemon.js
Restart=always
RestartSec=10
Environment=CCP_CLAUDE_PID=<claude.exe PID>

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable claude-collab-patroller
systemctl start claude-collab-patroller
```

### Production (Windows Service)

```powershell
# Use node-windows or nssm
nssm install claude-collab-patroller "C:\Program Files\nodejs\node.exe" "D:\path\to\v0.7\src\daemon.js"
nssm set claude-collab-patroller AppDirectory "D:\path\to\v0.7"
nssm set claude-collab-patroller AppEnvironmentExtra CCP_CLAUDE_PID=...
nssm set claude-collab-patroller AppStdout "C:\Users\SUISHUO-GK\.claude\patrol\logs\daemon.log"
nssm set claude-collab-patroller AppStderr "C:\Users\SUISHUO-GK\.claude\patrol\logs\daemon-error.log"
nssm start claude-collab-patroller
```

## Monitoring

### Health endpoint

```bash
curl http://127.0.0.1:7777/health | jq
```

Returns JSON with status, sources, metrics (polls/wakes/reminds/errors), watchdog metrics.

### Prometheus exporter (Phase 2.1, planned)

```yaml
# /metrics endpoint (Prometheus format)
# polls_total
# wakes_sent_total
# reminds_sent_total
# errors_total
# source_up{type="collab-mcp"}
# claude_alive (gauge)
```

### Logging

Structured JSON to file (`~/.claude/patrol/logs/daemon.log`) and stdout (when dev mode).

```json
{"ts":"2026-08-24T05:30:00.000Z","level":"info","event":"new-msg","source":"collab-mcp","msgId":16456,"from":"baobei"}
```

Events: `startup`, `source-initialized`, `watcher-started`, `watchdog-started`, `health-server-started`, `daemon-ready`, `new-msg`, `wake-ok`, `wake-failed`, `watchdog-dead`, `shutdown-start`, `shutdown-complete`, etc.

## Lessons Learned

- **Lesson #110**: claude 物理隔离 (用 mcp-collab-claude.sh, 不用 mcp-collab.sh)
- **Lesson #266a**: fails loud (4 guards at startup)
- **Lesson #308**: claude-api-key 文件物理隔离
- **Lesson #340**: commit per-author override (-c user.name=claude)
- **Lesson #428**: instance-lock (auto-patrol v5)
- **Lesson #NEW-8/23-Auto-work-and-reply**: ack ≠ reply, 必须做工作 + reply
- **Lesson #NEW-8/23-unreplied-detection**: 用 read --from 检测, 不用 list-pending
- **Lesson #NEW-8/23-HOME-env-fix**: USERPROFILE:-$HOME fallback for Windows Git Bash
- **claude-collab-patroller-v0-2-review-2026-08-23**: 注入 bug 根因 (plugin 必须有唤醒机制)
- **auto-work-and-reply-not-ack-only-2026-08-23**: ack ≠ reply, 必须做工作 + reply
- **claude-collab-patroller-v0-4-5min-force-remind-2026-08-23**: v0.4 设计

## Future Roadmap

- **Phase 2 (1-2 周)**: Observability (Prometheus metrics, alerting), 完整文档 (ARCHITECTURE.md), 社区 (marketplace, npm publish)
- **Phase 3 (1-2 周)**: Tests 80%+ coverage, GitHub Actions 完整 CI, secret rotation, multi-tenant
- **Phase 4 (1-2 周)**: Rate limiting, RBAC, KMS secrets
- **Phase 5 (持续)**: 文档 + 社区 + 生态

## References

- Source repo: https://github.com/oxiaom/claude-collab-patroller
- PR #1 (v0.6.0): https://github.com/oxiaom/claude-collab-patroller/pull/1
- PR #2 (v0.7.0): https://github.com/oxiaom/claude-collab-patroller/pull/2
- Plugin README: ../README.md
- Claude memory dir: `C:\Users\SUISHUO-GK\.claude\projects\D--myopenclaw\memory\`