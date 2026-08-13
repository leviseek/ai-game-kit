## Purpose

为 Framework 提供场景流转编排边界，使切换场景具备预加载、进度上报、失败保留当前场景、重试与场景作用域释放的一致行为，并让规则逻辑可脱离 Cocos 场景 API 进行确定性测试。

## ADDED Requirements

### Requirement: Scene transition supports preload and progress

场景流转 MUST 支持在切换前预加载目标场景所需资源，并 MUST 上报切换进度。预加载期间 MUST NOT 改变当前场景。进度值 MUST 处于 0 到 1 之间且随预加载推进单调不减，并在切换完成或失败后收敛到终态。

#### Scenario: Preload does not switch the current scene

- **WHEN** 调用方请求预加载目标场景，但未提交切换
- **THEN** 当前场景保持不变，预加载在后台推进并上报进度

#### Scenario: Progress converges to a terminal state

- **WHEN** 场景切换进入执行阶段并推进进度
- **THEN** 进度最终收敛到完成或失败，而不会停留在中间状态

### Requirement: Successful switch activates the target scene

场景流转在满足切换条件后 MUST 激活目标场景，并 MUST 为被替换的场景执行作用域释放。激活完成后 MUST 上报成功。切换进行中对同一目标场景再次发起切换 MUST 被编排层拒绝并返回原因，MUST NOT 产生并发重复切换。

#### Scenario: Target scene becomes active

- **WHEN** 切换满足预加载等条件并提交成功
- **THEN** 目标场景被激活且其资源所有权转移至目标场景作用域，被替换场景的作用域被释放，切换结果上报为成功

#### Scenario: Repeated switch to same target is rejected

- **WHEN** 切换进行中再次对同一目标场景发起切换
- **THEN** 编排层拒绝该请求并返回原因，不产生两个并发的场景激活

### Requirement: Failed switch preserves the current scene

切换失败时 MUST 保留当前场景处于可继续使用状态：当前场景对象 MUST NOT 被释放，编排层 MUST 回到可再次发起切换的状态。失败 MUST 上报带原因和场景标识的失败。失败后 MUST 支持重试：重试 MUST 重新走预加载与切换流程，且 MUST NOT 残留上一次失败期间创建的预加载资源或订阅。

#### Scenario: Failed switch keeps current scene usable

- **WHEN** 目标场景资源加载或激活失败
- **THEN** 当前场景对象未被释放、编排层回到可再次发起切换的状态，失败信息保留原因与场景标识

#### Scenario: Retry after failure starts clean

- **WHEN** 调用方在失败后对同一目标场景重试
- **THEN** 重试重新执行预加载与切换流程，且上一次失败期间创建的预加载资源与订阅已随流转作用域释放

### Requirement: Scene transition has a releasable scope

每次场景流转 MUST 持有可释放的作用域。作用域释放 MUST 取消未完成的预加载或切换、解除编排层内部订阅，并释放该次流转持有的资源；重复释放 MUST 幂等。成功切换后该作用域持有的目标场景资源 MUST 转移至目标场景作用域；失败或取消时 MUST 随作用域整体释放。

#### Scenario: Released transition cancels pending work

- **WHEN** 场景流转作用域被释放，且该次流转仍有未完成的预加载或切换
- **THEN** 未完成的工作被取消，相关资源与订阅被释放，重复释放不产生额外副作用
