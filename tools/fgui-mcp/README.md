# FGUI MCP server

让 AI 代理（OpenCode 等 MCP 客户端）直接驱动 FairyGUI 编辑器：查询包/资源、切换发布配置、插入组件、全自动发布、一致性检测——打通「意图 → FGUI 组件 → 客户端产物」链路。

## 架构

```
AI 代理 ──MCP stdio──► fgui-mcp server (Bun) ──文件邮箱──► FGUI 编辑器插件 (fgui-mcp-probe)
                        │ tools/fgui CLI 透传（validate 等）
                        └─ 外部检测（check_publish，不依赖编辑器）
```

- **MCP server**：本目录，`McpServer` + `StdioServerTransport`，独立进程。
- **编辑器插件**：`ui/demo/plugins/fgui-mcp-probe/`，TS→Puerts，经文件邮箱（`.objs/fgui-mcp-probe/mailbox/`）响应请求。
- **确定性工具**：XML 生成/校验永远由 `tools/fgui` CLI 承担，MCP 不实现。

## 启动

MCP 客户端经 stdio 拉起（`opencode.json` 已配置）：

```json
{ "command": ["bun", "run", "fgui-mcp"] }
```

前置：FGUI 编辑器已打开工程，`fgui-mcp-probe` 插件已加载（控制台出现「邮箱服务器启动」）。

## 工具清单

| 类别 | 工具 | 通道 |
| --- | --- | --- |
| 读 | `fgui_list_packages` / `fgui_list_resources` / `fgui_query_dependencies` / `fgui_read_publish_settings` / `fgui_get_active_context` | 编辑器桥 |
| 校验 | `fgui_validate_package` | fgui CLI |
| 写 | `fgui_switch_publish_settings` / `fgui_restore_publish_settings` / `fgui_refresh_project` / `fgui_insert_component` | 编辑器桥 |
| 发布 | `fgui_trigger_publish`（全自动，deferred 异步响应） | 编辑器桥 |
| 检测 | `fgui_check_publish`（三重证据：信号 + 产物 mtime + validate） | 外部 |

## 平台约束

- **编辑器窗口后台轮询**：插件已 `runInBackground = true`（持续重置），编辑器后台也能响应——无需保持前台。
- **发布安全**：`fgui_trigger_publish` 默认 `redirectToScratch=true` 重定向到 `.objs` 不碰真实产物；传 `redirectToScratch:false` 才写 `assets/ui`。
- **刷新插件**：插件已做幂等注册 + 驱动对称清理，刷新不会重复启动。

## 开发

```sh
bun run test:fgui-mcp    # 单元测试（bridge/工具/检测/deferred）
bun run typecheck:ci     # 类型检查（含本目录）
bun run tools/fgui-mcp/test/cross-verify.ts --package Demo  # 编辑器桥 vs CLI 交叉验证（需编辑器前台）
bun run tools/fgui-mcp/test/smoke-stdio.ts                  # stdio 握手 + 工具列表冒烟
```

## 未来扩展

- HTTP 增强通道（`HttpListener`，回调线程可读编辑器 API 已探针验证；`runInBackground` 解决后台问题后必要性降低）。
- 更多写工具（资源移动/删除、控制器切换、截图验证）。
