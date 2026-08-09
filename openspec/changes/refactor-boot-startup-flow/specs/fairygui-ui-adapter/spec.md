## ADDED Requirements

### Requirement: UI 根初始化时机由启动编排控制

UI 根宿主与页面适配器的初始化时机 SHALL 由启动编排决定：默认启动流程下 MUST 推迟到 game 场景首次呈现时初始化，全生命周期只初始化一次；URL 冒烟路径 MUST 保留在 startup 场景立即初始化的行为。两种路径均 MUST 复用同一适配器工厂与幂等初始化语义。

#### Scenario: 默认流程推迟初始化至首次呈现

- **WHEN** 默认启动流程进入 startup 场景的 logo/预加载阶段
- **THEN** UI 根与页面适配器均未初始化；切换到 game 场景首次呈现时完成初始化，此后不再重复初始化

#### Scenario: 冒烟路径保持立即初始化

- **WHEN** 启动 URL 带冒烟参数（smoke / fixture）
- **THEN** 冒烟序列在 startup 场景立即初始化 UI 根与页面适配器并执行，行为与既有冒烟一致
