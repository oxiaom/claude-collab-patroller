---
name: claude-collab-patroller
description: 持续 patrol collab-mcp inbox (TrustChain Collab MCP, http://192.168.1.114:3010), 新消息触发自动唤醒. 仿 claude-code-telegrammer 设计模式 (PID lock + clean shutdown + fails loud + Start-Process 自续命), 协议用 mcp-collab-claude.sh (claude 物理隔离, Lesson #110). 失败时 fail-open + 60s 节流 (kimi MSG-MONITOR-DESIGN.md 第 5 节降级备份方案). 当 claude 主 session 需要持续监控 inbox / 不能漏 baobei/kimi 消息 / 需要 session 重启后自动恢复监控时使用此 skill.
---

# claude-collab-patroller

> **设计借鉴**: [claude-code-telegrammer](https://github.com/scitex-ai/claude-code-telegrammer) (2026-04-10, AGPL-3.0) 的成熟模式, 协议换成 collab-mcp.

## 这是什么

一个 Claude Code plugin, 持续 patrol TrustChain Collab MCP inbox (`http://192.168.1.114:3010`). 当 baobei/kimi/xiaomu 发新消息给 claude 时, 自动唤醒 claude 主 session 处理.

## 跟原 watcher 的区别

| 项 | 原 watcher (`~/.claude/patrol/`) | Plugin 版 (`claude-collab-patroller`) |
|---|---|---|
| **触发** | 需要手动启动 | UserPromptSubmit hook 自动确保在跑 |
| **协议** | `mcp-collab-claude.sh` (✓) | `mcp-collab-claude.sh` (✓ 一致) |
| **Lib modular** | 单一脚本 | `lib/lock.sh` + `lib/common.sh` (telegrammer 模式) |
| **Self-test** | 无 | 内置 (lock self-test, hook self-test) |
| **Fail-loud guards** | 3 个 (key 文件 + 脚本 + API) | 4 个 (+ env guard unexpanded ${…}) |
| **Hook 集成** | 无 | UserPromptSubmit 自动唤醒检查 |
| **跨平台 path** | hardcode `/d/myopenclaw/...` | `cygpath -w` fallback |

## 何时使用

当你需要:
- claude session 重启后自动恢复 patrol (UserPromptSubmit hook 触发)
- 不能漏 baobei/kimi 消息 (fail-open + 60s 节流)
- 跟其他 watcher 共享 collab-mcp 协议 (避免脚本异构)
- 接受 telegrammer 风格的设计模式 (PID lock + clean shutdown)

## 文件结构

```
claude-collab-patroller/
├── .claude-plugin/plugin.json         # manifest
├── hooks/hooks.json                   # hook 注册 (UserPromptSubmit)
├── hooks/UserPromptSubmit/
│   └── patrol_wake_check.sh           # 用户消息触发: 检查 patrol 在跑
├── scripts/
│   ├── msg-watcher-collab.sh          # 主 watcher (8s 长轮询)
│   └── lib/
│       ├── lock.sh                    # PID lock (telegrammer lock.sh 模式)
│       └── common.sh                  # logging + env guard
├── SKILL.md                           # skill description (本文件)
├── README.md                          # 项目说明
└── .env.example                       # env 配置参考
```

## 启动方式

### 自动 (推荐)

plugin 安装 + UserPromptSubmit hook 自动检查 patrol 是否在跑, 没跑就启动.

### 手动

```bash
bash ~/.claude/plugins/claude-collab-patroller/scripts/msg-watcher-collab.sh
```

## 4 个失败保护 (fails loud at startup)

仿 telegrammer fails-loud (4 个 env guard):

1. `claude-api-key 文件存在` (Lesson #110 物理隔离)
2. `mcp-collab-claude.sh 脚本存在`
3. `env var 没 unexpanded ${…}` (telegrammer fails-loud #1)
4. `collab-mcp API 可达` (启动时 list-pending 验证)

任何失败 → `[ERROR] FATAL` 详细输出 + exit 1. 不 silent fallback.

## 关键设计 (跟 kimi MSG-MONITOR-DESIGN.md + telegrammer 一致)

- **PID lock** (`lib/lock.sh`): 防多实例冲突, stale 自动清理
- **Clean shutdown** (trap SIGTERM/SIGINT): 释放 lock + exit 0
- **Fail-open + 60s 节流** (kimi 第 5 节降级备份): 验证失败时保留唤醒, 节流不爆通知
- **Start-Process 自续命** (kimi 8/22 教训): 不用 setsid/nohup (收割连坐)
- **UserPromptSubmit hook** (telegrammer enforce_background_subagents 模式): 主 session 启动时检查 patrol, 没跑就启动

## 已知边界 (kimi 诚实清单 适用)

1. **会话关闭 = 全停**. claude session 重启后, UserPromptSubmit hook 会自动重启 patrol.
2. **依赖 collab-mcp 可达**. collab-mcp 挂了 fail-open 60s 节流, 但不会丢消息 (fail-open 设计).
3. **唤醒≠消息给我的**. hook 启动时已经过滤 `from_user!='claude'`, 只唤醒别人的消息.

## 不适用

- Telegram 消息触发 (用 claude-code-telegrammer 原版)
- Slack / Discord / Email (用各自 channel plugin)
- 跨主机 patrol (本 plugin 跑在单台机器)

## 关联

- [claude-code-telegrammer](https://github.com/scitex-ai/claude-code-telegrammer) - 设计灵感来源 (协议换成 collab-mcp)
- [mcp-collab-claude.sh](../../../../../d/myopenclaw/scripts/mcp-collab-claude.sh) - Claude 物理隔离脚本 (Lesson #110)
- [kimi MSG-MONITOR-DESIGN.md](../../../../../c/Users/SUISHUO-GK/.kimi-code/patrol/MSG-MONITOR-DESIGN.md) - 5 事故档案 + 监控设计原则
