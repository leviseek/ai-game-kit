## 1. TDD 测试先行

- [x] 1.1 新增 `tests/framework/foundation/game-auto-battle-fixture.test.ts`：契约文件断言（`createAutoBattleFixture` 存在、无 `from "cc"`/`from "fairygui"` 导入）、统一生命周期（`["start","pause","resume","dispose"]`、id = `auto_battle`）、模块清单精确断言（`auto_battle.clock/config/battle/skills/formation/ui`）——均为失败态起步
- [x] 1.2 新增失败测试：轮次推进（6 存活单位各行动一次后 round+1）、速度降序行动序列、行动中阵亡单位跳过、普攻伤害 + 能量按规则增长、满能量自动释放伤害/治疗技能、前排优先目标选择与顺延、胜负终局（win/lose）、终局后 tick no-op、restart 重置、事件回放顺序、ViewModel 渲染（血量/能量/轮次/胜负显隐）、btn_restart 命令绑定、配置非法值抛错、时钟负值拒绝、确定性双跑逐字段一致
- [x] 1.3 运行目标测试确认失败（红）

## 2. 模型与逻辑核心

- [x] 2.1 新增 `game_auto_battle/models/models.ts` + `index.ts`：`AutoBattleSide`/`AutoBattlePosition`/`AutoBattleSkillKind`/`AutoBattleSkill`/`AutoBattleUnit`/`AutoBattlePhase`/`AutoBattleEvent`/`AutoBattleState`（含 round/order/actionIndex/result）
- [x] 2.2 新增 `logic/clock.ts`：可控模拟时钟（TimeSource + advance，负值拒绝）
- [x] 2.3 新增 `logic/config.ts`：配置表读取（每队单位清单/属性/技能、能量增长规则、轮次参数），非法值校验抛错
- [x] 2.4 新增 `logic/skills.ts`：damage/heal 技能结算纯函数 + 能量增长规则
- [x] 2.5 新增 `logic/formation.ts`：alive 判定、速度稳定排序、前排优先 `selectTarget`、治疗目标（HP 最低存活）
- [x] 2.6 新增 `logic/battle.ts`：tick 驱动行动队列（轮次推进/序列重建/行动跳过/能量技能/胜负判定/restart/事件广播），事件经选项 `onEvent` 回调
- [x] 2.7 运行 `bun test tests/framework/foundation/game-auto-battle-fixture.test.ts` 目标测试转绿

## 3. assembly 组合夹具

- [x] 3.1 新增 `game_auto_battle/assembly.ts`：`AutoBattleFixtureOptions`（clock/configContent/onEvent）+ `AutoBattleFixture`（battle.state/tick/restart/events、clock、config、navigator、viewModel）+ 缺省配置内建 + 显式模块清单 + 统一 dispose
- [x] 3.2 运行 `bun run test:foundation` 确认既有测试全绿 + 新夹具测试通过

## 4. ViewModel 与 FGUI 页面

- [x] 4.1 新增 `view/view.ts`：`AutoBattleViewModel`（round/units/log/result）+ `AutoBattleCommands`（restart）+ 绑定声明数组 + VM 派生函数（静态槽位 unit_{index}_*）
- [x] 4.2 新增 `view/ui.ts`：route 登记模块 `createAutoBattleUiModule`
- [x] 4.3 新增 `view/presenter.ts`：真实页面呈现器（setInterval 驱动 clock.advance + tick + render）
- [x] 4.4 委派 fgui-designer 创建 `ui/demo/assets/AutoBattle/` 包 `BattleView.xml`（6 单位血条/血量/能量条/名称、轮次、战斗日志、胜负层、重开按钮）；id 前缀 `ab` 续编、sprite 颜色 ⊆ palette.json、禁 `<graph>`/transition、relation sidePair ≤ 2、跨包引用仅 Common
- [x] 4.5 运行 `bun run fgui list-resources --package AutoBattle` 确认资源；`bun run fgui validate --strict --package AutoBattle` 通过；确认子元素名与 view.ts 绑定声明一致

## 5. smoke 冒烟与接入（最小侵入追加）

- [x] 5.1 新增 `game_auto_battle/smoke.ts`：`runAutoBattleSmoke` 驱动完整对局到终局，console 输出 `[auto-battle]` 标记
- [x] 5.2 追加 `assets/samples/entry.ts`：`fixtures.auto_battle`/`presenters.auto_battle`/`smokes.autoBattle` 三条键
- [x] 5.3 追加 `assets/boot/flow/SmokeRouter.ts`：`?smoke=auto-battle` 分支
- [x] 5.4 追加 `assets/boot/smoke/smoke-proxy.ts`：`autoBattle` 键 + `runAutoBattleSmoke()` 方法
- [x] 5.5 追加 `assets/game/lobby/catalog.ts`：`auto_battle` 条目（playable: true + entry `{route:"auto_battle/battle", packageName:"AutoBattle", resName:"BattleView"}`）
- [x] 5.6 委派 fgui-designer `/fgui-edit` 向 `ui/demo/assets/Demo/LobbyView.xml` 追加 `btn_auto_battle` 按钮节点
- [x] 5.7 更新 `tests/framework/foundation/game-lobby-catalog.test.ts` 快照断言：`playable` 包含 `auto_battle`，`catalogIds == registryIds` 保持
- [x] 5.8 追加 `README.md` 运行说明（`?smoke=auto-battle` 与品类一句话介绍）
- [x] 5.9 运行 `bun run typecheck`（含 tools/creator）通过

## 6. 收口验证

- [x] 6.1 运行 `bun run test:foundation`、`bun run test:foundation:types`、`bun run test:fgui` 全绿
- [x] 6.2 运行 `bun run typecheck` 通过；public-boundary 依赖扫描通过（game 层仍禁 import fgui）
- [x] 6.3 Cocos 预览 `?smoke=auto-battle` 手动冒烟：页面可打开、自动推进到终局、胜负显示、重开可重置
- [x] 6.4 确认零改动清单：`game_card`/`game_fight`/`game_idle`/`game_rpg`/`game_tycoon`、`assets/framework/`、`assets/game/`（除 catalog 追加）、`assets/boot/`（除 smoke 扩展点）、`ui/demo/assets/` 现有组件（除 LobbyView 追加）、现有 openspec 内容全部未改
- [x] 6.5 ADR 检查：本 change 消费既有框架接缝并新增游戏层业务规则，未引入新架构决策（固定 3v3 静态槽位绑定保持在游戏层实现，未升格为框架能力）；记录无需 ADR
