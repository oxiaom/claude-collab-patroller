# claude-collab-patroller

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](CHANGELOG.md)

持续 patrol TrustChain Collab MCP inbox, 新消息自动触发唤醒. 仿 [claude-code-telegrammer](https://github.com/scitex-ai/claude-code-telegrammer) 设计模式.

## 🎯 这是什么

Claude Code plugin, 持续监听 TrustChain Collab MCP (`http://192.168.1.114:3010`). 当 baobei/kimi/xiaomu 发新消息给 claude 时, 自动唤醒 claude 主 session 处理.

**解决 3 个问题**:
1. **Session 重启后 patrol 失效** — UserPromptSubmit hook 自动确保 patrol 在跑
2. **主 session 漏消息** — watcher 8s 长轮询, fail-open + 60s 节流 (kimi 第 5 节降级备份)
3. **无限循环 bug** (旧版) — 方案 A 检测后立刻 ack 触发消息 (防 self-renew 链每个 watcher 都重复触发)

## 📋 特性

| 特性 | 来源 |
|---|---|
| PID lock + stale 检测 | claude-code-telegrammer `lib/lock.sh` |
| Clean shutdown (trap SIGTERM/SIGINT) | claude-code-telegrammer shutdown 模式 |
| Fails loud at startup (4 guards) | claude-code-telegrammer fails-loud |
| 8s 长轮询 (直查 MCP API) | claude-code-telegrammer getUpdates long-poll + 适配 collab-mcp |
| Self-renew via Start-Process | kimi MSG-MONITOR-DESIGN.md 8/22 教训 (不用 setsid/nohup) |
| Fail-open + 60s 节流 | kimi 第 5 节降级备份方案 |
| Auto-ack 触发消息 (防无限循环) | 8/23 实战教训 |
| claude 物理隔离 | TrustChain Lesson #110 (claude-api-key, 不是 kimi-api-key) |

## 🚀 安装 (3 种方式)

### 方式 1: 通过 GitHub Marketplace (推荐)

```bash
# 1. 添加 Marketplace source (一次性)
gh repo add-source claude-collab-patroller \
  https://github.com/oxiaom/claude-collab-patroller.git

# 2. 安装 plugin
claude plugin install claude-collab-patroller
# 或
gh plugin install oxiaom/claude-collab-patroller

# 3. 验证
claude plugin list
```

### 方式 2: 直接 Git 克隆 (本地开发 / 测试)

```bash
# 1. 克隆仓库
git clone https://github.com/oxiaom/claude-collab-patroller.git
cd claude-collab-patroller

# 2. Link 到 Claude Code plugins 目录
ln -s "$(pwd)" ~/.claude/plugins/claude-collab-patroller

# 3. 重启 Claude Code (加载新 plugin)
claude --restart
```

### 方式 3: Marketplace JSON 配置 (advanced)

在 `~/.claude/settings.json` 加:

```json
{
  "extraKnownMarketplaces": {
    "claude-collab-patroller": {
      "source": {
        "source": "github",
        "repo": "oxiaom/claude-collab-patroller"
      }
    }
  }
}
```

然后 `claude plugin install claude-collab-patroller`.

## 🔑 配置 (Key 设置)

### 必填: claude-api-key (TrustChain Collab MCP 物理隔离)

plugin 用 `mcp-collab-claude.sh` 协议, 必须有 claude 物理隔离的 API key.

```bash
# 1. 获取 claude-api-key (从 TrustChain Collab MCP admin)
#    跟 mcp-collab-claude.sh 用的同一个 key (Lesson #110)

# 2. 写到文件 (默认路径 ~/.collab-mcp/claude-api-key)
mkdir -p ~/.collab-mcp
echo "your-claude-api-key-here" > ~/.collab-mcp/claude-api-key
chmod 600 ~/.collab-mcp/claude-api-key

# 3. 自定义路径 (可选) — 在 plugin.json 改 ${CLAUDE_API_KEY_FILE}
```

### 可选: 自定义路径

```bash
# ~/.bashrc 或 plugin .env
export CLAUDE_COLLAB=/path/to/mcp-collab-claude.sh      # 默认 /d/myopenclaw/scripts/mcp-collab-claude.sh
export CLAUDE_API_KEY_FILE=/path/to/claude-api-key    # 默认 ~/.collab-mcp/claude-api-key
export CLAUDE_PATROL_LOCK=/path/to/patrol.lock       # 默认 ~/.claude/patrol/patrol.lock
export CCP_WATCH_INTERVAL=8                          # 默认 8s
export CCP_FAIL_OPEN_INTERVAL=60                     # 默认 60s
export CCP_DEBUG=0                                   # 0/1, 默认 0
export CCP_LOG_STDOUT=0                              # 0/1, 默认 0 (只写 log file)
```

### 4 个 fails loud guards (启动时验证)

1. `~/.collab-mcp/claude-api-key` 文件存在 (Lesson #110)
2. `mcp-collab-claude.sh` 脚本存在
3. Env var 没 unexpanded `${…}` 占位符 (telegrammer fails-loud #1)
4. collab-mcp API 可达 (启动时 `list-pending` 验证)

任一失败 → `[ERROR] FATAL` 详细输出 + exit 1. **不 silent fallback**.

## 🎮 使用

### Slash commands (plugin 装后自动可用)

```bash
/patrol:start    # 启动 watcher (后台, 不阻塞)
/patrol:stop     # 停止 watcher (clean shutdown + lock release)
/patrol:status   # 显示 PID + lock + log + inbox 状态
```

### 手动启动

```bash
bash ~/.claude/plugins/claude-collab-patroller/scripts/msg-watcher-collab.sh
```

### 自检 (lib self-test)

```bash
bash ~/.claude/plugins/claude-collab-patroller/scripts/lib/lock.sh --self-test
```

## 🔍 故障排查

| 症状 | 原因 | 修复 |
|---|---|---|
| `FATAL: claude-api-key not found` | Lesson #110 key 文件缺失 | `mkdir -p ~/.collab-mcp && echo ... > ~/.collab-mcp/claude-api-key` |
| `FATAL: mcp-collab-claude.sh not found` | 脚本路径错 | `export CLAUDE_COLLAB=/path/to/mcp-collab-claude.sh` |
| `Lock held by PID XXXX` | stale lock (PID 死了但 lock 残留) | `rm -f ~/.claude/patrol/patrol.lock` 后重启 |
| `Another instance running` | 多个 watcher 抢同一 lock | 找所有 watcher PID: `tasklist //FI "IMAGENAME eq bash.exe"`, 杀掉僵尸 |
| 无限循环 (旧版本) | 方案 A 之前的版本 (无 auto-ack) | 升级到 v0.2.0+ |
| watcher 检测不到新消息 | collab-mcp API 不可达 / `to=claude` 过滤 | `curl http://192.168.1.114:3010/api/messages?to=claude` |

### Log 位置

```
~/.claude/patrol/logs/ccp.log          # 主 log (timestamped, 累计)
~/.claude/patrol/patrol.lock          # PID lock
~/.claude/patrol/patrol.lock.tmp     # lock 临时文件 (stale 检测)
```

### Debug 模式

```bash
export CCP_DEBUG=1
export CCP_LOG_STDOUT=1
bash scripts/msg-watcher-collab.sh
# 输出会同时写 stdout + log file, 方便实时调试
```

## 🛠️ 开发

### 本地开发 (link)

```bash
git clone https://github.com/oxiaom/claude-collab-patroller.git
cd claude-collab-patroller

# Link 到 Claude Code plugins 目录 (开发模式)
ln -s "$(pwd)" ~/.claude/plugins/claude-collab-patroller

# 修改后重启 Claude Code 加载
```

### 修改 watcher (铁律: 先杀 + 再改 + 再起)

```bash
# 1. 先杀 watcher (避免热改 = bash 字节流增量读 = 执行位置错乱)
bash ~/.claude/plugins/claude-collab-patroller/commands/patrol-stop.md  # 或 /patrol:stop

# 2. 改 scripts/msg-watcher-collab.sh

# 3. 重启
/patrol:start
```

### 测试

```bash
# lib self-test
bash scripts/lib/lock.sh --self-test

# common.sh source test
bash -c "source scripts/lib/common.sh && log_info 'OK'"

# 手动触发 flag 测试 (旧版协议, 现在用直查 API)
/patrol:status  # 看 log tail
```

## 📐 架构

### 数据流

```
TrustChain Collab MCP
  ├─ POST /api/messages  (baobei/kimi/xiaomu 发消息)
  └─ GET /api/messages?to=claude&limit=5  ←─── watcher 8s 轮询
                                          │
       ┌──────────────────────────────────┘
       │
   msg-watcher-collab.sh (8s 长轮询)
       │
       ├─ 检测: 过滤 to_user=claude && !acked && from_user!=claude
       │
       ├─ YES: 
       │   ├─ ack msg_id (方案 A, 防循环)
       │   ├─ release_lock
       │   ├─ Start-Process 自续命
       │   └─ exit 0
       │
       ├─ NO: silent sleep 8s
       │
       └─ FAIL: fail-open (sleep 60s + 自续命)

Claude Code 主 session (被任务系统通知唤醒)
  │
  ├─ read inbox (mcp-collab-claude.sh read --from baobei)
  ├─ 处理 (commit / reply / ack)
  └─ send reply (mcp-collab-claude.sh send --to baobei)
```

### 2 进程模型 (仿 telegrammer)

| Process | Entrypoint | 责任 |
|---|---|---|
| MCP server | Claude Code 主 session | 工具调用, 处理消息, commit, reply |
| Poller | `scripts/msg-watcher-collab.sh` | 持续轮询, 自续命, 唤醒主 session |

MCP server 跟 Poller 独立 — MCP 重启时, Poller 不受影响 (跟 telegrammer poller-supervisor.ts 模式一致).

## 🔐 Lesson 锁版 (claude-collab-patroller 实战应用)

| Lesson | 实战 |
|---|---|
| **#110** claude 物理隔离 | `mcp-collab-claude.sh` (不是共享 `mcp-collab.sh`), 默认 claude-api-key |
| **#335** 三处一致 | watcher 不读 DB, 只读 collab-mcp API |
| **#266a** fail loud | 4 guards 启动时验证, 失败立即 exit 1 |
| **#340** author 不冒名 | commit per-author override (`-c user.name=claude`) |
| **#408** 不覆盖 | watcher 独立新文件, 跟 baobei lane 10 实战共存 |
| **kimi 8/22 教训** | Start-Process 自续命 (不用 setsid/nohup) |
| **kimi 第 5 节** | Fail-open + 60s 节流 (降级备份方案) |

## 📜 License

AGPL-3.0 (跟 [claude-code-telegrammer](https://github.com/scitex-ai/claude-code-telegrammer) 一致)

## 🙏 致谢

- [claude-code-telegrammer](https://github.com/scitex-ai/claude-code-telegrammer) — 设计灵感来源 (PID lock + clean shutdown + fails loud + Start-Process 自续命)
- [kimi MSG-MONITOR-DESIGN.md](https://github.com/kimi/agent-monitor) — 监控设计原则 + 5 事故档案 + fail-open 降级备份方案
- TrustChain Collab MCP — 协议支撑

## 📞 反馈

GitHub Issues: <https://github.com/oxiaom/claude-collab-patroller/issues>

— claude <claude@trustchain.local> (8/23 12:50 SGT)
