# framework-diagnostics Specification

## Purpose

为 FUI 运行时绑定与页面生命周期提供类型化错误与端到端清理失败隔离：所有清理步骤逐一尝试，单步失败不阻断后续步骤，结束时聚合报告全部失败，使清理与错误可诊断且不互相吞没。

## Requirements

### Requirement: FUI 错误类型化并继承 FrameworkError

FUI 注册、创建、绑定与清理错误 SHALL 集中于类型化错误模块并继承 `FrameworkError`，携带组件/URL 上下文与首个 cause。清理聚合错误 `FuiViewCleanupError` SHALL 冻结并携带完整 `errors` 数组；仅需要业务方识别的类型 SHALL 进入根公共导出，其余保持内部。

#### Scenario: 清理错误继承 FrameworkError

- **WHEN** 构造 `FuiViewCleanupError`
- **THEN** 其 instanceof `FrameworkError`，携带组件标识上下文与首个 cause，`errors` 数组被冻结且完整

#### Scenario: 内部错误不进公共导出

- **WHEN** 检查框架根公共导出
- **THEN** 注册/创建/绑定错误仅内部可见，注册表不再保留旧错误 re-export

### Requirement: 端到端清理失败隔离

View、页面 Adapter、UiHost 与会话资源作用域的清理 SHALL 尝试每一个步骤，单个步骤失败 SHALL NOT 阻断其余步骤；各层 SHALL 先收敛自身为已销毁/未持有状态再逐项清理；全部失败 SHALL 被收集并在结束时聚合报告（同步 API 抛聚合错误，已有 Logger 边界按现有模式逐项记录后继续）。重复清理 SHALL 幂等。

#### Scenario: 单步失败不阻断其余清理

- **WHEN** View dispose 时多个 owner 中某个抛错
- **THEN** 其余 owner 逆序仍全部执行，`onClose` 仍被调用，最终抛 `FuiViewCleanupError` 并携带全部失败

#### Scenario: 多层清理错误全部保留

- **WHEN** View 与 GComponent 的 dispose 同时抛错
- **THEN** 两个错误均被保留在聚合错误中，页面仍被标记为已销毁

#### Scenario: 页面失败不阻断其它页面与容器

- **WHEN** 一个页面 dispose 抛错而同一 Adapter 下仍有其它页面与容器待清理
- **THEN** 其余页面与容器继续清理，错误在结束时聚合报告

#### Scenario: 会话资源在失败后仍被释放

- **WHEN** 会话收尾时 `navigator.close` 与页面销毁同时失败
- **THEN** 会话作用域 `release` 仍执行，多个错误均被保留

#### Scenario: 重复清理幂等

- **WHEN** 同一对象 dispose 被重复调用
- **THEN** 不抛错且无额外副作用
