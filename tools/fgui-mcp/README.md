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
| 读 | `fgui_list_packages` / `fgui_list_resources` / `fgui_query_dependencies` / `fgui_read_publish_settings` / `fgui_get_active_context` / `fgui_read_project_settings` / `fgui_full_search` / `fgui_read_document` / `fgui_list_controllers` / `fgui_find_unused_resources` / `fgui_find_duplicate_resources` / `fgui_get_selection` / `fgui_get_component_info` / `fgui_get_logs` | 编辑器桥 |
| 校验 | `fgui_validate_package` | fgui CLI |
| 保存 | `fgui_save_documents`（写闭环：发布前自动强制保存） | 编辑器桥 |
| 刷新 | `fgui_reload_package`（pkg.Touch + item.Touch 精准刷新；full=true 走全量）/ `fgui_refresh_project` | 编辑器桥 |
| 资源 | `fgui_import_resource` / `fgui_create_component` / `fgui_create_folder` / `fgui_rename_resource` / `fgui_move_resource` / `fgui_delete_resource` / `fgui_copy_items` / `fgui_create_package` / `fgui_delete_package` | 编辑器桥 |
| 结构编辑 | `fgui_add_child` / `fgui_delete_child` / `fgui_set_object_property`（graph 禁止） | 编辑器桥 |
| 控制器 | `fgui_add_controller` / `fgui_update_controller` / `fgui_remove_controller` / `fgui_switch_page` | 编辑器桥 |
| 关系 | `fgui_set_relation` / `fgui_remove_relation`（sidePair ≤2 内置校验） | 编辑器桥 |
| 分支 | `fgui_list_branches` / `fgui_switch_branch` | 编辑器桥 |
| 文档/预览 | `fgui_open_component` / `fgui_show_preview` / `fgui_select_element` / `fgui_close_document` | 编辑器桥 |
| 日志 | `fgui_get_logs`（FileShare.ReadWrite 读 Player.log 尾部）/ `fgui_clear_logs` | 编辑器桥 |
| 截图 | `fgui_capture_preview`（GetScreenShot + EncodeToPNG，供视觉验证 subagent） | 编辑器桥 |
| 发布 | `fgui_trigger_publish` / `fgui_publish_all`（全自动，deferred 异步响应） | 编辑器桥 |
| 检测 | `fgui_check_publish`（三重证据：信号 + 产物 mtime + validate） | 外部 |

## 写工具通用约定

- **内存态操作需持久化**：`add_child`/`set_object_property`/控制器/关系等修改编辑器内存态文档，需 `fgui_save_documents` 落盘；发布流程会自动先保存全部未保存文档。
- **破坏性操作二次确认**：`delete_package`/`delete_resource` 先返回影响范围，调用方传 `confirm: true` 才执行。
- **项目禁令在 handler 层屏蔽**：创建/修改 `graph` 对象返回结构化错误；transition XML 写入不暴露（动画由 TS 推进 controller）。
- **跨包复制**：`fgui_copy_items` 走 `CopyHandler` 带依赖复制，跨包引用需遵循「只指向 Common 通用包」约定。

## 视觉验证

- `fgui_capture_preview` 截图后，交 `.opencode/agent/fgui-visual-verifier.md`（绑定 `codexapis/gpt-5.6-sol` 多模态）核对布局/像素/预览。
- 截图走 FairyGUI 官方路径（探针实机验证）：`doc.content.displayObject.GetScreenShot` + `UnityEngine.ImageConversion.EncodeToPNG`。`ScreenCapture.CaptureScreenshot`/`Application.CaptureScreenshot` 在 Puerts 不可调用；OS 级 PowerShell 截图在 Unity 内 `Process.Start` 受限。
- **Puerts 序列化陷阱**：C# `long`（如 `FileInfo.Length`）映射为 BigInt，`JSON.stringify` 会抛错致响应丢失，所有序列化字段必须 `Number()` 转换。

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
- 实机探针验证回填：`ImportResource`/`CopyHandler`/`AddController`/截图四类新探针待编辑器实机运行，汇总结论将固化到工具描述的能力受限标注。
- 组件模板（`ComponentTemplates`）暂缓工具化（骨架依赖官方库图片约定，与调色板锁定约定可能冲突）。
- FairyGUI-MCP 未移植项（因风险/不适配，见 design.md）：F5 预览测试（`start_test`/`stop_test` 覆盖 runInBackground）、设备切换（`switch_device` 依赖 testView 内部状态）、窗口激活（Win32，非编辑器 API）、插件重载（FairyGUI-MCP 自身仍在探测 API）。
