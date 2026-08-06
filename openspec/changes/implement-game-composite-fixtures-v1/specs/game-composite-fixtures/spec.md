# game-composite-fixtures Specification

## Purpose

提供品类组合夹具的行为契约：为 RPG、回合制卡牌、放置挂机、模拟经营、横板格斗五类游戏定义统一的装配与生命周期接缝，验证框架可选能力（时间、调度、输入、UI、音频、资源、配置、存档）可在游戏层组合协作，并锁定业务模型（角色/技能/任务、卡组/回合、离线收益、生产链/经济、判定盒/连招/帧数据）留在游戏层而不侵入框架。

## ADDED Requirements

### Requirement: Fixture public contract

组合夹具 MUST 暴露统一的公共契约：声明该品类需要的模块装配清单与资源，并提供 `start`、`pause`、`resume`、`failRollback`、`dispose` 生命周期接缝，使五类夹具可被 8.6 统一测试以相同方式驱动。夹具 MUST 不引入框架之外的自动扫描机制。

#### Scenario: Fixture exposes a uniform lifecycle seam
- **WHEN** 统一测试取得一个品类的组合夹具
- **THEN** 该夹具提供装配清单与 `start/pause/resume/failRollback/dispose` 接缝，可无差异地驱动任意品类

#### Scenario: Fixture lists its own module composition
- **WHEN** 夹具声明装配清单
- **THEN** 清单只包含该品类需要的模块，未被声明的能力不参与装配

### Requirement: RPG fixture composes cross-scene capabilities

RPG 夹具 MUST 验证跨场景状态、资源作用域、UI、输入与存档可协作：场景切换后持有状态仍可恢复，跨场景资源按作用域释放，UI 导航与输入上下文随场景生效，玩家状态可版本化存档。框架 MUST NOT 包含角色、技能或任务模型。

#### Scenario: Cross-scene state survives a scene switch
- **WHEN** RPG 夹具在场景 A 写入玩家状态并切换到场景 B
- **THEN** 场景 B 可读取同一玩家状态，场景 A 独有资源已被释放

#### Scenario: Framework keeps no character models
- **WHEN** 审查 RPG 夹具的框架依赖边界
- **THEN** 角色、技能、任务等业务模型仅存在于游戏层，框架层不出现对应类型

### Requirement: Turn-based card fixture composes controlled time

回合制卡牌夹具 MUST 验证可控模拟时间、状态机、配置、输入与 UI 可协作：回合推进由可控时钟驱动、状态机表达回合流、配置驱动卡牌数值、输入与 UI 联动出牌。框架 MUST NOT 包含卡组或回合规则。

#### Scenario: Controlled time drives deterministic turns
- **WHEN** 夹具用模拟时钟推进回合
- **THEN** 相同输入序列产生确定性的回合结果，与真实时钟无关

#### Scenario: Framework keeps no card or turn rules
- **WHEN** 审查卡牌夹具的框架依赖边界
- **THEN** 卡组、回合、效果结算等规则仅存在于游戏层，框架层不出现对应类型

### Requirement: Idle game fixture composes wall clock and saves

放置挂机夹具 MUST 验证 wall clock、暂停恢复、调度与版本化存档可协作：离线时长按 wall clock 累计、后台暂停/恢复经生命周期衔接、离线收益在恢复时结算并写入存档。离线收益公式 MUST 位于游戏层。

#### Scenario: Offline earnings settle on resume
- **WHEN** 夹具暂停（模拟离线）一段时间后恢复
- **THEN** 按 wall clock 累计的离线收益被结算并持久化为版本化存档

#### Scenario: Offline formula lives in the game layer
- **WHEN** 审查挂机夹具的框架依赖边界
- **THEN** 离线收益与成长公式仅存在于游戏层，框架层不实现离线收益

### Requirement: Management sim fixture composes scheduling and layered UI

模拟经营夹具 MUST 验证调度、配置、存档与分层 UI 可协作：生产任务经调度器驱动、数值与配置来源分离、经营状态可版本化存档、生产链状态经分层 UI 呈现。生产链与经济模型 MUST 位于游戏层。

#### Scenario: Production advances through the scheduler
- **WHEN** 夹具驱动调度器 tick 推进生产任务
- **THEN** 生产进度按配置更新，经济状态在存档中保持一致

#### Scenario: Economy model lives in the game layer
- **WHEN** 审查经营夹具的框架依赖边界
- **THEN** 生产链与经济模型仅存在于游戏层，框架层不实现经营规则

### Requirement: Fighting game fixture composes action input

横板格斗夹具 MUST 验证 action 输入、模拟时钟、对象池、资源与音频可协作：输入经类型化 action 路由、战斗按模拟时钟逐帧推进、特效/实体经对象池复用、资源与音频按作用域管理。判定盒、连招与帧数据 MUST 位于游戏层。

#### Scenario: Deterministic fight simulation under the simulation clock
- **WHEN** 夹具在模拟时钟下按固定步长驱动战斗
- **THEN** 相同输入与帧序列产生一致结果，对象池对象被复用而非反复创建

#### Scenario: Judgement data lives in the game layer
- **WHEN** 审查格斗夹具的框架依赖边界
- **THEN** 判定盒、连招与帧数据仅存在于游戏层，框架层不实现战斗规则

### Requirement: Composite fixtures pass a unified lifecycle test

八个组合测试（每类夹具的启动、暂停、恢复、失败回滚与释放）MUST 以相同断言执行，且全部通过不要求修改框架内核。内核边界口径：`core` 与 `contracts` 不得修改；`adapters/cocos/ui` 允许修补遗留集成缺口；`boot/AppRoot` 允许扩展多品类装配。

#### Scenario: All five fixtures share one lifecycle test driver
- **WHEN** 统一测试以同一驱动对五个夹具执行启动、暂停、恢复、失败回滚与释放
- **THEN** 五个夹具全部通过，无需改动 `core` 与 `contracts`

#### Scenario: Failure rollback leaves the app usable
- **WHEN** 夹具启动中某模块失败
- **THEN** 已启动模块按逆序回滚，应用进入 disposed 终态或可重建，不残留半启动状态
