# input Specification

## Purpose

提供引擎无关的类型化 gameplay action 输入模型与 Cocos 输入适配：将触摸、鼠标、键盘和手柄底层事件映射为带状态与时间戳的 action，支持输入上下文切换与运行时输入源替换，并保证模态/UI 阻断时玩法上下文不误响应，使游戏输入可在纯 TypeScript 下独立测试。

## ADDED Requirements

### Requirement: Input sources map to typed actions

输入模型 MUST 支持把底层输入源事件映射为类型化 action。映射规则 MUST 由调用方提供，框架 MUST 感知 action 标识但不假设具体业务动作。同一底层输入在不同映射配置下 MUST 可产生不同 action。

#### Scenario: A bound source emits its mapped action

- **WHEN** 调用方将某个底层输入绑定到 action `jump`，且该输入产生按下事件
- **THEN** 输入模型产生携带按下状态与 `jump` 标识的 action 采样

#### Scenario: Unbound source produces no action

- **WHEN** 一个未绑定任何 action 的底层输入产生事件
- **THEN** 输入模型不产生任何 action 采样

### Requirement: Input contexts gate which actions are emitted

输入模型 MUST 支持定义输入上下文（如 `ui`、`gameplay`）。底层输入只有在激活上下文下才产生 action。切换上下文 MUST 立即生效，未激活上下文下的输入 MUST 不产生 action，也不得残留到切换后的采样。

#### Scenario: Inactive context suppresses actions

- **WHEN** 当前激活上下文为 `ui`，玩法上下文 `gameplay` 未激活，且玩法绑定的输入产生事件
- **THEN** 输入模型不产生该玩法 action

#### Scenario: Switching context takes effect immediately

- **WHEN** 当前激活上下文由 `ui` 切换为 `gameplay`，随后玩法绑定的输入产生按下事件
- **THEN** 输入模型立即产生对应的玩法 action 采样

### Requirement: Input samples carry state, value and timestamp

每次 action 采样 MUST 携带按下/释放状态、连续值（如摇杆位移）与单调时间戳。时间戳 MUST 来自输入模型注入的时间来源，不依赖全局系统时间。状态 MUST 区分按下与释放，不得把释放事件错报为按下。

#### Scenario: Press and release produce distinguishable samples

- **WHEN** 同一输入先产生按下事件再产生释放事件
- **THEN** 输入模型依次产生状态为按下与释放的两条采样，时间戳单调递增

#### Scenario: Analog input carries its value

- **WHEN** 输入源产生带连续值的模拟输入（如摇杆在某个轴上的位移）
- **THEN** 对应 action 采样携带该值，且采样时间戳来自注入的时间来源

### Requirement: Input sources are replaceable at runtime

输入模型 MUST 支持运行时替换底层输入源。替换后 MUST 停止从旧输入源接收事件并从新输入源继续接收，替换 MUST 不改变上层 action 映射语义与上下文激活状态。

#### Scenario: Source replacement keeps semantics

- **WHEN** 运行时把输入源从真实设备替换为测试替身，随后替身产生已绑定输入的事件
- **THEN** 输入模型按相同映射产生对应 action 采样，映射与上下文激活状态保持不变

### Requirement: UI blocking prevents gameplay context from responding

当 UI 模态或 UI 阻断处于生效状态时，玩法上下文 MUST 不响应同一次输入，不得出现同一输入同时被 UI 与玩法消费。阻断状态解除后，玩法上下文 MUST 恢复响应后续输入。

#### Scenario: Modal blocks gameplay input

- **WHEN** 一个模态弹出使 UI 阻断生效，此时玩法绑定的输入产生事件
- **THEN** 输入模型不产生该玩法 action；关闭模态后同输入再次产生事件，则产生对应 action

#### Scenario: No double response across contexts

- **WHEN** UI 与玩法上下文均处于激活状态且无阻断，某输入事件同时可能被两方消费
- **THEN** 输入模型保证同一次输入只按既定的上下文与阻断策略产生一次 action 采样，不重复派发
