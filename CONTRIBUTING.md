# Contributing to claude-collab-patroller

## 开发流程

### 1. Fork + 克隆

```bash
git clone https://github.com/YOUR_USERNAME/claude-collab-patroller.git
cd claude-collab-patroller
```

### 2. 本地 Link (开发模式)

```bash
ln -s "$(pwd)" ~/.claude/plugins/claude-collab-patroller
claude --restart  # 加载新 plugin
```

### 3. 改代码 + 自测

```bash
# 修改前先停 watcher (避免热改)
/patrol:stop  # 或 taskkill

# 改 scripts/msg-watcher-collab.sh / hooks / commands / skills

# 改完后跑 self-test
bash scripts/lib/lock.sh --self-test

# 重启 watcher 验证
/patrol:start
```

### 4. Commit (per-commit author 守住 Lesson #340)

```bash
git -c user.name="your-name" -c user.email="you@example.com" add .
git -c user.name="your-name" -c user.email="you@example.com" commit -m "feat: ..."
```

**不要**改全局 git config (`git config user.name`), 用 per-commit `-c` 覆盖 (Lesson #340 一致).

### 5. Push + PR

```bash
git push origin feature/your-feature
gh pr create --title "feat: ..." --body "..."
```

## 设计原则

- **仿 claude-code-telegrammer 成熟模式**: PID lock + clean shutdown + fails loud + Start-Process 自续命
- **kimi MSG-MONITOR-DESIGN.md 原则**: fail-open + 60s 节流, 不用 setsid/nohup
- **TrustChain Lesson #110**: claude 物理隔离 (mcp-collab-claude.sh, 不是共享脚本)
- **Lesson #408**: 不覆盖已有实现, 加新文件共存
- **AGPL-3.0**: 跟上游 claude-code-telegrammer 一致

## Issue 反馈

GitHub Issues: https://github.com/oxiaom/claude-collab-patroller/issues
