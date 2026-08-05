## Context

Foundation 已提供 `DisposeHandle`、`ScopedEventChannel`、`ResourceScope`、FSM 等可复用边界，且 `assets/framework` 保持纯 TypeScript 内核与 Cocos Adapter 分层。FairyGUI Runtime 尚未引入，总计划设计决策 7 已确定 Framework UI Layer 不依赖 `cc` 或 `fgui`，负责 route、页面栈、层级、模态、焦点、返回策略、加载状态和页面作用域；FairyGUI Adapter 在后续独立 Change 把层级映射到 `GRoot` 下的 `scene/normal/popup/guide/toast/loading/system` 容器。本设计只建立引擎无关的导航模型与层级契约，对应 `proposal.md` 与 `specs/ui-navigation/spec.md`，承接总计划任务 6.1–6.2。

## Goals / Non-Goals

**Goals:**

- 以类型化 route 与页面栈表达打开、关闭、返回与重复打开策略，行为可由纯 TypeScript 测试锁定。
- 以 `scene/normal/popup/guide/toast/loading/system` 七层层级契约表达覆盖关系与遮罩语义。
- 以模态与输入阻断声明为后续 gameplay action 上下文切换预留统一控制点。
- 以页面作用域复用既有 `DisposeHandle`/`ScopedEventChannel`/`ResourceScope` 语义，页面关闭时逆序清理。
- 在根入口白名单导出导航模型稳定契约与工厂，供后续 FairyGUI Adapter 与输入 Change 复用。

**Non-Goals:**

- 不引入 FairyGUI Runtime，不实现 View 创建、挂载、卸载、转场与渲染映射（总计划 6.3，后续独立 Change）。
- 不实现 FairyGUI package 注册与页面级资源自动释放联动，资源所有权接缝只在契约上预留。
- 不实现页面转场动画、加载进度条 UI、路由参数模式匹配或导航历史持久化。
- 不实现 gameplay action 输入映射（总计划 6.4–6.5），只提供 UI 侧输入阻断声明。
- 不修改 `ApplicationContext`、`startup.scene` 序列化与既有 `.meta` UUID。

## Decisions

### 1. 导航模型放置于 `core/ui` 与 `contracts/ui`，不新建 `ui-layer` 目录

导航模型分两层：`contracts/ui` 定义 route、层级、页面描述与结果类型的稳定契约；`core/ui` 实现页面栈与导航编排。不按总计划设计决策 2 的示意图单独建立 `framework/ui-layer` 目录。

**理由：** 与已归档的资源/场景模式一致——`contracts/*` + `core/*` 已通过依赖边界检查（`public-boundary.test.ts` 的 `allowedFrameworkDependencies`），新建 `ui-layer` 目录需要同步扩展依赖表并增加扫描风险；当前导航模型尚未到需要独立分层目录的规模。FairyGUI Adapter 落地时若确需 `ui-layer` 边界再按依赖表扩展（对齐 resource change 处理方式）。

**未采用方案：** 不新建 `ui-layer` 目录；不在 `core` 里混入页面渲染知识。

### 2. 页面栈以"层级优先、单栈维护"表达七层契约

导航维护单一页面栈，每个栈项记录 route 与所属层级；层级顺序 `scene < normal < popup < guide < toast < loading < system` 决定遮挡关系。打开页面时按声明的层级放入对应覆盖位置；同层页面的互斥或共存策略由导航统一配置（默认 `normal` 层互斥、`popup` 层可堆叠），页面本身不得声明层级归属。

**理由：** 单一栈 + 层级字段比七条独立栈更易维护返回顺序与关闭后栈顶恢复；七层固定顺序覆盖了 FairyGUI Adapter 对 `GRoot` 子容器的映射需求，又不引入 Adapter 知识。

**未采用方案：** 不维护每条层级独立栈（popup 关闭返回 normal 时需要跨栈推导）；不把层级映射表做进内核（FairyGUI 容器名属于 Adapter 层）。

### 3. 重复打开策略在导航建立时锁定

导航建立时以选项声明重复打开策略（`focus-existing | reject | allow-stack`），全局一致，不按 route 单独配置。`focus-existing` 把已存在页面提升为栈顶并返回聚焦结果，`reject` 拒绝并返回原因，`allow-stack` 允许同 route 多实例堆叠。

**理由：** 总计划设计决策 7 要求导航统一负责生命周期与返回策略；全局一致策略避免每个页面各自实现"防重复打开"，降低组合爆炸。三选一覆盖了 RPG 单例页面、弹窗队列与 HUD 等常见需求。

**未采用方案：** 不按 route 维护策略表（当前无真实页面数据支撑，属于过度设计）。

### 4. 页面作用域复用既有语义，资源所有权接缝仅在契约上预留

每个页面栈项持有独立作用域：事件订阅经 `ScopedEventChannel` 返回的 `DisposeHandle` 登记，资源持有经 `ResourceScope` 语义按逆序释放。本 Change 不直接依赖 `ResourceScope` 实现——页面作用域契约在 `contracts/ui` 定义关闭释放入口，具体资源联动在 FairyGUI Adapter Change 中接入 Cocos/资源提供者。

**理由：** 保持导航内核纯逻辑可测试；FairyGUI package 与 View 的资源所有权需要 Adapter 层才可确定，内核只定义"关闭时逆序释放"的契约边界。

**未采用方案：** 不把 `ResourceScope`/Provider 依赖打进导航内核（违反纯 TypeScript 内核的简单性，且当前无真实页面资源）。

### 5. 模态状态由导航统一推导，不存储页面内状态

导航维护当前是否处于阻断模态，由栈顶阻断页面是否存在推导：任一声明阻断的页面成为栈顶即进入阻断，其关闭后回到最近非阻断栈顶时收敛。输入阻断策略是 route 声明的一部分，导航不执行真实输入拦截，只向契约暴露当前模态状态供上层（输入适配器/UI 宿主）消费。

**理由：** 总计划设计决策 10 要求 Framework UI Layer 统一控制模态、焦点与 UI 输入阻断；由栈推导而非页面自报，避免页面关闭时序导致模态残留。

**未采用方案：** 不让页面自行管理遮罩节点或输入拦截（遮罩呈现与输入拦截属于 Adapter 层，本 Change 只声明语义）。

## Risks / Trade-offs

- **[层级契约与 FairyGUI Adapter 容器映射不一致]** → 七层顺序与 `GRoot` 子容器名在 spec 与设计锁定，Adapter Change 只做名称映射，不改变层级语义。
- **[单一页面栈无法表达某些多窗口场景]** → 同层可堆叠策略已覆盖弹窗队列；若出现真正的独立多窗口需求，在组合验证阶段评估，不提前复杂化。
- **[输入阻断只声明不拦截，可能被业务绕过]** → 契约明确模态状态由导航唯一推导，输入适配器与 UI 宿主必须消费导航状态执行真实拦截；该拦截在 6.5 验证。
- **[页面作用域契约先于真实资源接入]** → 关闭释放入口在 spec 锁定，Adapter Change 落地资源联动时会补集成测试，不改变内核契约。

## Migration Plan

1. 先新增 `contracts/ui` 契约与 `core/ui` 导航模型失败测试，确认现有 Foundation 测试仍可运行。
2. 实现引擎无关导航模型与页面作用域，使测试通过，并完成根入口白名单收口。
3. 运行完整 Bun foundation 测试、Foundation 类型检查与依赖边界检查；归档前同步总计划 6.1–6.2 证据，若产生新的长期架构决策则按项目规则创建 ADR。

回滚按模块移除新增导航代码与测试，保留 Foundation 已完成能力；不触碰 `startup.scene` 与既有 `.meta`。本 Change 不引入 FairyGUI，无运行时资源迁移。

## Open Questions

- 页面加载状态（loading）何时上报进度：当前 spec 不要求进度条，只在层级契约包含 `loading` 层；FairyGUI Adapter Change 若需加载进度会扩展进度契约。
- 返回策略是否需要携带结果/载荷：spec 已要求"关闭 popup 返回其父层页面处于可交互状态"，具体结果传递语义留待 UI 组合夹具（总计划 8.x）确认，不改变本设计契约。
