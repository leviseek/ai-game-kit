# ui-navigation Specification

## Purpose

为 Framework 提供引擎无关的 UI 导航边界，使 route、页面栈、层级、模态、返回策略与页面作用域具备一致可测试的行为，并让导航规则可脱离 Cocos 与 FairyGUI 运行时进行确定性测试。

## Requirements

### Requirement: Pages are managed through a typed route stack

UI 导航 MUST 以类型化的 route 标识页面，MUST 维护当前页面栈与栈顶页面，MUST 支持打开、关闭与返回操作。对不存在页面或空栈的关闭/返回 MUST 被拒绝并返回原因。同一 route 的重复打开策略 MUST 在建立导航时显式声明（聚焦已有 / 拒绝 / 允许堆叠三选一）并保持一致。

#### Scenario: Opening a page pushes onto the stack

- **WHEN** 调用方在导航中打开一个 route
- **THEN** 该页面被加入页面栈并成为栈顶，导航上报打开结果

#### Scenario: Opening the same route respects the declared policy

- **WHEN** 调用方在栈顶页面已存在时再次打开同一 route
- **THEN** 按导航声明的重复打开策略执行：聚焦已有实例、拒绝本次请求或允许堆叠，并返回对应结果

#### Scenario: Back on an empty stack is rejected

- **WHEN** 页面栈为空时调用方请求返回
- **THEN** 返回被拒绝并返回原因，导航状态不改变

#### Scenario: Closing the current page removes it from the stack

- **WHEN** 调用方关闭当前栈顶页面
- **THEN** 该页面从栈中移除，前一层页面成为新的栈顶，导航上报关闭结果

### Requirement: Pages are organized into seven fixed layers

导航 MUST 提供 `scene/normal/popup/guide/toast/loading/system` 七层层级契约，MUST 按固定层顺序表达覆盖关系（system 最高、scene 最低）。同层页面的互斥或共存策略 MUST 由导航统一声明，不允许页面自行决定层级归属。关闭 popup 或子页面时 MUST 返回其父层页面处于可交互状态。

#### Scenario: Higher layer overlaps lower layer

- **WHEN** `popup` 层页面打开且其下层已有 `normal` 层页面
- **THEN** `popup` 页面呈现于 `normal` 页面之上，导航按层级契约维护覆盖关系

#### Scenario: Popup closing returns to the underlying page

- **WHEN** 调用方关闭栈顶 `popup` 页面
- **THEN** 下层 `normal` 页面恢复为当前可交互页面，导航状态一致更新

### Requirement: Modal pages declare input blocking

路由激活时 MUST 声明其输入阻断策略（阻断 / 不阻断）。导航层 MUST 统一维护当前模态状态，使被遮挡页面的输入不可达，且 MUST NOT 让同一次输入同时响应多个页面。阻断状态随页面关闭 MUST 自动收敛。

#### Scenario: Modal page blocks underlying input

- **WHEN** 一个声明阻断的 `popup` 页面成为栈顶
- **THEN** 其下层页面处于输入被阻断状态，导航上报当前模态状态

#### Scenario: Blocking is released when the modal closes

- **WHEN** 声明阻断的页面被关闭且栈中不再有阻断页面
- **THEN** 导航的模态状态收敛为不阻断，下层页面恢复可交互

### Requirement: Page scope is released in reverse order on close

每个打开的页面 MUST 持有独立页面作用域。页面关闭时 MUST 按逆序释放其事件订阅、子页面与持有的资源，重复关闭 MUST 幂等；导航整体释放后 MUST 不再接受新的打开/关闭请求。关闭操作失败 MUST 被隔离并上报，不得中断其他页面释放。

#### Scenario: Closing a page releases its subscriptions and resources

- **WHEN** 调用方关闭一个已打开页面
- **THEN** 该页面作用域内的订阅与资源按逆序释放，且不会释放仍被其他页面引用的资源

#### Scenario: Duplicate close is idempotent

- **WHEN** 调用方对已关闭页面再次请求关闭
- **THEN** 第二次请求被忽略或返回已关闭结果，不产生额外释放副作用

#### Scenario: Navigation dispose rejects further requests

- **WHEN** 导航整体被释放后调用方请求打开或关闭页面
- **THEN** 请求被拒绝并返回原因，不再产生任何页面或资源变化
