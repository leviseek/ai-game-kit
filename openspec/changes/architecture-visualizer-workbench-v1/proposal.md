## Why

仓库缺少可直接检查架构关系的本地工作台，开发者难以统一查看代码结构与依赖变化。现在需要先建立可验证、零新增依赖的基础能力，为后续六类架构图实现提供稳定入口。

## What Changes

- 新增架构可视化工作台 workspace、CLI、Web 编译入口与测试门禁。
- 工作台最终提供六类架构图，并通过 CodeGraph 公共 CLI 获取结构化代码关系。
- 新增 TypeScript SourceScanner，扫描静态声明以及 import/export 关系，补充 CodeGraph 数据。
- 浏览器更新通道使用 Server-Sent Events（SSE），不使用 WebSocket。
- 首版不提供 MCP 接口。
- 复用仓库现有 TypeScript 与 Bun 工具链，不新增 package。

## Capabilities

### New Capabilities

- `architecture-visualization`: 定义本地架构工作台的数据采集、六类图展示、SSE 更新与 CLI 行为。

### Modified Capabilities

无。

## Impact

- 新增 `tools/arch-viewer` workspace 及根级 `arch`、`test:arch`、`build:arch-web` 脚本。
- 根级测试与类型检查门禁纳入架构可视化工具。
- 数据采集依赖本机可用的 CodeGraph 公共 CLI 和仓库 TypeScript 源码，不引入新的第三方 package。
