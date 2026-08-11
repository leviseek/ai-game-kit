## Purpose

让开发环境（debug 构建包）下开发者可经一个贴边悬浮球查看游戏基础能力运行信息（启动运行时间、平台/设备、网络环境、FPS、内存），并在 release 构建中完全关闭；悬浮球支持拖拽、贴边吸附与悬停/点击展开完整信息。

## ADDED Requirements

### Requirement: 仅 debug 环境启用

dev overlay SHALL 仅在开发环境（debug 构建）启用并在 release 构建默认关闭；环境开关 MUST 为可注入函数，支持 URL 参数强制覆盖；release 下 MUST NOT 创建悬浮球、采样信息或产生任何 UI 开销。

#### Scenario: debug 构建启用 overlay

- **WHEN** 应用运行于 debug 构建且未强制关闭
- **THEN** 悬浮球挂载到全局 UI 最上层，开始采样并显示关键信息

#### Scenario: release 构建关闭 overlay

- **WHEN** 应用运行于 release 构建
- **THEN** 不创建悬浮球、不启动采样，无任何 dev overlay 残留

#### Scenario: URL 参数强制覆盖

- **WHEN** URL 携带 `?dev=0`
- **THEN** 即使 debug 构建也关闭 overlay；携带 `?dev=1` 则 debug 判定可被强制开启

### Requirement: 展示基础能力运行信息

dev overlay SHALL 展示以下信息：启动运行时间（墙钟差值，格式化 mm:ss）、平台与设备型号、网络环境（在线/离线与 effectiveType）、FPS、内存占用（纹理/缓冲区 MB）。信息采样 MUST 不依赖表现时钟（GameClock），运行时间基于墙钟。

#### Scenario: 悬浮球显示关键信息

- **WHEN** 悬浮球处于收缩态
- **THEN** 显示可快速阅读的关键信息（如 FPS），不遮挡游戏主体

#### Scenario: 展开显示完整信息

- **WHEN** 展开信息面板
- **THEN** 显示运行时间、平台/型号、网络环境、FPS、内存等完整信息，数值随采样刷新

### Requirement: 悬浮球交互（拖拽与贴边吸附）

dev overlay 悬浮球 SHALL 支持拖动与贴边吸附：按住拖动可移动到任意位置，释放后自动吸附到最近屏幕边缘（仅留部分露头）；拖动中不吸附。贴边目标以 UI 根容器尺寸为边界。

#### Scenario: 拖拽移动悬浮球

- **WHEN** 按住悬浮球并拖动
- **THEN** 悬浮球跟随触点移动，吸附逻辑暂停

#### Scenario: 释放后贴最近边

- **WHEN** 松开拖动
- **THEN** 悬浮球动画吸附到最近屏幕边缘并露出部分边缘

### Requirement: 展开/收起交互跨输入方式可用

dev overlay SHALL 支持展开与收起：鼠标悬停可展开、点击可锁定展开态；触摸端（无悬停事件）展开降级为点击切换。展开/收起动画 MUST 由 TS 驱动（禁 transition），时间源可注入。

#### Scenario: 鼠标悬停展开

- **WHEN** 鼠标移动到悬浮球上
- **THEN** 展开信息面板；移出后收起（未锁定时）

#### Scenario: 触摸端点击切换

- **WHEN** 触摸端点击悬浮球
- **THEN** 在展开与收起间切换，不依赖悬停

### Requirement: 全局常驻与生命周期

dev overlay SHALL 挂载到全局 UI 常驻作用域（最上层），跨品类会话存活；品类会话切换/退出 MUST NOT 释放悬浮球。overlay 生命周期（创建/销毁）幂等，随应用根节点释放。

#### Scenario: 跨品类会话常驻

- **WHEN** 从列表页进入品类页、战场页或退出会话
- **THEN** 悬浮球保持在最上层不受会话释放影响

#### Scenario: 重复挂载幂等

- **WHEN** 多次触发 dev overlay 挂载
- **THEN** 只创建一次，不产生重复悬浮球
