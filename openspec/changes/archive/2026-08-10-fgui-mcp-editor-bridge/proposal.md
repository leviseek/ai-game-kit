## Why

当前 FGUI 工作流由 `tools/fgui` 确定性 CLI（XML 生成/校验）与 FGUI 编辑器人工操作组成：组件创建/编辑依赖 CLI 手写 XML，发布产物（`assets/ui/*/*.bin` 与 atlas）必须由编辑器人工发布，且缺乏"发布后自动检测产物与源一致"的机制。这切断了「文字/效果图 → LLM → FGUI 组件 → 客户端产物」的自动化链路，也容易让源 XML 与陈旧 bin 失配。目标是为 FGUI 编辑器实现一个 MCP（Model Context Protocol）桥，让 AI 代理能程序化驱动编辑器完成组件操作、发布触发与产物检测，闭环从意图到客户端产物的全链路。

## What Changes

- 新增**编辑器侧 FGUI MCP 桥插件**（TS/Puerts，独立于 `tools/fgui` CLI）：暴露确定性操作端点，包括发布配置切换（直接复用 `MenuMain_Publish` 已验证链路）、包/资源遍历（`GetPackageByName`/`items`/`DependencyQuery`）、发布钩子内产物后处理与邮箱通知。
- 新增**独立进程 MCP server**（Node/TS，标准 MCP SDK）：编排工具调用，透传 `tools/fgui` CLI 完成 XML 读写/校验，经本地桥接层驱动编辑器发布，并做产物新鲜度/一致性检测。
- 新增**发布自动检测链路**：发布成功后校验 bin/atlas 产物 mtime/hash、`onPublishEnd` 邮箱信号与 `bun run fgui validate --strict` 三重证据，判定"产物与源一致"。
- **非破坏性**：不迁移 `tools/fgui` 现有确定性能力，XML 生成/校验仍留在 CLI；MCP 只做编辑器独有能力（发布、刷新、编辑器级查询）。
- **首期发布半自动**：配置切换与检测全自动，发布动作默认保留"用户点一下"边界；`PublishHandler.Run()` 全自动发布待实机探针验证后开放。

## Capabilities

### New Capabilities

- `fgui-editor-mcp-bridge`: 编辑器侧 FGUI MCP 桥能力——独立进程 MCP server 经本地桥接层与 FGUI 编辑器插件通信，提供包/资源查询、发布配置切换、发布触发与产物检测的确定性工具面，并保持 `tools/fgui` CLI 为 XML 生成/校验的权威执行层。

### Modified Capabilities

<!-- 无现有 spec 的需求变化。FGUI 编辑器桥是新能力，与 fairygui-ui-adapter（运行时页面适配）无 spec 级行为交集。 -->

## Impact

- **代码**：新增 `tools/fgui-mcp/`（MCP server 与桥接协议）、`tools/fgui-mcp-plugin/`（编辑器插件，或独立仓库），不改动 `tools/fgui` CLI 行为。
- **发布产物**：`assets/ui/*/*.bin` 与 atlas 仍由 FGUI 编辑器发布生成，禁止手改；新增的检测链路只读校验，不触碰产物。
- **配置**：发布目标（path/fileExtension/atlasSetting）经 `GlobalPublishSettings` 程序化写入，切换前需快照以支持回滚。
- **风险**：`PublishHandler.Run()`、HttpListener 线程模型、`activeDoc.InsertObject` 无实战证据，首期以半自动 + 探针收敛；不阻塞现有确定性工作流。
