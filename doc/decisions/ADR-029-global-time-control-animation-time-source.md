# ADR-029 Global Time Control and Animation Time Source

## 状态

Accepted

## 背景

`game_auto_battle` 等品类已确立三时间域：模拟时间（`SimulationClock`，tick 驱动、确定性回放）、墙钟（`WallClock`，离线收益结算）、表现时间（presenter 用 `Date.now()` 散落驱动动画）。动画器（`effect-animator` / `vs-entrance`）为纯 TS 声明式 + 注入 timeSource，测试用自增源（ADR-027 确立）。

用户需求：全局 pause / resume / 加速减速 / 时间跳跃。本 ADR 确立动画时间源如何服务这些控制：新增 `GameClock` 统一表现时间控制点，钉死"逻辑时间"与"表现时间"两个不可混淆的语义，动画只认注入源、永不自己读系统时间。同时确立 framework 动画能力分级（行为型/装饰型动画均 TS 驱动，不引入引擎 tween 桥）。

## 决策

### 1. 时间域划分固定为三域

- **C-01** 项目时间域固定为三域：模拟时间（`SimulationClock`）/ 墙钟（`WallClock`）/ 表现时间（`GameClock`）；`TimeSource`（now(): ms）保持为唯一时间读取契约。platform-time-scheduling spec 已锁定三钟语义，本 ADR 不修改划分。
- **C-02** 逻辑层（tick/事件/战斗判定）只允许读 `SimulationClock`，禁止读墙钟或系统时间。理由：确定性回放前提；表现层不得反向输入逻辑。
- **C-03** 离线收益/挂机结算属墙钟域；跨会话时间跳跃由墙钟累计时长表达，与动画无关（离线期间无动画在播）。对齐 game_idle 墙钟离线结算先例。
- **C-04** `SimulationClock` 不引入 jumpTo/大步跳跃语义；模拟时间跳跃仅通过"回放已知快照"实现，属回放功能，本 ADR 明确排除。理由：advance 大步跳过中间事件，破坏"事件序列不变"承诺。

### 2. GameClock 形态（表现时间控制点）

- **C-05** 新增 `GameClock`（core/time，纯 TS，实现 `TimeSource`）：接口含 `rate`（全局）、`pause(domain)` / `resume(domain)`（`PauseDomain` 至少含 `menu` / `combat`，每域独立冻结语义）、`now(domain)`（当且仅当该域被暂停时冻结）、`advance(ms)` / `jumpTo(t)`。`PauseDomain` 以枚举表达，支持层级（menu ⊃ combat），禁止单布尔 pause。
- **C-06** `GameClock` 与 `SimulationClock` 保持双轨，不合并：表现钟连续推进（服务动画插值），模拟钟离散 tick（服务确定性逻辑）。理由：tick 驱动 now() 是阶梯值，直接插值动画会卡顿；合并污染回放语义。
- **C-07** `GameClock` 是动画/表现层唯一 timeSource 注入物；所有"注入 timeSource"的位置（effect-animator / vs-entrance / MotionTween）改注入 GameClock。理由：可注入性已确立，收敛到单一真源才能全局控制。
- **C-08** 挡位加速实现收敛为 `GameClock.rate = 挡位倍率` + presenter 用 GameClock delta 驱动 `clock.advance`；移除"每 interval 推多次"节拍缩放。理由：spec"只改变驱动节拍"由单一 rate 表达，实现简化、语义不变。
- **C-09** `WallClock` 保持独立、不被 GameClock 包装；GameClock 不是 Date.now 的替代品。理由：墙钟语义是不可控真实流逝，离线结算依赖它。

### 3. 动画 timeSource 注入性与倍速

- **C-10** 动画 timeSource 必须注入（MUST），禁止默认内置 Date.now()；测试注入可控源。理由：测试确定性 + 全局控制需要单一注入点。
- **C-11** `MotionTween` 契约：`timeSource: TimeSource` 必填；动画器只读 `now(domain)` 做插值，不自行乘 rate、不自行判跳变阈值；可选 `timeScale` 覆盖。理由：倍速/跳跃语义集中在时钟，动画器保持简单可测。
- **C-12** 动画跟随倍速不破坏确定性：动画不产生事件、动画中间帧不进绑定 diff（ADR-027），叠加 C-02 后倍速可安全应用到动画。理由：表现层与逻辑层隔离已确立。
- **C-13** 装饰动画（飘字/闪白/抖动）与行为动画统一注入 GameClock，按 `GameClock.rate` 缩放时长（真实时长 = 基准时长 / rate），**不得固定 1x**。若 spike 验证高倍率下装饰动画可读性不达标，允许装饰动画按 `min(rate, MAX_DECOR_RATE)`（默认 2）驱动，该上限须显式声明，不得静默实现。
- **C-19** 装饰动画可配置最大有效倍率 `MAX_DECOR_RATE`，默认 2（若业务验收接受全倍率则删除本约束）。上限作用于装饰动画时长换算，不改变 GameClock 全局 rate。
- **C-20** 动画器零感知：动画器不得读取 rate 或 domain，只消费 `now(domain)` 注入结果。rate/pause 语义全部收敛在 GameClock，动画器保持"按注入时间插值"的单一职责（对齐 effect-animator 现状）。

### 4. 分层 pause

- **C-14** 行为动画与装饰动画绑定 `combat` 域（战斗暂停时两者一并冻结）；菜单/设置 UI 动画绑定 `menu` 域。**menu 暂停不冻结 combat**（悬浮菜单弹出时战斗背景继续动）——`menu` 是独立暂停域，不影响 `combat` 域。
- **C-17** 应用级 pause/resume（framework `Application` 生命周期，如切后台）与 GameClock 分层 pause 语义分离：应用级 pause = 冻结全部域（域层级最顶层）；分层 pause 只冻结目标域。两者可叠加，resume 只恢复因自身 pause 冻结的部分（对齐 ADR-016 音频分组暂停语义）。

### 5. 跳跃语义

- **C-15** `GameClock.jumpTo(t)` 后动画立即终态回位、不补播中间帧；行为动画终态 = state 快照派生姿态（衔接 ADR-027），装饰动画直接归位/完成。理由：补播无意义；终态以 state 为准无自由权。
- **C-16** 跳跃检测以显式信号为主路径（GameClock 跳跃通知 / 显式 seek），真实大 dt 仅作兜底阈值（参照挂机 `ONLINE_JUMP_MS` 先例）。理由：显式信号可靠；纯阈值会误伤掉帧恢复场景。
- **C-18** 场景跳转按"销毁旧动画 + 新动画从 state 快照入场"处理，不是 `GameClock.jumpTo`；跳转前动画实例走 ADR-027 reset/dispose。理由：跳转 ≠ 时间跳跃，生命周期语义已由既有 reset 覆盖。

### 6. 不引入引擎动画桥

- **C-08b** framework 不提供 GTween/Transition/GMovieClip 封装轨。装饰与行为动画一律走 TS 声明式动画器（注入 GameClock）。仅当出现无法 TS 化的动画需求（如 GMovieClip 序列帧光效）时，经新 ADR 评估引入，禁止默认引入。理由：Transition 已被项目级禁令排除（AGENTS 第 10 条）；GTween 时间不可注入、不跟 rate，与 C-13 冲突；GMovieClip 属 roadmap D4 排除的复杂序列帧。

## 理由

- 真源唯一：`GameClock` 是表现层唯一时间真源，动画只读注入的 `now(domain)`，rate/pause/jump 集中在单一控制点。
- 语义分离：模拟钟保持纯净的离散确定性（回放不污染），墙钟保持不可控真实流逝（离线结算依赖），表现钟承载全部可控性。
- 确定性不回归：动画不产生事件、不进绑定 diff，跟随 rate 无副作用；C-02 保证逻辑层只读模拟钟。
- 可测试：GameClock 纯 TS（时间源注入），动画器/GameClock 行为全量 Bun 测试可断言（与 effect-animator 测试同构）。
- 为全局时间控制铺路：pause/resume/加速减速/时间跳跃全部作用于 GameClock，动画与战斗同步响应，无需改造现有动画器。

## 影响

- core/time 新增 `GameClock`（含 `PauseDomain` 枚举 + rate/pause/resume/now/advance/jumpTo）；framework 根入口导出（public-boundary 白名单同步）。
- `SimulationClock` 驱动源从 `Date.now()` 改为 GameClock delta；`WallClock` 不变。
- 动画器（effect-animator / vs-entrance / MotionTween）注入 GameClock，动画器零感知（只读 `now(domain)`）。
- presenter 挡位实现收敛为 GameClock.rate；分层 pause 接入（menu/combat 域）。
- 新增/修正约束 C-05/C-08/C-08b/C-13/C-14/C-17/C-19/C-20；其余 C-01~~C-04/C-06/C-07/C-09/C-10~~C-12/C-15/C-16/C-18 为本 ADR 基线。
- 落地 change：`framework-motion-runtime`（core GameClock + MotionTween 契约 + 动画接入 + 测试 + ADR-029 + AGENTS 补充）。

## 需 spike / 业务确认

- S1：高倍率（如 3x）下装饰动画（尤其 40ms 闪白）可读性 → 定 C-13/C-19 上限值或删除。
- S2：GameClock 连续推进驱动源选择（Cocos `director.on(EVENT_AFTER_UPDATE)` 注入 dt vs 自有被动调度器）。
