# ADR-010 UI Navigation Layer Contract and Stack Semantics

## 状态

Accepted

## 背景

父级 `create-game-framework-v1` 第 6 节需要游戏 UI 的导航与层级边界。总计划设计决策 7 已确立 Framework UI Layer 不依赖 `cc` 或 `fgui`，负责 route、页面栈、层级、模态、焦点、返回策略与页面作用域；FairyGUI Adapter 在后续 Change 把层级映射到 `GRoot` 下的容器。但"层级如何表达为栈行为""重复打开如何处理""模态状态由谁推导"从未被定义。本 ADR 记录 change `implement-ui-navigation-v1` 产生的引擎无关导航语义，供后续 FairyGUI Adapter（总计划 6.3）、输入上下文阻断（6.4–6.5）与五类组合验证遵循。

不记录这些决策的风险与 ADR-006 背景一致：未来重构（如引入页面缓存、转场队列或业务自行管理层级）可能在无感中改变既定行为预期。

## 决策

### 1. 单一页面栈 + 按层级插入，而非简单压栈

`core/ui/UiNavigator.ts` 维护单一页面栈，每个栈项携带 route 与层级字段。层级契约 `scene/normal/popup/guide/toast/loading/system` 由 `contracts/ui/Navigation.ts` 的 `UI_LAYER_ORDER` 常量固定，从低到高。新页面打开或 `focus-existing` 提升时按层级插入：层高的页面位于栈的更上层，同层页面后打开的在上；插入位置与打开顺序无关，保证层级覆盖关系稳定。

例如栈中已有 `popup`、`toast` 层页面，后打开的 `normal` 层页面会被插入到它们之下，而不是压到栈顶。

**理由：** 层级覆盖关系是长期 UI 契约，若只依赖打开顺序（push）则一个晚打开的低层页面会错误遮挡高层页面；按层级插入使行为可预测、可测试，也让 FairyGUI Adapter 的容器映射（`GRoot` 子容器顺序）直接对齐层级顺序。

**未采用方案：** 不维护每条层级独立栈（popup 关闭返回 normal 需要跨栈推导，复杂且易错）；不简单 push（依赖打开顺序，无法保证层级覆盖）。

### 2. 重复打开策略在导航建立时全局锁定三选一

`createUiNavigator({ duplicatePolicy })` 在建立时锁定 `focus-existing | reject | allow-stack` 三选一，全局一致，不按 route 单独配置：
- `focus-existing`：已存在同 route 页面时按层级提升为栈顶，不新增实例。
- `reject`：拒绝本次打开并返回原因。
- `allow-stack`：允许同 route 多实例堆叠。

**理由：** 导航统一负责生命周期与返回策略（总计划设计决策 7），全局一致避免每个页面各自实现"防重复打开"，降低组合爆炸；三选一覆盖 RPG 单例页面、弹窗队列与 HUD 等常见需求。

**未采用方案：** 不按 route 维护策略表（当前无真实页面数据支撑，属于过度设计）。

### 3. 模态状态由栈顶阻断页面统一推导

每个页面在打开时声明 `blocking`（是否阻断输入）。导航的 `modal` 状态由栈顶页面推导：栈顶 `blocking === true` 即进入模态，关闭该页面后按栈收敛。导航不执行真实输入拦截，只暴露模态状态供输入适配器与 UI 宿主消费。

**理由：** 总计划设计决策 10 要求 Framework UI Layer 统一控制模态、焦点与输入阻断；由栈推导而非页面自报，避免页面关闭时序导致模态残留。真实拦截（输入/遮罩节点）属于 Adapter 层。

**未采用方案：** 不让页面自行管理遮罩节点或输入拦截；不把 `modal` 作为页面内部状态存储。

### 4. 页面作用域按逆序释放，重复关闭幂等

每个打开的页面持有独立作用域。页面通过 `addDisposable` 登记订阅/资源释放项，关闭时按登记逆序释放；重复关闭幂等，已释放页面登记新项为 no-op。导航 `dispose` 逆序释放全部页面并使后续请求返回失败原因。

**理由：** 对齐既有 `DisposeHandle`/`ScopedEventChannel`/`ResourceScope` 语义，为后续 FairyGUI Adapter 接入资源作用域预留一致入口。

**未采用方案：** 不把 `ResourceScope`/Provider 依赖打进导航内核（保持纯 TypeScript 内核简单，页面资源联动在 Adapter Change 接入）。

## 理由

- 单一栈 + 按层级插入是反直觉的核心行为：未来重构若改成简单 push，层级覆盖关系会随打开顺序漂移而不被察觉。
- 重复打开策略与模态推导是公开 API 行为契约，影响后续输入上下文阻断与 UI 组合验证。
- 七层层级顺序 `UI_LAYER_ORDER` 是 FairyGUI Adapter 容器映射与五类组合夹具的共享依据。
- 页面作用域释放语义决定后续页面资源所有权接缝，须成文以固定边界。

## 影响

- 后续 FairyGUI Adapter Change 必须按 `UI_LAYER_ORDER` 顺序映射 `GRoot` 子容器，并消费导航 `modal` 状态执行真实输入/遮罩拦截。
- 输入上下文阻断（总计划 6.4–6.5）必须以导航模态状态为 UI 侧阻断依据，避免 UI 与玩法双重响应。
- 页面级资源自动释放联动、转场动画、路由参数匹配与导航历史持久化作为未决能力，留给后续独立 change。
- 根入口新增稳定符号一律同步 `expectedRootExports` 白名单（既有约定，不再展开）。
