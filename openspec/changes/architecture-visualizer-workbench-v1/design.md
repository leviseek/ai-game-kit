## Context

参见 `proposal.md` 的动机与范围。仓库使用 Bun 与 strict TypeScript，现有根级脚本串行执行各 workspace 的测试和类型检查；本 change 需要先建立可独立演进的工具边界，再在后续阶段接入扫描、服务与 Web 展示。

## Goals / Non-Goals

**Goals:**

- 用独立 `tools/arch-viewer` workspace 隔离 CLI、服务端逻辑、共享图模型与 Web 代码。
- 保持 CLI、SourceScanner、CodeGraph 适配器和 Web 展示可分别测试与替换。
- 从基础阶段开始纳入根级测试和两个 TypeScript 编译目标。

**Non-Goals:**

- 本阶段不启动 HTTP 服务、不实现六类图、不执行源码扫描。
- 首版不提供 MCP，不引入 WebSocket，也不新增第三方 package。

## Decisions

### 使用双 tsconfig 隔离运行环境

CLI 与服务端代码使用 Node/Bun 类型环境；Web 代码使用 `ES2022` 与 `DOM`，输出到 `temp/arch-viewer`。共享图类型由 Web tsconfig 显式纳入，避免浏览器代码隐式依赖服务端 API。备选的单一 tsconfig 会混合 DOM 与 Node 全局类型，降低边界清晰度，因此不采用。

### 通过适配边界组合两类扫描来源

CodeGraph 关系只通过公共 CLI 获取，TypeScript SourceScanner 负责静态声明与 import/export。两者后续汇总到共享图模型，不读取 CodeGraph 内部数据库。备选的直接读取内部存储耦合实现细节，因此不采用。

### 浏览器更新使用 SSE

架构数据更新是服务端到浏览器的单向推送，SSE 足以表达连接与增量事件，并可使用平台内建能力实现。WebSocket 增加双向协议和依赖管理复杂度，当前没有对应需求，因此不采用。

### 基础 CLI 先稳定退出契约

`run(argv)` 在 `--help` 时返回 0；服务模式接线前输出固定错误并返回 1。这样 workspace 可立即测试，后续服务实现只替换非帮助分支，不改变入口契约。

## Risks / Trade-offs

- [Risk] CodeGraph 公共 CLI 的输出或可用性变化会影响采集 → 通过单独适配器解析并在后续任务加入错误场景测试。
- [Risk] SourceScanner 与 CodeGraph 可能产生重复关系 → 在统一图模型层执行确定性去重，不让扫描器互相感知。
- [Risk] SSE 断线会遗漏更新 → 后续服务在连接建立时发送完整快照，增量事件仅用于刷新。
- [Risk] 双 tsconfig 可能出现共享类型不兼容 → 共享目录只保留无运行时依赖的数据类型，并同时纳入两个类型检查目标。
