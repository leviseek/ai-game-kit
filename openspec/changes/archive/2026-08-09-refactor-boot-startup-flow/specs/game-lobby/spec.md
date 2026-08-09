## MODIFIED Requirements

### Requirement: 默认入口打开列表页

无启动参数时游戏启动 SHALL 先经启动编排切换到 game 场景，并在该场景 UI 根首次初始化后打开游戏列表页作为默认主入口，MUST NOT 停留在空白状态，MUST NOT 在 startup 场景立即打开列表页。UI 根宿主未就绪时 MUST 具备就绪后重试打开能力，MUST NOT 依赖固定时长硬等待。

#### Scenario: 无参数启动经启动流程打开列表页

- **WHEN** 不带任何启动参数启动游戏
- **THEN** 启动编排切换到 game 场景，UI 根首次初始化完成后游戏列表页被打开并可见

#### Scenario: UI 根未就绪时重试

- **WHEN** game 场景 UI 根宿主尚未就绪，请求打开列表页
- **THEN** 请求在根宿主就绪后被重试并成功打开，而非静默失败或固定延时等待
