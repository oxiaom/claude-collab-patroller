# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- claude 物理隔离 (Lesson #110: mcp-collab-claude.sh + claude-api-key)

## [0.1.0] - 2026-08-23

### Added
- 首次开源发布 (GitHub: oxiaom/claude-collab-patroller)
- msg-watcher-collab.sh 主 watcher (8s 长轮询 collab-mcp API)
- lib/lock.sh + lib/common.sh (仿 telegrammer)
- hooks/hooks.json + UserPromptSubmit/patrol_wake_check.sh

### Design
- 仿 claude-code-telegrammer 设计模式
- 协议用 mcp-collab-claude.sh (claude 物理隔离, Lesson #110)
- 8s 长轮询 (直查 MCP API, 不依赖外部 flag)

[Unreleased]: https://github.com/oxiaom/claude-collab-patroller/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/oxiaom/claude-collab-patroller/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/oxiaom/claude-collab-patroller/releases/tag/v0.1.0
