# Design: idle-rewards-offline

## Context

`game_auto_battle` 已落地 01–08（观战体验、规模/布阵/锁定、特效/位移），是确定性良好、事件驱动、引擎无关的战斗 demo；`logic/` 不依赖 cc/fgui，框架层提供 `TimeSource` 契约（`WallClock` 类可注入 `now()` 但**未从 `assets/framework/index.ts` 公开导出**，仅导出 `TimeSource` 类型）。既有可对齐先例：`game_idle/logic/save.ts`（自持版本化存档）、`clock.ts`（可控墙钟）、`progress.ts`（在线/离线收益结算）、`scheduler.ts`（被动调度）；`game_auto_battle/logic/lineup-store.ts` 已按该模式实现 lineup 持久化（version=2，namespace `auto_battle`）。ADR-026 决策 5 明确 lineup schema 保证未来 09 挂机消费兼容。挂机功能动机见 `proposal.md - Why`，验收见 `specs/auto-battle-idle-rewards/spec.md` 与 `specs/auto-battle-lineup-editor/spec.md`。

## Goals / Non-Goals

**Goals:**
- 离线收益按离线分钟纯函数结算，可本地持久化、重启恢复、schema 版本化演进。
- `IdleRewardStore` 端口抽象，本地实现基于平台存储，业务层不依赖具体实现（服务器替换点）。
- 挂机结算使用注入墙钟（可注入 now），与战斗模拟钟驱动解耦。
- 挂机 UI 展示离线时长、收益预览并支持领取/自动入账，入账幂等防重复。

**Non-Goals:**
- 不做服务器同步/账号体系、收益消耗系统、成长系统本体（见 proposal - What Changes 非目标）。
- 不做收益速率复杂度：首版固定速率，lineup 非空槽加权仅作为可选扩展点声明（spec 已含回退语义，实现以固定速率为主，加权作为预留接缝）。
- 不改战斗逻辑、不新增 battle 事件、不触碰战斗模拟钟语义。

## Decisions

### 1. 自持版本化存档（对齐 lineup-store / game_idle 先例），不复用 framework 内部 `createVersionedStorage`

`createVersionedStorage` 不在 framework 公开 API 白名单，故 `IdleRewardStore` 沿用 `LineupStore` 自持 `{ version, data }` 封装：namespace `auto_battle` / key `idle-rewards`，payload `{ lastSeenAtMs, totalRewards, earnedAtMs }`；读取时校验版本、损坏/未来版本抛错、旧版本逐级迁移。

理由：与 sample 层既有模式一致，规避白名单边界破坏（ADR-026 决策 5 先例）。备选（深层导入 framework 内部）被否：违反公开 API 边界。

### 2. 纯函数结算 + 存储端口抽象

新增 `computeIdleRewards(lastSeenAt, now, rate) → { minutes, earned }`：`minutes = floor((now - lastSeenAt) / 60_000)`，`earned = minutes * rate`。`IdleRewardStore` 为端口接口（`load/save`），本地实现基于 `PlatformStorage`；业务层只依赖端口。

理由：纯函数保确定性、可测；端口抽象满足服务器迁移点（proposal 3.5）。备选（结算与存储耦合）被否：破坏可测性与迁移点。

### 3. 可控墙钟自实现，挂机与战斗解耦

框架 `WallClock` 未公开导出，故在 `game_auto_battle` 内自实现最小可控墙钟（对齐 `game_idle/clock.ts`：`now()` + `advance()`，拒绝负推进）。挂机结算只读注入的墙钟；presenter 战斗驱动仍走 `GameClock`（表现时间），二者时间源独立。

理由：挂机用真实墙钟语义（离线时长），战斗用模拟节拍；分离避免 `Date.now()` 混采。注意：presenter 的驱动采样点不在本次改动范围内（避免引入回归），挂机墙钟独立注入即可满足 spec"使用注入时间源"约束。

### 4. 领取入账幂等

`lastSeenAt` 在结算/领取后推进到当前墙钟时刻，`totalRewards` 累计；重复领取同一段离线时长为 0 收益。持久化在入账后触发。

理由：幂等（idempotent）防重复，对齐 game_idle"离线起点消费"语义。

### 5. lineup 消费：固定速率为主，加权作预留接缝

收益速率首版为常量；spec 的"按编队规模加权"场景以可选扩展点实现（提供 `computeRate(lineup)` 默认返回固定速率的接缝函数），避免破坏既有 lineup 存档读取路径。

理由：最小正确改动；不强行引入未经验证的收益公式。风险：加权逻辑未来调整时 `computeRate` 可平滑替换。

## Risks / Trade-offs

- [挂机结算与战斗驱动时间源偏差] → 挂机墙钟独立注入，结算只读该墙钟；测试用可控 `advance` 驱动，不依赖真实 `Date.now()`。
- [存档损坏/未来版本导致挂机不可用] → 读取抛可诊断错误（对齐 LineupStore corrupt 语义）；业务层在加载失败时回退初始状态并保留错误上报。
- [重复领取导致收益通胀] → 结算即推进 `lastSeenAt`（幂等），入账不重复累计。
- [lineup 加权扩展点未被消费导致死代码] → `computeRate` 默认返回固定速率，接缝小、可测，未来按需启用。

## Migration Plan

- 本地持久化全新 schema（key `auto-battle:auto_battle:idle-rewards`），无既有存档迁移；schema version 自 v1 起，预留迁移链映射（对齐 LineupStore 的 migrator 注册模式）。
- 无破坏性变更：不修改既有 battle/lineup 代码路径，仅新增挂机模块与页面。

## Open Questions

无（剩余不确定性可在实现阶段以测试驱动收敛，不改变 spec 与任务拆分）。
