# GitHub Actions Workflows

## ci.yml

Phase 1.6 CI pipeline for claude-collab-patroller plugin.

### Jobs

| Job | Status | Description |
 | | | |
| **test-bash** | ✅ Active | Bash watcher + lib self-test (lock.sh, hooks, msg-watcher syntax) |
| **test-node** | ✅ Active (Phase 1.6 新) | vitest Node.js daemon unit tests + smoke test |
| **lint** | 🟡 Placeholder | eslint config — Phase 2 |
| **release** | 🟡 Placeholder | npm publish — Phase 2 |
| **status-check** | ✅ Active | Overall status summary |

### 触发条件

- PR to master
- Push to master / claude/*
- 周一 0:00 UTC cron (catch flaky)

### 实测

- Phase 1.6 上线后: PR 自动验证 (bash + node tests)
- 任何改动自动跑测, 不能 break
- 7×24 监控

### 配置 (待 Phase 2)

- GitHub Encrypted Secrets: `CCP_CLAUDE_API_KEY`, `CCP_WEBHOOK_URL`
- npm token: 自动 publish

### 扩展 (Phase 3+)

- 多 Node.js 版本测试 (16 / 18 / 20)
- macOS / Windows 跨平台测试
- Integration tests (真 spawn claude session)
- Performance benchmarks

## Secrets

GitHub repo → Settings → Secrets and variables → Actions:
- `CCP_CLAUDE_API_KEY` (claude-api-key 内容)
- `CCP_WEBHOOK_URL` (alert webhook endpoint)

## Status Badge

README.md 加 status badge:
```markdown
![CI](https://github.com/oxiaom/claude-collab-patroller/workflows/ci/badge.svg)
```