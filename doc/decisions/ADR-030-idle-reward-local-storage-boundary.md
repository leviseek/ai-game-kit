# ADR-030 Idle Reward Local Storage Boundary

## 状态

Accepted

## 背景

`game_auto_battle` 完成 01–08 后，路线图 Stage 3 的自动挂机（离线收益）是本 change `idle-rewards-offline` 的落地对象。挂机收益需要：按离线分钟结算收益、本地持久化并支持重启恢复、schema 版本化演进，同时为未来服务器化预留迁移点（D5：不实现服务器同步/账号，只做设计预留）。路线图第 5 节预判此决策点编号为 ADR-028，但该编号已被 `third-party-library-submodule-hosting` 占用（ADR-029 为 `global-time-control-animation-time-source`），故顺延为 **ADR-030**。

现有可对齐先例：`game_idle/logic/save.ts`（自持版本化存档 `createIdleSave`）、`clock.ts`（可控墙钟 `createIdleClock`）、`progress.ts`（在线/离线收益结算）、`scheduler.ts`（被动调度器）；`game_auto_battle/logic/lineup-store.ts` 已按该模式实现 lineup 持久化（version=2，namespace `auto_battle`）。框架公开 API 白名单（`assets/framework/index.ts`）**不导出** `createVersionedStorage` 与 `WallClock` 类（仅导出 `TimeSource` 类型），sample 层需自实现版本化与可控墙钟。

## 决策

### 1. 存储端口抽象：`IdleRewardStore` 本地实现 + 服务器替换点

新增 `logic/idle-rewards-store.ts`：`IdleRewardStore` 端口接口（`currentVersion` / `load` / `save` / `delete`），业务层只依赖端口；本地实现基于注入的 `PlatformStorage`。未来服务器实现替换时业务层不感知。

理由：满足 D5 服务器迁移点（存储端口抽象）。备选（业务层直接依赖 platform-storage）被否：替换服务器实现需改业务层。

### 2. 收益计算为纯函数，本地仅展示性预计算

新增 `computeIdleRewards(lastSeenAt, now, rate) → { minutes, earned }`：`minutes = floor((now - lastSeenAt)/60000)`，`earned = minutes * rate`；同输入同输出，不依赖全局状态。速率接缝 `computeRate` 首版返回固定常量（`DEFAULT_IDLE_RATE`），lineup 非空槽加权作为预留扩展点；编队读取失败回退默认速率，不中断结算。

理由：纯函数保确定性可测；收益公式在游戏层（对齐 game_idle 4.1 负向断言）。本地计算为展示性预计算，未来服务器权威校验可无缝替换。

### 3. 时间源分离：挂机用注入墙钟，战斗用模拟钟

挂机结算读取注入的墙钟（自实现 `IdleRewardClock`：`now()` + `advance()` 拒绝负推进，对齐 game_idle `createIdleClock`）；战斗仍用 `AutoBattleClock`（模拟钟，确定性）。两者独立，挂机结算不依赖战斗模拟钟。

理由：离线时长是真实墙钟语义，战斗是模拟节拍语义，混用会造成结算偏差（路线图风险表第 5 行）。备选（复用 presenter 的 `GameClock`）被否：GameClock 是表现时间源，语义不同且不可控。

### 4. 领取入账幂等

`settleOffline` 结算即推进 `lastSeenAt` 到当前墙钟，同一段离线时长只入账一次（重复领取 earned=0）；`previewOffline` 只预计算不推进 `lastSeenAt`（展示预览与结算用同一速率，保证预览=实际入账）。入账后由组合根触发持久化。

理由：幂等（idempotent）防重复领取，对齐 game_idle "离线起点消费"语义。

### 5. 自持版本化存档（对齐 lineup-store / game_idle 先例）

`createVersionedStorage` 不在 framework 公开 API 白名单，故 `IdleRewardStore` 自持 `{ version, data }` 封装：namespace `auto_battle` / key `idle-rewards`，payload `{ lastSeenAtMs, totalRewards, earnedAtMs }`；读取校验版本、损坏/未来版本抛可诊断错误、旧版本按迁移链逐级升级（迁移器映射按版本注册，预留未来演进）。

理由：遵循公开 API 白名单边界，对齐 sample 层既有模式（ADR-026 决策 5 先例）。备选（深层导入 framework 内部）被否：破坏白名单边界。

## 理由

- 服务器迁移点文档化：存储端口抽象（1）、收益纯函数（2）、时间源分离（3）、schema 版本化（5）四点在接口与文档中明确，未来服务器实现无需改业务层。
- 确定性不回归：收益结算与战斗 tick 完全解耦，战斗模拟钟不受挂机影响。
- 幂等与可恢复：重复领取不通胀，重启恢复保留累计收益，损坏存档可诊断。
- 与既有约定一致：全部对齐 game_idle / lineup-store 先例，无新框架 API 依赖。

## 影响

- `assets/samples/game_auto_battle/`：新增 `logic/idle-rewards.ts`（纯函数 + 入账控制器 + 速率接缝）、`logic/idle-rewards-store.ts`（存储端口 + 自持版本化）、`logic/clock.ts` 新增 `IdleRewardClock`；`models/models.ts` 新增 `IdleRewardState` / `IdleOfflineSettlement`；`view/idle-rewards.ts` + `idle-rewards-presenter.ts`（挂机页 VM/呈现器）；`assembly.ts` 接线注入墙钟与存储并暴露 `idleRewards` 钩子。
- `ui/demo/assets/AutoBattle/`：新增 `IdleRewardsView.xml` 挂机页组件，`LineupEditorView.xml` 增加 `btn_idle_rewards` 入口（委派 fgui-designer，`bun run fgui validate --strict` 通过；发布产物由 FGUI 编辑器生成）。
- `doc/decisions/ADR-028` 已被占用，本 ADR 顺延编号为 030；路线图第 5 节 ADR 清单已同步更新编号。
- 服务器迁移点：`IdleRewardStore` 端口、`computeIdleRewards` 纯函数、`IdleRewardClock` 注入、schema 版本化迁移——均预留，本次不实现远程/权威校验。
