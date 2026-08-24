# Phase 4 — Multi-Tenant + Secret Rotation 设计 (v0.7.3+)

## 背景

按 `plugin-commercial-grade-assessment-2026-08-23.md` Phase 4 排 v0.7.3+. 当前 v0.7.2 商用化路径:
- ✅ Phase 1 (8/24 14:25 SGT): 持久化 + 可靠性 (5 critical) — 60/75 vitest + 11 metrics + PM2/systemd/nssm 部署
- ✅ Phase 2 (8/24 14:25 SGT): 可观测性 + 文档
- ✅ Phase 3 (8/25 00:30 SGT user "全部 推进"): 多平台 + backlog fix + 测试覆盖率
- 🟡 Phase 4 (8/25 TBD): multi-tenant + secret rotation + RBAC + rate limiting (5 medium gap)

## Phase 4 范围 (5 medium gap)

按 `plugin-commercial-grade-assessment-2026-08-23.md` 12 项差距:
1. **未 secret rotation** (Phase 4.2) — KMS 集成, 90 天自动换
2. **未 multi-tenant/RBAC** (Phase 4.1) — per-user config + role-based access
3. **未 metrics 持久化** (Phase 4.4) — Prometheus counters 重启不归零
4. **未 npm publish** (Phase 2.3) — ops 配 token (待 baobei 拍板)
5. **未 alert rules** (Phase 4.5) — Prometheus alertmanager rules (待 ops 配)
6. **未 rate limiting** (Phase 4.3) — 防单 user 占用所有资源
7. **未 cross-border §1.1 frozen vs v3.x** (Phase 4.x) — subchain 升级时间线

## Phase 4 排程 (排 v0.7.3, 1-2 周工作量)

### 4.1 Multi-Tenant + RBAC (5-7 天)
- **per-user config**: 多个 user 共享一个 plugin 实例, 各 user 独立 API key / log namespace
- **RBAC**: 3 角色 = admin (管 daemon) / operator (管 wake/metrics) / viewer (只看 metrics)
- **isolation**: per-user 独立 mcp-collab-claude.sh wrapper + 独立 log dir
- **API key rotation**: 每个 user 独立 rotation schedule, 90 天自动换
- **tenant_id**: 每次 wake marker 包含 tenant_id, daemon 路由到对应 user

**实现路径**:
- `daemon.js` 启动读 multi-tenant config (`config/tenants.json`)
- 每个 tenant 有独立: script_path / api_key_file / log_dir / metrics_path
- `Watcher` 支持 per-source + per-tenant 实例
- `Health` endpoint `/health/tenants` 列所有 tenant 状态

### 4.2 Secret Rotation (3-5 天)
- **KMS 集成**: 支持 AWS KMS / HashiCorp Vault / GCP Secret Manager
- **90 天自动换**: cron 周期, 旧 key 保留 7 天过渡
- **API key 文件加密 at rest**: AES-256-GCM with KMS-managed DEK
- **rotation log**: 每次换 key 记 audit log (who/when/why/key-id)

**实现路径**:
- `src/secrets/manager.js` 新模块, 抽象 KMS provider
- `Config` 加 `secretProvider` 选 (file / aws / vault / gcp)
- `Watcher` 启动时 verify secret 可用, fail loud if 不可用

### 4.3 Rate Limiting (2-3 天)
- **per-tenant quota**: 100 wakes/min default, configurable
- **per-source quota**: collab-mcp 1000 polls/min, telegram 100/min
- **token bucket**: 防 burst flood
- **429 response**: 触发 quota 返 alert

**实现路径**:
- `src/quota/limiter.js` 新模块
- `Watcher` 加 pre-poll quota check + post-wake quota check
- `Health` endpoint `/health/quota` 报当前 usage

### 4.4 Metrics 持久化 (2-3 天)
- **Prometheus 持久化**: counter 写 SQLite/PostgreSQL, restart 不归零
- **长期 history**: 30 天 history (可选 config)
- **aggregation**: 5min/1h/1d rollup

**实现路径**:
- `src/metrics/store.js` 新模块 (SQLite default, pluggable backend)
- `Metrics` 集成 store, write-through cache
- `Watcher` shutdown 时 flush 所有 counter

### 4.5 Alert Rules (2-3 天)
- **Prometheus alertmanager rules**:
  - DaemonDown (> 1m uptime 0)
  - ClaudeProcessDead (kill -0 fail > 30s)
  - HighErrorRate (> 0.1/s 5min)
  - NoPolling (> 5min 无 poll)
- **notification channels**: Slack / PagerDuty / Email
- **runbook links**: 每条 alert 链到对应 troubleshooting doc

**实现路径**:
- `v0.7/alerting/rules.yml` 写 Prometheus rules
- `v0.7/alertmanager.yml` config (Slack webhook 等)
- `v0.7/scripts/test-alerts.sh` 验证 alert 真触发

## Phase 4 排 v0.7.3 (按依赖 + ops 配合)

```
v0.7.3 (排 8/26-9/2, 1-2 周):
- 4.5 alert rules (先做, ops 已配 prometheus 即可用)
- 4.3 rate limiting (中, 防止 abuse)
- 4.4 metrics 持久化 (中, Prometheus 升级)
- 4.1 multi-tenant + RBAC (大, 设计周 + 实战周)
- 4.2 secret rotation (大, KMS 集成 + 多 provider 适配)

ops 配合:
- vps2/node-c SSH 修完 (claude verify)
- PM2/systemd/nssm 部署 v0.7.2 (已写 config, 8/25 待 ops apply)
- npm publish (需 ops 配 token, 排 8/27)
- 真 e2e 测试 (商家邀请, baobei 主手, 排 8/28+)
```

## Lesson 锁版 (Phase 4 设计要点)

- **#NEW-P4-1**: multi-tenant 部署时, 各 user 独立 API key + 独立 log dir, 不能共享 (Lesson #308 claude 物理隔离延伸)
- **#NEW-P4-2**: secret rotation 90 天是 industry standard, 不能长于 180 天 (Lesson #254 secrets 锁版延伸)
- **#NEW-P4-3**: rate limiting 必须 per-tenant, 不能全局 (防 1 user 占用所有资源)
- **#NEW-P4-4**: metrics 持久化 = Prometheus counter 不能重启归零 (counter 永久 + reset 显式)
- **#NEW-P4-5**: alert rules 必须有 runbook link (不能光告警不告诉 ops 怎么处理)
- **#NEW-P4-6**: Phase 4 必须先有真 e2e 测试 (商家邀请) 再启用 multi-tenant, 否则一个 bug 影响所有 user

## 关联

- 跟 [[phase1-commercial-grade-roadmap-2026-08-24]] — Phase 1 完成, Phase 4 排程
- 跟 [[plugin-commercial-grade-assessment-2026-08-23]] — 12 项差距 (Phase 4 解决 5 medium)
- 跟 [[amnesia-recovery-v2-4-must-read-2026-08-25]] — claude lane 边界 (4 必读 + lane 主管)
- 跟 [[v07-end-to-end-wake-verified-2026-08-24]] — wake 链路 e2e pass

**How to apply**:
- Phase 4 排 v0.7.3 (1-2 周), 等 ops 配合
- 4.5 alert rules 先做 (ops 已配 prometheus 即可用, 立刻见效)
- 4.1 multi-tenant 设计周 + 实战周, 排 8/28+ (等真 e2e 测试)
- 4.2 secret rotation 跟 KMS 集成, 排 9/1+
- claude lane 主管 plugin + e2e, 不抢 ops 配 token / 部署

**Why**: user 8/25 00:30 SGT 拍板 "全部 推进" + baobei #16568 失忆恢复包 4 必读 lock-in, claude lane ready 加入工作. Phase 4 设计 doc 立刻写, 给 baobei/kimi 拍板排程用. Phase 4 排 v0.7.3, 5 medium gap 解决, claude lane 主管 plugin + e2e + docs, ops 配 PM2/systemd/nssm + npm + 真 e2e 测试.
