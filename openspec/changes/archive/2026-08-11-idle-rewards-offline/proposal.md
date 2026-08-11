# Change: idle-rewards-offline

## Why

`game_auto_battle` 已完成 01–08（观战体验、玩法核心、表现增强），但玩家离线后无任何收益累积，缺少路线图 Stage 3（P3 长线系统）的"自动挂机（离线收益）"能力（D5）。这是路线图 9 个 change 中最后一个未实施项，前置条件（lineup、platform-storage、versioned-storage、WallClock、game_idle 先例）均已就绪。

## What Changes

- 新增 `IdleRewardStore` 端口：本地实现（platform-storage + 自持版本化 schema），为未来服务器实现预留替换点；沿用 `game_idle` 与 LineupStore 的 `{ version, data }` 自持版本化模式（`createVersionedStorage` 不在 framework 公开 API 白名单）。
- 新增纯函数收益计算 `computeIdleRewards(lastSeenAt, now, rate) → { minutes, rewards }`，首版按离线分钟 × 固定速率结算，可选由 lineup 非空槽数加权；本地仅展示性预计算，未来服务器权威校验。
- 挂机状态（`lastSeenAt` 墙钟时间戳 + 累计收益 + schema 版本）经 versioned-storage 语义本地持久化，重启后保留。
- 时间源分离：挂机结算用注入的墙钟（framework `WallClock`，可注入 now），与战斗模拟钟驱动解耦；顺带确认 presenter 采样点统一改用注入时钟，避免"战斗驱动"与"挂机结算"读不同时间源。
- 新增挂机 FGUI 页面（离线时长、收益预览、领取/自动入账），组件创建/修改委派 fgui-designer 并经 `bun run fgui validate --strict`。
- 服务器迁移点文档化：存储端口抽象、收益纯函数、schema 版本化、时间源（本次不实现远程/权威校验）。

## Capabilities

### New Capabilities

- `auto-battle-idle-rewards`: 自动战斗挂机离线收益——离线时长结算、累计收益持久化、时间源分离与服务器迁移点预留。

### Modified Capabilities

- `auto-battle-lineup-editor`: lineup 存档 schema 需保证挂机收益消费兼容（速率输入可选引用 lineup 非空槽数，ADR-026 决策 5 已预留）。

## Impact

- `assets/samples/game_auto_battle/`：新增 `logic/idle-rewards.ts`（纯函数结算 + 存储端口 + 自持版本化 schema）、挂机相关 models；`view/` 新增挂机页面 VM/presenter；`assembly.ts` 接线注入墙钟与存储。
- `ui/demo/assets/AutoBattle/`：新增挂机页面 FGUI 组件（委派 fgui-designer），发布产物由 FGUI 编辑器生成。
- 依赖：framework `WallClock`（已存在，可注入 now）、`platform-storage`、`versioned-storage`（复用语义）；对齐 `game_idle` 先例（save/clock/progress/scheduler）。
- 新 ADR：`idle-reward-local-storage-boundary`（路线图预判 ADR-028 编号已被占用，顺延为 **ADR-030**）。
