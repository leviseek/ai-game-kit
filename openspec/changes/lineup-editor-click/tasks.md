## 1. 数据模型与网格逻辑（纯 TS，引擎无关）

- [x] 1.1 `models/models.ts` 新增 HeroPool 与 Lineup 类型：`Hero`（静态英雄配置，形状沿用 `AutoBattleUnit` 去 side/index）、`Lineup`（槽位序列 slot 0..N-1 → heroId），并更新相关模型注释
- [x] 1.2 新增 `logic/grid.ts`：`MapGrid`（rows×cols 逻辑网格 + `occupied: Map<gridKey, unitId>` 占用表，place/release/query 纯函数）+ 布阵区常量 `FORMATION_GRID_SIZE`（首版 3×3=9，己方边缘）
- [x] 1.3 新增 `logic/lineup.ts`：编队编辑 reducer（填充空槽/替换已占槽/卸下，纯函数状态变换，上阵数受 `MAX_TEAM_SIZE` 上限约束）
- [x] 1.4 `logic/config.ts` 演进：新增 `heroes` 池 + `lineups`（ally/enemy 初始编队）读取；保留旧 `teams` 兼容读取器（无 `heroes` 时转换，标记 deprecated）；`MAX_TEAM_SIZE=6` 语义拆分为"上阵上限 / 布阵区容量"两个显式常量
- [x] 1.5 网格与编队单测：MapGrid 占用/释放/重复占用拒绝、布阵区容量与上阵上限分离、lineup 填充/替换/卸下/超上限拒绝、config 新格式与兼容格式解析

## 2. 编队持久化

- [x] 2.1 新增 lineup 存储封装：`createLineupStore`（自持版本化，对齐 game_idle `createIdleSave` 先例——`createVersionedStorage` 不在 framework 白名单；namespace `auto_battle` / key `lineup` / schema v1，payload `{ slots: (string|null)[] }`），迁移器映射预留
- [x] 2.2 持久化单测：保存后加载一致、重启恢复、损坏记录报错、schema 版本迁移预留

## 3. 战斗实例化与开战装配（logic）

- [x] 3.1 `createAutoBattleBattle` 开战由 lineup 实例化战斗单位到布阵区对应格；战斗内部持单位快照，与存档 lineup 解耦（战斗内改动不回流存档）
- [x] 3.2 敌方默认阵容配置接入（配置固定敌方 lineup），开战双方阵容来源统一走 lineup 实例化
- [x] 3.3 确定性测试：同一 lineup 对局事件序列可重放；既有 battle/formation 测试迁移到 lineup 格式后保持全绿

## 4. FGUI 组件（委派 fgui-designer）

- [x] 4.1 `ui/demo/assets/Common/UnitSlot.xml`：UnitSlot 可复用组件（名称/HP 文本/HP 条/能量条，引用 Common 进度条），位置不内嵌、由 `setXY` 写入
- [x] 4.2 `ui/demo/assets/AutoBattle/LineupEditorView.xml`：编队页（候选英雄区 + 布阵区），敌左己右语义可选沿用
- [x] 4.3 `ui/demo/assets/AutoBattle/AutoBattleView.xml`：战场容器化——从固定 12 槽演进为"空战场容器 + 运行时动态实例化 UnitSlot"
- [x] 4.4 每个 FGUI 变更经 `bun run fgui validate --strict` 通过后由编辑器发布（产物不手改）

## 5. 呈现层与装配

- [x] 5.1 `view/view.ts` 演进：新增网格坐标→屏幕坐标映射（沿用 `slotToXY` 思路改造为网格输入）；`AutoBattleUnitView` 增加 `gridKey`/出发格位
- [x] 5.2 绑定声明演进：从预置 `2*MAX_TEAM_SIZE` 槽位 + visible 显隐，演进为按网格存活单位动态装配 UnitSlot 实例（节点名 `unit_{id}`，位置经 `setXY` 写入）；同步更新绑定声明、fixture `viewNodes` 记录型节点
- [x] 5.3 编队页 VM 与命令绑定：候选英雄区 + 布阵区呈现、点击填充/替换/卸下命令接线、持久化触发
- [x] 5.4 `assembly.ts` 接线：编队 → 开战 → 布阵区格 → 动态装配 UnitSlot；fixture 暴露 lineup / lineupStore 能力钩子
- [ ] 5.5 冒烟与截图更新：`?smoke=auto-battle` 链路验证编队→开战→动态渲染；AutoBattleView/LineupEditorView 截图核对

## 6. 测试与验证

- [ ] 6.1 覆盖三个 delta spec 场景的测试：`auto-battle-lineup-editor`（池/可变编队/持久化/开战）、`auto-battle-battlefield-layout`（网格/布阵区/动态实例化）、`auto-battle-playable`（lineup 实例化/动态绑定）
- [ ] 6.2 既有测试收敛：teams 兼容读取器测试保留或标注 deprecated；确认无回归
- [ ] 6.3 类型检查 / lint / 相关单测 / 冒烟全绿

## 7. ADR 检查

- [ ] 7.1 ADR 检查：本 change 落地编队 + 战场模型边界（HeroPool/Lineup、MapGrid/布阵区、MAX_TEAM_SIZE 语义、UnitSlot 契约、持久化 schema 兼容 09），按 `doc/decisions/ADR-NNN-<slug>.md` 约定落档 ADR-026（lineup-data-model）
