## Purpose

为游戏定义统一的应用启动编排：startup 场景以纯原生方式呈现 logo 并完成框架级预加载与热更检查，默认流程单向切换到 game 场景后首次初始化 UI 根并打开主入口，使启动路径保持最小 UI 成本且全生命周期只初始化一次 UI。

## ADDED Requirements

### Requirement: startup 场景纯原生呈现 logo

启动场景 SHALL 以纯引擎原生方式（不初始化 FairyGUI、不创建 GRoot）呈现应用 logo，MUST NOT 依赖任何 UI 框架资源。logo 呈现期间 MUST NOT 主动执行游戏内容预加载。

#### Scenario: 启动场景零 UI 框架依赖

- **WHEN** 应用在 startup 场景启动
- **THEN** logo 以纯 cc 节点呈现，GRoot 与页面适配器均未初始化，无 fgui package 加载

#### Scenario: logo 期不加载游戏内容

- **WHEN** startup 场景处于 logo 呈现阶段
- **THEN** 不触发任何品类包或游戏内容资源的预加载

### Requirement: 热更阶段为启动流程可选项

启动流程 SHALL 具备热更阶段：仅原生平台启用，Web 平台 MUST 静默跳过。热更阶段的进度 UI 呈现 MUST 不依赖将被热更的 fgui/Common 资源（纯原生呈现）。热更完成或无需热更后 MUST 进入框架级预加载阶段。

#### Scenario: 原生平台执行热更检查

- **WHEN** 应用运行于原生平台且启动流程进入热更阶段
- **THEN** 热更检查与下载以纯原生 UI 呈现进度，完成后进入框架级预加载

#### Scenario: Web 平台静默跳过热更

- **WHEN** 应用运行于 Web 平台进入启动流程
- **THEN** 热更阶段被跳过，直接进入框架级预加载，无任何热更 UI

### Requirement: 框架级资源在 logo 期后台预加载

启动流程 SHALL 在 logo 呈现期间后台预加载框架级资源：FairyGUI 通用包 Common/Common 与框架配置。这些资源 SHALL 以应用生命周期常驻方式持有，MUST NOT 走场景流转作用域，MUST NOT 因场景切换被释放。

#### Scenario: Common 与配置在 logo 期加载且常驻

- **WHEN** 启动流程处于 logo 呈现阶段
- **THEN** Common/Common 与框架配置在后台加载并常驻持有，切换至 game 场景后仍可解析且无需重载

### Requirement: URL 冒烟参数分派优先于默认流程

启动时若存在 URL 冒烟参数（smoke / fixture），启动编排 SHALL 优先执行对应冒烟序列，MUST NOT 同时执行默认主入口流程。冒烟序列 SHALL 保留在 startup 场景初始化 GRoot 后执行的既有行为。

#### Scenario: 冒烟参数触发冒烟序列

- **WHEN** 启动 URL 带 smoke 或 fixture 参数
- **THEN** 执行对应冒烟序列，默认主入口流程不执行

#### Scenario: 无冒烟参数走默认流程

- **WHEN** 启动 URL 无任何冒烟参数
- **THEN** 启动编排执行默认流程：完成预加载后切换到 game 场景

### Requirement: 默认流程单向切换至 game 场景并释放启动场景资源

无启动参数时，启动编排 SHALL 经场景流转把当前场景从 startup 单向切换至 game 场景：切换成功后 startup 场景资源作用域被释放，MUST NOT 支持回切 startup（回切会重复实例化组合根）。AppRoot 作为常驻根节点 MUST 跨场景存活。

#### Scenario: 默认启动切换到 game 场景

- **WHEN** 无任何启动参数启动且预加载完成
- **THEN** 当前场景切换为 game，startup 场景资源作用域被释放，AppRoot 常驻节点跨场景存活

### Requirement: game 场景首次呈现时初始化 UI 根并打开主入口

进入 game 场景后，启动编排 SHALL 在该场景首次呈现时初始化 UI 根与页面适配器（全生命周期仅此一次），并打开默认主入口列表页。UI 根未就绪时 MUST 具备就绪后重试能力，MUST NOT 依赖固定时长硬等待。

#### Scenario: game 场景初始化 UI 并打开列表页

- **WHEN** 默认流程切换到 game 场景
- **THEN** UI 根与页面适配器完成首次初始化，默认列表页被打开并可见

#### Scenario: UI 根未就绪时重试打开

- **WHEN** game 场景 UI 根尚未就绪时请求打开列表页
- **THEN** 请求在根宿主就绪后被重试并成功打开，而非静默失败或固定延时等待

### Requirement: 品类包保持按需会话加载

启动流程与预加载 MUST NOT 提前加载品类包（CardGame/Demo 等）：品类包 SHALL 保持进入品类时经会话作用域加载、退出时全量释放的既有模型，退出后 MUST 可被卸载。

#### Scenario: 品类包不被预加载

- **WHEN** 应用完成启动流程进入 game 场景
- **THEN** 品类包未被预加载持有，仍待进入对应品类时按会话作用域加载
