# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-08-23

### Added
- **outbound-check.sh 文档化** (commit `8af0a3e` 等) — 检查 📤 outbound 未回 + 📥 inbound 未回 (对方阻塞等待)
- **UserPromptSubmit hook outbound-check 集成** (throttled 1h, commit `730575b`) — 落实协议 v2.0 第 1 条铁律
- **Lesson 锁版 docs** (commit `98ce165`) — 5 条 #419-#423 (P1 SVG / P4 Hub / P0 vs P2 重叠 / wallet-auth / P5 锁版失误)
- **typo 修复 #2** (8/23 14:36 SGT) — claude lane 之前 13+ 条 msg 误发到 "baenei" (typo), 真收件人是 "baenei". 自我检讨 + 重发.

### Design (协议 v2.0 第 1 条铁律)
- ack 是技术接收, reply 是实际做事
- 100% reply 才是协调健康 (避免对方阻塞)

## [0.4.0] - 2026-08-23

### Added
- **outbound-check 集成到 UserPromptSubmit hook** (throttled 1h via file mtime):
  - 每次 user prompt 自动跑 outbound-check (1h 节流)
  - 检测 📤 outbound 未回 (claude 发, 对方没回) + 📥 inbound 未回 (对方发, claude 没回, 对方阻塞)
  - CCP_OUTBOUND_CHECK_INTERVAL_SEC env var 可调
  - 按用户 8/23 13:10 SGT 反馈 "所有人消息必须回复" 落实到代码层面

### Design (协议 v2.0 第 1 条铁律)
- ack 是技术接收, reply 是实际做事
- 100% reply 才是协调健康 (避免对方阻塞)

## [0.3.0] - 2026-08-23

### Added
- **outbound-check.sh**: claude outbound 消息回复状态检查 (用户 8/23 13:10 SGT 反馈: "所有人消息必须回复, 落实到代码层面")
  - 📤 outbound 未回 (claude 发, 对方没回, 按 age_min 降序)
  - 📥 inbound 未回 (对方发, claude 没回, 对方阻塞等待)
  - CCP_OUTBOUND_HORIZON_MIN (默认 60m)
- marketplace.json (在 `.claude-plugin/marketplace.json`, 让 `/plugin marketplace add <github-url>` 识别)

### Design (协议 v2.0 第 1 条铁律)
- ack 是技术接收, reply 是实际做事
- 100% reply 才是协调健康 (避免对方阻塞)

## [0.2.0] - 2026-08-23

### Added
- SKILL.md 移到 `skills/claude-collab-patroller/` (Claude Code 标准结构, auto-discovery)
- `commands/patrol-start.md` / `patrol-stop.md` / `patrol-status.md` (slash commands)
- plugin.json 升级 (homepage, repository, 11 keywords)
- Auto-ack 方案 A (检测到新消息 → 立刻 ack 触发消息, 防无限循环)
- 4 fails loud guards at startup (key 文件 + 脚本存在 + env guard + API 可达性)
- README.md 详细文档 (含 GitHub Marketplace 添加 + 安装 + key 设置)

### Fixed
- 无限循环 bug (8/23 12:32 教训: watcher 检测未 ack → 自续命 → 新 watcher 又检测 → 循环)
- Stale lock 冲突 (8/23 12:37 教训: WAKE 分支加 `release_lock` 避免锁残留)
- `if env_guard` 反逻辑 bug (应该是 `if ! env_guard`)

### Design (仿 telegrammer)
- PID lock + stale 检测 (from telegrammer `lib/lock.sh`)
- Clean shutdown: trap SIGTERM/SIGINT → release_lock + exit 0
- Self-renew via Start-Process (kimi 8/22 教训: 不用 setsid/nohup)
- Fail-open + 60s 节流 (kimi 第 5 节降级备份)
- claude 物理隔离 (Lesson #110: <YOUR_AGENT_SCRIPT> + claude-api-key)

## [0.1.0] - 2026-08-23

### Added
- 首次开源发布 (GitHub: oxiaom/claude-collab-patroller)
- msg-watcher-collab.sh 主 watcher (8s 长轮询 collab-mcp API)
- lib/lock.sh + lib/common.sh (仿 telegrammer)
- hooks/hooks.json + UserPromptSubmit/patrol_wake_check.sh

### Design
- 仿 claude-code-telegrammer 设计模式
- 协议用 <YOUR_AGENT_SCRIPT> (claude 物理隔离, Lesson #110)
- 8s 长轮询 (直查 MCP API, 不依赖外部 flag)

[Unreleased]: https://github.com/oxiaom/claude-collab-patroller/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/oxiaom/claude-collab-patroller/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/oxiaom/claude-collab-patroller/releases/tag/v0.1.0
