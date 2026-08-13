# scoped-events Specification

## Purpose

为 Framework 提供类型化、可取消、作用域限定的发布/订阅事件通道：事件类型静态可校验，订阅返回同步幂等释放句柄，单个处理器失败不阻断其他处理器，作用域关闭后不再触发。

## Requirements

### Requirement: Scoped event channel is typed and cancellable

事件通道 MUST 支持类型化事件定义与发布/订阅，订阅 MUST 返回同步幂等的释放句柄；取消订阅后 MUST NOT 再收到该事件。事件名称 MUST 为类型化标识而非任意字符串。

#### Scenario: Subscriber receives typed event payload

- **WHEN** 调用方订阅类型化事件并发布对应事件
- **THEN** 订阅处理器收到该事件及其类型化负载，且非本类型事件不被处理器接收

#### Scenario: Disposed subscription no longer receives events

- **WHEN** 调用方释放订阅句柄后再发布事件
- **THEN** 该订阅的处理器不再被调用，重复释放不产生额外副作用

#### Scenario: Subscriptions are scoped and cancelled together

- **WHEN** 事件作用域被关闭
- **THEN** 该作用域下所有订阅不再触发，作用域外的订阅不受影响

### Requirement: Handler failure is isolated within a batch

同一事件发布时一个订阅处理器抛出错误 MUST NOT 阻断同批其他处理器，失败信息 MUST 通过既有诊断边界保留。

#### Scenario: Failing handler does not block other handlers

- **WHEN** 发布事件时同一订阅批次中一个处理器抛出错误
- **THEN** 同批其他处理器仍被调用，且失败可被诊断边界观察

### Requirement: Public exports keep stable contracts only

公开入口 MUST 只导出稳定契约与必要工厂（含第 4 章已归档的平台、时间与释放契约），MUST NOT 导出内部事件队列或错误记录实现细节。

#### Scenario: Root entry exports stable framework contracts

- **WHEN** 外部模块从框架根入口导入
- **THEN** 可导入 Logger、ApplicationContext、Module、Platform、TimeSource、DisposeHandle 等稳定契约与必要工厂，且不暴露内部实现
