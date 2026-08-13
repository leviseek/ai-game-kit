# fairygui-ui-adapter Specification

## MODIFIED Requirements

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

### Requirement: UI root tracks window resize

UI 根宿主 MUST 在窗口尺寸变化时同步其根布局尺寸，使层级容器与页面适配器随窗口尺寸保持一致，无需重启或手动刷新。

#### Scenario: Root layout resizes with the window

- **WHEN** 窗口尺寸变化
- **THEN** UI 根宿主与层级容器的尺寸同步更新，页面呈现不受残留旧尺寸影响
