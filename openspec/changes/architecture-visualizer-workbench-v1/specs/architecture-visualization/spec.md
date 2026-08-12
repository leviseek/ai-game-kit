## Purpose

为仓库提供一个本地架构可视化工作台，将代码关系转换为六类可检查图，并以可验证、可增量更新的方式服务开发者。

## ADDED Requirements

### Requirement: Workspace entry points
系统 SHALL 提供 `arch`、`test:arch` 与 `build:arch-web` workspace 脚本，并将架构工具纳入根级测试和类型检查门禁。

#### Scenario: Display CLI help
- **WHEN** 开发者以 `--help` 启动 `arch`
- **THEN** CLI 输出用法并以退出码 0 结束

#### Scenario: Server mode before implementation
- **WHEN** 开发者在服务模式尚未接线的阶段启动 `arch` 且未传入 `--help`
- **THEN** CLI 输出明确的不可用错误并以退出码 1 结束

### Requirement: Six architecture views
系统 SHALL 提供六类架构图，并基于统一的结构化架构数据生成各视图。

#### Scenario: Select an architecture view
- **WHEN** 开发者在工作台选择任一受支持的架构图类型
- **THEN** 系统使用同一份架构数据模型呈现对应视图

### Requirement: Repository source discovery
系统 SHALL 通过 CodeGraph 公共 CLI 获取代码关系，并通过 TypeScript SourceScanner 扫描静态声明以及 import/export 关系。

#### Scenario: Build architecture data
- **WHEN** 工作台扫描目标仓库
- **THEN** 扫描结果包含 CodeGraph 公共 CLI 数据、静态声明和 import/export 关系

### Requirement: Browser updates use SSE
系统 SHALL 使用 Server-Sent Events（SSE）向浏览器推送架构数据更新，并且 MUST NOT 使用 WebSocket。

#### Scenario: Receive an architecture update
- **WHEN** 服务端产生新的架构数据
- **THEN** 已连接浏览器通过 SSE 接收更新

### Requirement: Foundation dependency boundary
系统 MUST 复用仓库现有工具链，不新增 package，并且首版 MUST NOT 暴露 MCP 接口。

#### Scenario: Validate foundation scope
- **WHEN** 开发者检查架构工作台的 package 与公开入口
- **THEN** 工具仅声明仓库已有开发依赖且不存在 MCP 接口
