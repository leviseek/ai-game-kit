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

系统 SHALL 提供 architecture hierarchy、startup flow、module dependencies、data flow、symbol calls and impact、resource lifecycle 六类架构图，并基于统一的结构化架构数据生成各视图。

#### Scenario: Inspect architecture hierarchy

- **WHEN** 开发者选择 architecture hierarchy
- **THEN** 系统按父子包含关系呈现目录、模块与符号层级

#### Scenario: Trace startup flow

- **WHEN** 开发者选择 startup flow
- **THEN** 系统从启动入口按执行方向呈现有序启动步骤

#### Scenario: Inspect module dependencies

- **WHEN** 开发者选择 module dependencies
- **THEN** 系统按依赖方向呈现模块间 import/export 关系

#### Scenario: Trace data flow

- **WHEN** 开发者选择 data flow
- **THEN** 系统按数据传播方向呈现生产者、传递节点与消费者

#### Scenario: Inspect symbol calls and impact

- **WHEN** 开发者选择 symbol calls and impact 并指定符号
- **THEN** 系统同时呈现该符号的调用方向与反向影响范围

#### Scenario: Inspect resource lifecycle

- **WHEN** 开发者选择 resource lifecycle
- **THEN** 系统按生命周期顺序呈现资源获取、所有权与释放关系

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
