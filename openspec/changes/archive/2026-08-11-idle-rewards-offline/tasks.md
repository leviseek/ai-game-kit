## 1. 逻辑层：挂机状态模型与纯函数结算

- [x] 1.1 `models/models.ts`：新增 `IdleRewardState`（`lastSeenAtMs` 墙钟时间戳 / `totalRewards` 累计收益 / `earnedAtMs` 最近入账时间）与 `IdleOfflineSettlement`（`minutes` / `earned`）类型；导出供逻辑与视图消费。
- [x] 1.2 `logic/idle-rewards.ts`（新）：`computeIdleRewards(lastSeenAt, now, rate)` 纯函数——`minutes = floor((now - lastSeenAt)/60000)`、`earned = minutes * rate`；`computeRate(lineup)` 速率接缝（首版固定常量，lineup 非空槽加权预留）。
- [x] 1.3 `logic/idle-rewards.ts`：`createIdleRewardsHandle(clock, rateSource?)`——入账控制器：`settleOffline()`（按当前墙钟结算并推进 `lastSeenAt`，幂等）、`state` getter；结算即推进 `lastSeenAt` 防重复（idempotent）。

## 2. 逻辑层：IdleRewardStore 存储端口与自持版本化

- [x] 2.1 `logic/idle-rewards-store.ts`（新）：`IdleRewardStore` 端口接口（`currentVersion` / `load` / `save` / `delete`）；`IDLE_REWARDS_SAVE_VERSION = 1`；存储键 `auto-battle:auto_battle:idle-rewards`（对齐 LINEUP_STORAGE_KEY 先例）。
- [x] 2.2 `logic/idle-rewards-store.ts`：`createIdleRewardsStore(options)` 自持 `{ version, data }` 封装（对齐 LineupStore）：写入前校验 payload 形状；读取损坏/未来版本抛可诊断错误、旧版本按迁移链逐级升级、迁移器映射按版本注册（预留未来演进）。
- [x] 2.3 `logic/idle-rewards-store.ts`：`isIdleRewardRecord` 类型守卫（`lastSeenAtMs` / `totalRewards` / `earnedAtMs` 数值校验）；模块登记 `createIdleRewardsStoreModule`。

## 3. 装配与生命周期接线

- [x] 3.1 `logic/clock.ts`：新增可控墙钟 `IdleRewardClock`（`now()` + `advance()`，拒绝负推进，对齐 game_idle `createIdleClock` 先例）；框架 `WallClock` 未公开导出故自实现。
- [x] 3.2 `assembly.ts`：`AutoBattleFixtureOptions` 增加可选 `idleClock`/`idleRateSource`（缺省内建可控墙钟 + 固定速率）；`AutoBattleFixture` 暴露 `idleRewards` 钩子（`state` / `preview()` / `settleOffline()` / `restore()` / `store`）。
- [x] 3.3 `assembly.ts`：组合根接线——创建墙钟、`IdleRewardsHandle`、`IdleRewardsStore`；`restore()` 从存储恢复上次挂机状态（无存档保持初始）；结算后触发 `store.save`；`dispose` 统一释放。
- [x] 3.4 `assembly.ts`：`restore()` 读取编队失败时回退固定默认速率（spec：编队读取失败不中断收益结算）；模块登记 `createAutoBattleIdleRewardsModule`。

## 4. 表现层：挂机页面与 UI

- [x] 4.1 `view/idle-rewards.ts`（新）：`IdleRewardsViewModel`（离线时长 / 可领收益 / 累计收益 / 领取按钮命令）与绑定构建；`IdleRewardsCommands`（`claim` / `back`）。
- [x] 4.2 挂机页面接入：路由/入口接线（`AUTO_BATTLE_IDLE_REWARDS_ENTRY` + `idle-rewards-presenter`，编队页 `btn_idle_rewards` 入口），打开页面时展示离线预览（`previewOffline` 不推进 lastSeenAt）、点击领取后入账并刷新显示；领取幂等（重复点击不重复入账）。
- [x] 4.3 FGUI（委派 fgui-designer + `bun run fgui validate --strict`）：`AutoBattle/IdleRewardsView.xml` 新页面组件（离线时长 / 收益文本 / 领取/返回按钮节点，像素风对齐现有风格；纯色视觉用 sprite 生成）。

## 5. 测试

- [x] 5.1 `computeIdleRewards` 纯函数测试：整分钟结算、不足 1 分钟计 0、同输入同输出、负数/非法入参拒绝。
- [x] 5.2 入账控制器测试：`settleOffline` 结算推进 `lastSeenAt`（重复调用不重复累计）、`state` 快照正确。
- [x] 5.3 IdleRewardStore 测试：版本化往返（save→load 一致）、损坏记录抛可诊断错误、未来版本拒绝、迁移链逐级升级（预留版本模拟）、`delete` 幂等。
- [x] 5.4 装配/集成测试：注入可控墙钟 `advance` 模拟离线时长后 `settleOffline` 收益正确；`restore` 重启后状态保留；编队读取失败回退默认速率；收益不随战斗模拟钟推进而变（时间源解耦）。
- [x] 5.5 既有 `bun test` 全绿（1223 pass，1 个既有并发 flaky 除外）、`bun run typecheck` / `typecheck:ci` / `lint` 通过。

## 6. 集成验证与回归

- [x] 6.1 Cocos 预览：挂机页面打开显示离线预览，领取后累计收益更新且重启保留；`?smoke=auto-battle` 战斗流程无回归。**已人工在 Cocos 编辑器验证通过**。
- [x] 6.2 注释一致性：涉及文件注释同步，无陈旧表述残留；`docs/roadmap/auto-battle-evolution-umbrella.md` 的 ADR 编号（ADR-028→ADR-030）同步更新。

## 7. ADR 检查

- [x] 7.1 ADR 检查：本 change 落地挂机收益本地存储边界（存储端口抽象 / 收益纯函数 / schema 版本化 / 时间源分离），按路线图预判需 ADR——**编号顺延为 `doc/decisions/ADR-030-idle-reward-local-storage-boundary.md`**（ADR-028 已被 `third-party-library-submodule-hosting` 占用、ADR-029 为 `global-time-control-animation-time-source`）；创建该 ADR 并登记服务器迁移点。
