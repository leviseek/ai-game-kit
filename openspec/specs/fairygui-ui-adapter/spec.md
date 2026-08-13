# fairygui-ui-adapter Specification

## Purpose

为 Framework 提供 FairyGUI 页面适配边界，使 UI 导航的 route 与层级契约落到真实 UI 运行时：管理 UI 根宿主、按层级映射 GRoot 容器、执行页面创建/挂载/卸载/销毁、消费模态状态实现遮罩与输入阻断，并统一 View → package → Bundle 的资源逆序释放。

## Requirements

### Requirement: UI runtime root is initialized through an adapter factory

FairyGUI 运行时 MUST 经适配器工厂初始化，MUST NOT 由组合根直接导入 `fgui` 类型。UI 根宿主 MUST 提供可测试的初始化入口，且初始化失败 MUST 上报而不得静默吞掉。重复初始化 MUST 幂等或返回已初始化状态。

#### Scenario: Runtime root initializes through the adapter

- **WHEN** 组合根经适配器工厂请求初始化 FairyGUI 运行时
- **THEN** GRoot 就绪、UI 根宿主进入可用状态，且组合根源码不含 `fgui` 导入

#### Scenario: Repeated initialization is safe

- **WHEN** UI 根宿主已被初始化后又请求再次初始化
- **THEN** 第二次请求不产生重复根节点或重复注册，状态保持一致

### Requirement: Framework layers map to GRoot containers in fixed order

FairyGUI 页面适配器 MUST 将导航的 `scene/normal/popup/guide/toast/loading/system` 七层层级按固定顺序映射到 GRoot 下容器。页面挂载 MUST 落入其声明层级对应的容器，层级覆盖关系 MUST 与导航模型一致（system 最高、scene 最低）。

#### Scenario: Page mounts into its declared layer container

- **WHEN** 一个 `popup` 层页面经适配器挂载
- **THEN** 该页面呈现于 `popup` 层级容器内，且其遮挡关系符合导航层级契约

#### Scenario: Layer order matches the navigation contract

- **WHEN** 适配器建立 GRoot 容器映射
- **THEN** 容器顺序按 `scene < normal < popup < guide < toast < loading < system` 排列，与导航模型一致

### Requirement: Pages can be created, mounted, unmounted and destroyed

页面适配器 MUST 支持按 route 创建页面实例、挂载到对应层级容器、卸载与销毁。页面创建失败 MUST 上报并保留可诊断信息。页面卸载 MUST 移除其挂载，销毁 MUST 释放该页面的 FairyGUI 资源；重复卸载或销毁 MUST 幂等。

#### Scenario: Create and mount a page

- **WHEN** 调用方请求创建并挂载一个 route 页面
- **THEN** 页面实例被创建并挂载到其层级容器，可被 UI 导航持有

#### Scenario: Unmount removes the page from its container

- **WHEN** 调用方卸载一个已挂载页面
- **THEN** 页面从 GRoot 容器移除，且重复卸载不产生额外副作用

#### Scenario: Destroy releases the page resources

- **WHEN** 调用方销毁一个页面
- **THEN** 页面持有的 FairyGUI 资源被释放，重复销毁幂等

### Requirement: Modal state drives mask and input blocking

页面适配器 MUST 消费导航的模态状态：导航进入阻断时 MUST 呈现遮罩并阻断下层页面输入，模态收敛后 MUST 移除遮罩并恢复下层输入。阻断状态 MUST 随导航状态自动同步，不允许页面或组合根手动维护遮罩状态。遮罩 MUST 具备可见的呈现效果并正确阻断其覆盖区域的输入。

#### Scenario: Modal mask appears and blocks underlying input

- **WHEN** 导航进入阻断模态（栈顶页面声明阻断）
- **THEN** 适配器自动呈现可见遮罩且下层页面输入不可达，同一次输入不触发下层页面响应

#### Scenario: Mask is removed when modal converges

- **WHEN** 阻断页面关闭且导航模态收敛为不阻断
- **THEN** 遮罩被自动移除，下层页面恢复可交互

#### Scenario: Mask is visible and blocks input

- **WHEN** 模态阻断生效时对遮罩区域执行真实点击
- **THEN** 遮罩可见并拦截该点击，点击不穿透到下层页面

### Requirement: Page resources are released in reverse ownership order

页面关闭时 MUST 按 View → FairyGUI package → Bundle 的逆序释放资源：先销毁 View，再卸载 package 注册，最后在其他所有者释放后释放 Bundle。仍被其他页面或作用域引用的 package 或 Bundle MUST NOT 被释放。

#### Scenario: Closing a page releases view, package and bundle in order

- **WHEN** 一个页面被关闭且其 package 无其他所有者
- **THEN** 按 View 销毁 → package 卸载 → Bundle 释放的顺序执行，重复关闭不重复释放

#### Scenario: Shared package is kept while other owners hold it

- **WHEN** 关闭一个页面但同一 package 仍被其他页面持有
- **THEN** package 不被卸载，Bundle 不被释放，仅该页面的 View 被销毁

### Requirement: UI root tracks window resize

UI 根宿主 MUST 在窗口尺寸变化时同步其根布局尺寸，使层级容器与页面适配器随窗口尺寸保持一致，无需重启或手动刷新。

#### Scenario: Root layout resizes with the window

- **WHEN** 窗口尺寸变化
- **THEN** UI 根宿主与层级容器的尺寸同步更新，页面呈现不受残留旧尺寸影响

### Requirement: UI 根初始化时机由启动编排控制

UI 根宿主与页面适配器的初始化时机 SHALL 由启动编排决定：默认启动流程下 MUST 推迟到 game 场景首次呈现时初始化，全生命周期只初始化一次；URL 冒烟路径 MUST 保留在 startup 场景立即初始化的行为。两种路径均 MUST 复用同一适配器工厂与幂等初始化语义。

#### Scenario: 默认流程推迟初始化至首次呈现

- **WHEN** 默认启动流程进入 startup 场景的 logo/预加载阶段
- **THEN** UI 根与页面适配器均未初始化；切换到 game 场景首次呈现时完成初始化，此后不再重复初始化

#### Scenario: 冒烟路径保持立即初始化

- **WHEN** 启动 URL 带冒烟参数（smoke / fixture）
- **THEN** 冒烟序列在 startup 场景立即初始化 UI 根与页面适配器并执行，行为与既有冒烟一致

### Requirement: 注册表命中的绑定视图创建

页面创建路径 SHALL 查询组件注册表：按包 + 组件名命中时，以注册的类实例化绑定视图并包装对应组件（元素注入与交互注册由框架完成）；未命中时保持既有按名句柄创建行为。两条路径 MUST 共享同一创建接缝与幂等语义。

#### Scenario: 命中注册表创建绑定视图

- **WHEN** 调用方按 route 创建页面，且其包 + 组件名在注册表中命中
- **THEN** 页面以注册类实例化，子节点构建完成后完成字段注入与点击注册

#### Scenario: 未命中保持既有行为

- **WHEN** 调用方按 route 创建页面，且其包 + 组件名未在注册表中登记
- **THEN** 页面按既有按名节点句柄路径创建，行为与改造前一致
