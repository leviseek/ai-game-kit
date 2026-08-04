# fsm Specification

## Purpose

为 Framework 提供无业务含义的纯 TypeScript 有限状态机：以声明式状态/事件转移表达流转规则，覆盖合法转换、非法转换拒绝、进入/退出钩子和失败后的状态一致性，供场景流转等后续能力复用。

## Requirements

### Requirement: State machine transitions follow declared rules

状态机 MUST 支持声明式状态定义与事件转移表，MUST 只允许按规则允许的转移发生，MUST 拒绝非法事件并保持当前状态不变。

#### Scenario: Allowed transition advances state
- **WHEN** 调用方对处于某状态的机器发送该状态规则允许的事件
- **THEN** 状态按规则迁移到目标状态，且机器暴露当前状态

#### Scenario: Disallowed transition is rejected without state change
- **WHEN** 调用方发送当前状态规则不允许的事件
- **THEN** 转移被拒绝，机器保持原状态，并暴露可观察的失败信息

#### Scenario: Unknown event does not corrupt state
- **WHEN** 调用方发送未在转移表中声明的事件
- **THEN** 状态保持不变，失败可通过既有诊断边界观察

### Requirement: Transition hooks run at correct lifecycle points

状态机 MUST 在执行转移时按顺序运行退出钩子、进入钩子与转移后钩子；转移失败时 MUST NOT 执行目标状态进入钩子，MUST 保持状态一致。

#### Scenario: Hooks run in declared order
- **WHEN** 一次合法转移发生
- **THEN** 原状态退出钩子先于目标状态进入钩子执行，且执行顺序稳定可断言

#### Scenario: Failed transition runs no entry hook
- **WHEN** 一次转移在原状态退出钩子之后、目标进入钩子之前失败
- **THEN** 目标进入钩子不执行，机器回滚到一致的状态并暴露失败

#### Scenario: Transition failure leaves state consistent
- **WHEN** 转移过程中任意钩子抛出错误
- **THEN** 机器不处于中间状态，之后仍可继续执行合法转移或释放

### Requirement: State machine has explicit lifecycle

状态机 MUST 支持重置到初始状态与释放；释放后 MUST NOT 再接受事件，重复释放不产生额外副作用。

#### Scenario: Reset returns to initial state
- **WHEN** 调用方重置已处于非初始状态的机器
- **THEN** 机器回到初始状态，规则与配置保持可用

#### Scenario: Disposed machine rejects events
- **WHEN** 机器已释放后再发送事件
- **THEN** 事件不被处理，且不产生副作用

#### Scenario: Repeated disposal is idempotent
- **WHEN** 调用方对同一机器重复释放
- **THEN** 重复释放不触发钩子、不抛错、不产生额外副作用
