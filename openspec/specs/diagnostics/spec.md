# diagnostics Specification

## Purpose

为 Framework 提供统一的类型化错误与诊断边界：所有框架错误共享可追溯的 cause、来源上下文与可恢复性分类，并能在结构化日志中安全呈现，避免敏感字段泄漏。

## Requirements

### Requirement: Framework errors carry typed context and causes

框架抛出的错误 MUST 可分类为可恢复或不可恢复，MUST 携带模块/阶段/来源等上下文，MUST 保留嵌套 cause 链以支持根因诊断。

#### Scenario: Error preserves nested cause
- **WHEN** 一个框架操作失败，其底层原因本身又由更底层的错误导致
- **THEN** 抛出的错误保留完整 cause 链，可逐层追溯至根因

#### Scenario: Error exposes recoverability classification
- **WHEN** 调用方检查框架错误
- **THEN** 可判断该错误是否为可恢复错误，并据此决定重试或终止

#### Scenario: Error carries module and phase context
- **WHEN** 模块生命周期或资源操作失败
- **THEN** 错误携带所属模块标识与失败阶段，便于定位故障来源

### Requirement: Diagnostics redact sensitive fields

诊断与日志输出 MUST 过滤已知敏感字段（如密钥、令牌、私有配置值），MUST NOT 将敏感数据写入日志记录。

#### Scenario: Sensitive fields are redacted in log records
- **WHEN** 日志上下文或错误上下文包含敏感字段
- **THEN** 写入诊断记录的内容不包含敏感字段的原始值

#### Scenario: Redaction preserves non-sensitive context
- **WHEN** 记录中同时存在敏感字段与普通上下文
- **THEN** 普通上下文完整保留，仅敏感字段被过滤

### Requirement: ApplicationContext exposes only logger and read-only lifecycle state

`ApplicationContext` MUST 仅提供 Logger 与只读生命周期查询，MUST NOT 提供类型化 token、服务解析或 `get<T>()` 能力，以阻止退化为 Service Locator。

#### Scenario: Context offers no service resolution
- **WHEN** 使用方尝试通过 ApplicationContext 解析或注册服务
- **THEN** 类型上不存在任何解析/注册入口，只能访问 Logger 与只读生命周期状态
