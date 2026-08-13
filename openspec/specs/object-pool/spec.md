# object-pool Specification

## Purpose

为 Framework 提供显式所有者的纯 TypeScript 对象池：由唯一持有者管理对象创建、复用与释放，覆盖容量上限、重复归还、reset 钩子和 dispose，避免高频分配，且不自动池化任意 Cocos Node。

## Requirements

### Requirement: Pool reuses explicitly borrowed objects

对象池 MUST 提供明确的借出与归还语义：借出时返回可复用对象，归还后该对象可再次被借出；池 MUST 有明确的容量上限，超出容量时行为可配置且可观察。

#### Scenario: Acquire returns a reusable object

- **WHEN** 调用方从对象池借出对象并归还，再次借出
- **THEN** 返回对象可复用，且不违反创建约束

#### Scenario: Pool grows to its configured capacity

- **WHEN** 调用方持续借出对象直到容量上限
- **THEN** 每次借出都返回可用对象，且不超出容量上限

#### Scenario: Overflow beyond capacity is observable

- **WHEN** 对象池已满且调用方继续借出
- **THEN** 借出行为按池规则失败或创建临时对象，且结果对调用方可观察

### Requirement: Double return is rejected

对象池 MUST 拒绝同一对象的重复归还；重复归还 MUST NOT 造成同一对象被并发借出多次或破坏池计数。

#### Scenario: Double return does not corrupt the pool

- **WHEN** 调用方对同一对象归还两次
- **THEN** 第二次归还被拒绝或安全忽略，池计数一致，后续借出不返回同一实例给两个借出方

### Requirement: Pool resets returned objects

对象池 MUST 在对象归还时执行 reset 钩子；reset 失败 MUST 被隔离，不破坏池内其他对象的状态。

#### Scenario: Returned object is reset before reuse

- **WHEN** 调用方归还对象且该对象定义 reset 钩子
- **THEN** 该对象在再次借出前已被 reset，不残留上一次使用状态

#### Scenario: Reset failure is isolated

- **WHEN** 归还时某个对象的 reset 钩子抛出错误
- **THEN** 该对象不进入可用池或按规则处置，池内其他对象仍可正常借出，失败可被诊断边界观察

### Requirement: Pool has explicit lifecycle

对象池 MUST 支持释放；释放后 MUST NOT 再借出或归还对象，重复释放不产生额外副作用。

#### Scenario: Disposed pool rejects acquire

- **WHEN** 对象池已释放后再借出或归还
- **THEN** 操作被拒绝或安全忽略，不产生副作用

#### Scenario: Repeated disposal is idempotent

- **WHEN** 调用方对同一对象池重复释放
- **THEN** 重复释放不抛错、不产生额外副作用

#### Scenario: Pool does not auto-manage arbitrary nodes

- **WHEN** 对象池承载的对象是普通数据或显式注册的实体
- **THEN** 池只在显式所有者的控制下借出与归还，不自动接管 Cocos Node 或其他未被声明的对象生命周期
