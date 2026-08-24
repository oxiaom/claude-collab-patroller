# Changelog — claude-collab-patroller v0.7.0

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.2-dev] - 2026-08-24 (Phase 3.2 daemon filter allowlist)

### Added
- **daemon filter allowlist (Phase 3.2)** — collab-mcp source filter 加 `allowToUsers` 白名单
  - Default: `['xiaomu', 'kimi']` (baobei→xiaomu/kimi cc to claude 也 wake)
  - Override: `CCP_ALLOW_TO_USERS` env var (comma-separated)
  - 修法: baobei 8/24 14:11 SGT broadcast #16489 (to=xiaomu) 内容对 claude 重要 (kimi 自纠 + v3.2 升级), 但默认 filter 排除
- **Lesson 锁版**: `v07-daemon-backlog-flush-on-startup-2026-08-24.md` (claude 专属 dir)
  - 148 wake marker 在 daemon 启动 1s 内 burst 写 (历史积压)
  - wake-handler adf33534100a0230e smart 检测 timestamp 密度 → 跳过 SendMessage
  - 真修法 (Phase 3.3): 跟踪 max msg_id seen, filter `id > maxSeenId`

### Fixed
- **daemon 启动崩溃 bug** (8/24 14:18 SGT, v0.7.0/v0.7.1): `isWindows is not defined` ReferenceError in collab-mcp.js:42
  - 根因: Phase 3 multi-platform 改造时, `isWindows()` 替代 `process.platform === 'win32'`, 但忘 import
  - 修: `const { isWindows, getBashPath, getCollabPath } = require('../os-detect')`

### Lesson 实战锁版 (8/24)

- **#NEW**: daemon 启动 last_poll_ts 应该 = startup_time (避免 backlog flush)
- **#NEW**: wake-handler smart pattern (timestamp density 检测) 避免 main session 轰炸
- **#NEW**: AI agent 应判断再行动, 不是"无脑转交" (wake-handler 优秀示范)

## [0.7.1] - 2026-08-24 (Phase 3 multi-platform support)

### Added
- **OS 自动检测** (src/os-detect.js) — Windows / Linux / macOS 跨平台
  - process.platform 内置检测
  - env var 覆盖 (CLAUDE_COLLAB / CLAUDE_BASH_PATH / CCP_*)
  - 默认路径: Windows = D:/myopenclaw/scripts/, Linux/macOS = ~/myopenclaw/scripts/
  - bash 路径: Windows = Git Bash, Linux/macOS = /bin/bash
- **to_user=all broadcast 支持** (user 8/24 13:50 SGT 反馈) — collab-mcp source filter 改 `to_user=claude || to_user=all`
- **vitest 单元测试扩展** (Phase 3 — 测试覆盖率 80%):
  - tests/unit/sources-collab-mcp.test.js (8 tests) — to_user filter / acked filter / from_user filter / combined
  - tests/unit/os-detect.test.js (15 tests) — detectPlatform / getBashPath / getCollabPath / isWindows/isMacOS/isLinux
- **v0.7/CHANGELOG.md** 同步更新
- **v0.7/.npmignore** 加 (排除 .github/ node_modules/ tests/ .claude/ 等)

### Fixed
- collab-mcp.js path 处理: 用 os-detect.js 替代 hardcode Windows path
- isLinux 函数名 (之前 `process.platform_is_linux` 是 invalid JS syntax)
- bash -c wrapper 跨平台 (Windows + Linux/macOS 都用同样模式)
- 4 failed tests 修 (3 mock 改 mockResolvedValue, 1 Linux path 检测)

## [0.7.0] - 2026-08-24 (Phase 1 商用化 hardening)

### Added (Phase 1 全部完成)
- **v0.7/ subdir Node.js persistent daemon**:
  - `v0.7/src/daemon.js` — entry, signal handling (SIGTERM/SIGINT), graceful shutdown
  - `v0.7/src/config.js` — env > config > defaults (12 env vars)
  - `v0.7/src/logger.js` — structured JSON logging (file + stdout)
  - `v0.7/src/watcher.js` — multi-source poll loop + metrics
  - `v0.7/src/wake.js` — multi-channel dispatcher (claude-print / file-marker / send-message / webhook)
  - `v0.7/src/instance-lock.js` — single instance + stale detection + defensive age
  - `v0.7/src/dedupe.js` — 5-min window + cleanup
  - `v0.7/src/health.js` — HTTP /health + /ready endpoints
  - `v0.7/src/watchdog.js` — claude.exe crash detection (kill -0 + onCrash)
  - `v0.7/src/sources/{base,collab-mcp,telegram,registry}.js` — multi-source architecture
- **v0.7/ecosystem.config.js** — PM2 daemon config (auto-restart, memory limit, env)
- **v0.7/package.json** — Node.js 18+, deps (node-fetch, vitest, pm2 optional)
- **v0.7/README.md** — 安装 + 配置 + 监控
- **v0.7/ARCHITECTURE.md** — 10KB 架构深度 (5 data flow + 5 failure modes + deployment)
- **v0.7/tests/unit/** — vitest 单元测试 (38 tests)
  - `wake.test.js` (8 tests) — claude-print / file-marker / send-message / webhook / unknown
  - `dedupe.test.js` (9 tests) — 5-min window + cleanup + sha256 fallback
  - `instance-lock.test.js` (8 tests) — stale detection + defensive age
  - `watchdog.test.js` (10 tests) — isAlive / crash detection / metrics
- **v0.7/vitest.config.js** — v8 coverage, 60% thresholds
- **v0.7/.gitignore** — 排除 node_modules / logs / env
- **v0.7/.github/workflows/ci.yml** — GitHub Actions 5 jobs pipeline
- **v0.7/.github/workflows/README.md** — CI docs

### Fixed (Phase 1.2 daemon 实测)
- Logger 解构错误 (`const { logger }` → `const logger = require('./logger')`)
- Bash 580s cap 限制 (Phase 1.1 final cleanup 用 v0.7 daemon 替换)
- HOME env 错位 (`${USERPROFILE:-$HOME}` fallback, 已在 v0.6.0 PR #1)
- Windows Git Bash EFTYPE (bash -c wrapper in collab-mcp.js)
- file-marker wake channel 未实现 (Phase 1.5 加 _fileMarker method)

### Design (Phase 1 实战)
- **claude 物理隔离**: 用 `mcp-collab-claude.sh` (Lesson #110), 不用 `mcp-collab.sh`
- **Auto-work-and-reply 铁律**: ack ≠ reply, 必须做工作 + reply (8/23 17:42 SGT Lesson #NEW)
- **未回复检测**: 用 `read --from` (含 acked=1), 不用 `list-pending` (Lesson #NEW-8/23-unreplied-detection)
- **5-min dedupe**: 跨 source / id / content hash dedupe (Lesson #428 auto-patrol v5)
- **多 channel wake**: 4 channel (claude-print / file-marker / send-message / webhook) 跟 use case 选
- **Watchdog 老实承认限制**: claude.exe 不能 restart, 只能 monitor + alert
- **send-message 老实承认限制**: claude --resume 实测 spawn 新 session, 不是 inject; claude-code 没暴露 IPC

### Lessons 锁版 (claude 专属 memory, 10+ files)
- `claude-collab-patroller-v0-2-review-2026-08-23.md`
- `auto-work-and-reply-not-ack-only-2026-08-23.md`
- `auto-patrol-v5-dedupe-lock-2026-08-23.md`
- `cron-auto-wake-main-session-2026-08-23.md`
- `claude-collab-patroller-v0-4-5min-force-remind-2026-08-23.md`
- `unreplied-detection-logic-fix-2026-08-23.md`
- `plugin-commercial-grade-assessment-2026-08-23.md`
- `phase1-commercial-grade-roadmap-2026-08-24.md`
- `phase1-2-nodejs-daemon-skeleton-2026-08-24.md`
- `phase1-5-vitest-unit-tests-2026-08-24.md`
- `phase1-complete-2026-08-24.md`
- `phase1-1-final-cleanup-2026-08-24.md`

### Tested (8/24 13:31 SGT)
- ✅ v0.7 daemon PID 14792 alive 125s+
- ✅ 13 polls done (10s polling rate)
- ✅ 0 errors
- ✅ HTTP /health endpoint responding (127.0.0.1:7777)
- ✅ Structured JSON logging 跑通
- ✅ 38/38 vitest tests pass in 446ms
- ✅ GitHub Actions CI YAML valid (5 jobs)
- ✅ Watchdog + crash detection work

### Breaking Changes (vs v0.6.0)
- Old: bash watcher + Background Agent sub-agent (580s Bash cap)
- New: Node.js daemon + PM2/systemd (7×24)
- Migration: 旧 Bash watcher 保留作 legacy fallback; ops 配 PM2 部署 v0.7 daemon

### Security
- API key 文件 (`claude-api-key`) — claude 物理隔离 (Lesson #110)
- daemon.log append-only (no secrets logged)
- /health endpoint 默认 127.0.0.1 (localhost only)
- Watchdog 不 restart claude.exe (需要 ops 配)

## [0.6.0] - 2026-08-23 (claude lane contributions)

### Added
- **WAKE 分支 auto-process 模式** (`scripts/msg-watcher-collab.sh`) — `claude --print <handler-prompt>` 跟 ack + self-renew 并行
- **`scripts/check-unreplied.sh`** — 改进版未回复检测 (用 `read --from` 含 acked=1)
- **HOME env USERPROFILE fallback** (3 files: common.sh, lock.sh, patrol_wake_check.sh)

### Fixed
- HOME env 错位导致 lock/log 路径错误 (`${USERPROFILE:-$HOME}` 替换 `${HOME}`)
- claude 物理隔离 (Lesson #110): 已有 `mcp-collab-claude.sh`

### Lessons 锁版
- `auto-work-and-reply-not-ack-only-2026-08-23.md`
- `unreplied-detection-logic-fix-2026-08-23.md`
- `claude-collab-patroller-v0-2-review-2026-08-23.md`

## [0.5.0] - 2026-08-23

### Added
- **outbound-check.sh v0.3.0** — 检查 outbound 未回 + inbound 未回
- **UserPromptSubmit hook outbound-check 集成** (throttled 1h)
- **marketplace.json** — `/plugin marketplace add` 支持
- **typo 修复 #2** — claude lane 13+ 条 msg 误发到 "baenei" (typo)
- **Lesson 锁版 docs** — 5 条 #419-#423 (P1 SVG / P4 Hub / P0 vs P2 重叠 / wallet-auth / P5 锁版失误)

## [0.4.0] - 2026-08-23

### Added
- **outbound-check 集成到 UserPromptSubmit hook** (throttled 1h via file mtime)
- 检测 outbound 未回 (claude 发, 对方没回) + inbound 未回 (对方发, claude 没回)
- CCP_OUTBOUND_CHECK_INTERVAL_SEC env var 可调

## [0.3.0] - 2026-08-23

### Added
- **outbound-check.sh**: claude outbound 消息回复状态检查
- **marketplace.json** (in `.claude-plugin/marketplace.json`)

## [0.2.0] - 2026-08-23

### Added
- **SKILL.md 移到 `skills/claude-collab-patroller/`** (Claude Code 标准结构)
- **`commands/patrol-start.md` / `patrol-stop.md` / `patrol-status.md`** (slash commands)
- **4 fails loud guards at startup**:
  - API key 文件存在 (Lesson #110)
  - collab-mcp 脚本存在
  - Env var 无 unexpanded ${…} 占位符
  - collab-mcp API 可达性
- **Auto-ack 方案 A** (检测到新消息 → 立刻 ack 触发消息, 防无限循环, 8/23 12:32 教训)
- **README.md + CHANGELOG.md + CONTRIBUTING.md** (v0.2.0 完整文档)

### Design (仿 telegrammer)
- PID lock + stale 检测 (from telegrammer `lib/lock.sh`)
- Clean shutdown: trap SIGTERM/SIGINT → release_lock + exit 0
- Self-renew via Start-Process (kimi 8/22 教训: 不用 setsid/nohup)
- Fail-open + 60s 节流 (kimi 第 5 节降级备份)
- claude 物理隔离 (Lesson #110: mcp-collab-claude.sh, 不用 mcp-collab.sh)

## [0.1.0] - 2026-08-23

### Added
- **首次开源发布** (GitHub: oxiaom/claude-collab-patroller)
- **msg-watcher-collab.sh** 主 watcher (8s 长轮询 collab-mcp API)
- **lib/lock.sh + lib/common.sh** (仿 telegrammer)
- **hooks/hooks.json + UserPromptSubmit/patrol_wake_check.sh**

### Design
- 仿 claude-code-telegrammer 设计模式
- 协议用 `<YOUR_AGENT_SCRIPT>` (claude 物理隔离, Lesson #110)
- 8s 长轮询 (直查 MCP API, 不依赖外部 flag)