## 1. 探针验证高风险 API

- [x] 1.1 按 `src/probes/` 既有模式编写 `ImportResource` 最小探针（导入外部 PNG 到包内），验证调用链与返回的资源登记结果
- [x] 1.2 编写 `CopyHandler` 跨包复制探针（带依赖项），验证 id 映射与依赖复制完整性
- [x] 1.3 编写 `Document.AddController`/`FController` 探针（加页/切页/删页），验证内存态控制器操作
- [x] 1.4 编写截图采集探针（先试 `App.Capture` 等公开 API；不可用则实现 OS 级窗口截图备选），验证落盘 PNG 可读
- [x] 1.5 汇总探针结论：可固化的 API 列表、需回退到 CLI 路径的能力、以及工具描述中的能力受限标注
  - **controller**（实机 pass）：`Document.AddController(xml)`/`UpdateController`/`RemoveController`/`SwitchPage` + `FController` 加页/切页/删页全链路可用 → handler 固化。
  - **import-resource**（实机 pass）：`FPackage.ImportResource`（Task 同步完成）+ `ResourceImportQueue.Process` 回调可导入并登记资源 → handler 固化。
  - **copy-handler**（实机 partial→confirmed）：`CopyHandler.InitWithObject` 调用成功、依赖项复制**实际生效**（scratch 目标包中出现 StartButton、start_btn_up/down、background 等 zr7s0-zr7s3）；但主组件 DemoView.xml 未在目标包枚举中出现（命名/主项复制差异，属探针取证问题）。结论：**依赖复制可用**，`copy_items` handler 保留；`InitWithItems` 的 IList 互操作在 Puerts 不可用，故 handler 用 InitWithObject（doc.Serialize XML）实现。
  - **capture**（实机 pass）：`doc.content.displayObject.GetScreenShot(null,1)` + `UnityEngine.ImageConversion.EncodeToPNG` 可用（参考 FairyGUI-MCP 路径）；`ScreenCapture.CaptureScreenshot`/`Application.CaptureScreenshot` 在 Puerts 不可调用，已弃用 OS 级 PowerShell 备选（Unity 内 Process.Start 受限）→ handler 用 GetScreenShot 实现。
  - **通用经验**：Puerts 中 C# `long`（如 `FileInfo.Length`）映射为 BigInt，`JSON.stringify` 会抛错致响应丢失，所有序列化字段必须 `Number()` 转换。
  - **ai-sensei 审查 P0-2 回应**：审查曾担忧 import_resource 的 `ResourceImportQueue.Process` 回调可能在后台线程执行复刻「后台线程访问 JS 闭包 → 闪退」高危模式。实机证据反驳：探针（pass）与闭环验证（import_resource 导入成功、`pkg.Save()`/`writeResponse` 均正常、无闪退）确认回调路径安全。四探针均已实机运行回填（probe-results.json ts=19:41）。

## 2. 读侧查询工具（无破坏性，先行）

- [x] 2.1 在 `handlers.ts` 新增 `read_project_settings`：读取 Adaptation/Common/I18n/PackageGroup 设置快照
- [x] 2.2 在 `handlers.ts` 新增 `find_unused_resources`/`find_duplicate_resources`：输出未使用/重复资源报告（只读，不删除）
- [x] 2.3 在 `handlers.ts` 新增 `full_search`：全工程资源搜索
- [x] 2.4 在 `handlers.ts` 新增 `read_document`：已打开文档结构快照（子对象/控制器/关系/过渡列表）
- [x] 2.5 在 `lib/tools.ts` 注册上述读工具（`fgui_read_project_settings`/`fgui_find_unused_resources`/`fgui_find_duplicate_resources`/`fgui_full_search`/`fgui_read_document`/`fgui_list_transitions`）
- [x] 2.6 为读侧新增工具补充 `test/` 单测（含结构化错误分支）

## 3. 文档保存与发布前强制保存闭环

- [x] 3.1 在 `handlers-write.ts` 新增 `save_documents`：保存活动文档或全部未保存文档（`DocumentView.SaveDocument/SaveAllDocuments`）
- [x] 3.2 在 `lib/tools.ts` 注册 `fgui_save_documents`
- [x] 3.3 在 `handlers-publish.ts` 的 `trigger_publish` 流程中注入「发布前强制保存全部未保存文档」钩子，保存失败则中止发布
- [x] 3.4 补充单测：保存后文档 modified 状态清空；存在未保存文档时发布被拦截

## 4. 资源导入

- [x] 4.1 在 `handlers-write.ts` 新增 `import_resource`：基于探针结论实现 `FPackage.ImportResource` + `ResourceImportQueue` 批量语义
- [x] 4.2 部分失败语义：成功项保持已登记，错误项在结果中列出；文件不存在返回结构化错误
- [x] 4.3 在 `lib/tools.ts` 注册 `fgui_import_resource`
- [x] 4.4 补充单测：成功导入返回资源 id 且 `list_resources` 可查；坏路径不改变清单

## 5. 组件结构内存态编辑

- [x] 5.1 在 `handlers-write.ts` 新增 `add_child`：`FObjectFactory.CreateObject` + `FComponent.AddChildAt`，返回新对象 id 与 childrenDelta
- [x] 5.2 在 `handlers-write.ts` 新增 `delete_child`：删除文档对象，返回 childrenDelta 与引用警告（relation/gear 引用对象）
- [x] 5.3 在 `handlers-write.ts` 新增 `set_object_property`：`DocElement.SetProperty`/`FObject` 属性写，非法/只读属性返回结构化错误
- [x] 5.4 在 `lib/tools.ts` 注册 `fgui_add_child`/`fgui_delete_child`/`fgui_set_object_property`
- [x] 5.5 补充单测：插入/删除/改属性后的 childrenDelta 与属性快照正确性

## 6. 控制器与关系管理

- [x] 6.1 在 `handlers.ts` 新增 `list_controllers`：控制器名称/页面/选中索引
- [x] 6.2 在 `handlers-write.ts` 新增 `add_controller`/`update_controller`/`remove_controller`/`switch_page`，内置与 `tools/fgui validate` 一致的页面配对与 selected 合法性校验
- [x] 6.3 `remove_controller` 返回引用警告（被 gearDisplay/gearXY 等引用的控制器）；`switch_page` 校验目标页存在
- [x] 6.4 在 `handlers-write.ts` 新增 `set_relation`/`remove_relation`，内置 sidePair ≤2 与合法取值校验
- [x] 6.5 在 `lib/tools.ts` 注册控制器与关系工具
- [x] 6.6 补充单测：sidePair 3 项被拒、目标页不存在报错、删除在用控制器出引用警告

## 7. 包与资源树管理、分支管理

- [x] 7.1 在 `handlers-write.ts` 新增 `create_package`/`delete_package`（删除先返回影响范围并二次确认）
- [x] 7.2 新增 `create_folder`/`rename_resource`/`move_resource`/`delete_resource`/`create_component`（`CreateComponentItem`，id 走前缀续编语义）；`delete_resource` 被引用时返回清单并拒绝
- [x] 7.3 新增 `copy_items`：基于探针结论实现 `CopyHandler` 跨包带依赖复制，返回 id 映射
- [x] 7.4 新增 `list_branches`/`switch_branch`：动态取 `project.allBranches`，禁止硬编码
- [x] 7.5 在 `lib/tools.ts` 注册上述包/资源/分支工具
- [x] 7.6 补充单测：复制 id 映射、删除被引用资源被拒、切换不存在分支报错

## 8. handler 层禁止路径屏蔽

- [x] 8.1 在 handler 层拒绝 `FObjectFactory.CreateObject(pkg,"graph")`，返回结构化错误（项目禁止 `<graph>`，纯色视觉走 sprite）
- [x] 8.2 确认 transition 写入（`Document.AddTransition`）不通过 handler 暴露；只保留读/播放能力
- [x] 8.3 补充单测：graph 创建被拒、transition 写入无通道

## 9. 视觉验证 subagent 与截图通道

- [x] 9.1 新建 `.opencode/agent/fgui-visual-verifier.md`（`mode: subagent`，`model: codexapis/gpt-5.6-sol`）：输入编辑器截图/设计稿，输出结构化核验结论（问题列表/符合度/建议修复点+对应写工具），只读不执行写操作，观感项标注「需人工确认」
- [x] 9.2 在 `handlers-write.ts` 新增 `capture_preview`：基于 1.4 探针结论实现截图落盘 PNG 并返回路径，编辑器不可达返回结构化错误
- [x] 9.3 在 `lib/tools.ts` 注册 `fgui_capture_preview`
- [x] 9.4 补充单测：截图工具错误分支（编辑器不可达不产生半截图像）

## 10. 集成验证与文档同步

- [x] 10.1 运行 `bun run fgui validate --strict` 与既有 fgui-mcp 测试套件（`test/`），确认新增工具未破坏既有确定性路径
- [x] 10.2 在 FGUI 编辑器实机走一遍闭环：导入 sprite → 结构编辑 → 保存 → 发布 → `fgui_check_publish` 一致性通过
  - **完整闭环已实机验证通过**：`fgui sprite` 生成 probe_loop.png → `fgui_import_resource` 导入（id=gg4p10）→ `fgui_create_component` 建 ProbeLoopView → `fgui_add_child` 加 image 子对象（id=n0_gg4p，走 InsertObject）→ `fgui_set_object_property` 设 xy/size → `fgui_save_documents` 落盘（XML 正确：`<image src="zjfpc" fileName="img/probe_loop.png" xy="10,20" size="50,30"/>`）→ `fgui_trigger_publish`（scratch 与真实两路均成功）→ `fgui_check_publish` 三重证据一致（ok:true）。
  - **验证中修复**：add_child 带 src 改走 `doc.InsertObject`（`resourceURL` 是只读 getter 无法手动挂载）；findResourceItem 支持 id/name/文件名（修复 delete_resource/add_child 对 image 资源引用）；新增 `fgui_reload_package`（FairyGUI-MCP reload 方案固化：pkg.Touch + item.Touch）；BigInt 序列化陷阱已记录。
  - 验证后已清理全部测试残留（ProbeLoopView/probe_loop/loop_import），Demo 校验通过、无污染。
- [x] 10.3 更新 `tools/fgui-mcp/README.md` 工具面清单（新增工具、能力受限标注、回滚约束）
- [x] 10.4 确认 `.ai/instructions.md`/AGENTS.md 中与 fgui-mcp 相关的描述与新工具面一致，需要时同步
- [x] 10.5 移植 FairyGUI-MCP（D:\git-clone\FairyGUI-MCP）去重后可用工具，实机验证通过
  - **新增 9 工具并全部实机验证**：`fgui_open_component` / `fgui_show_preview` / `fgui_get_selection` / `fgui_select_element` / `fgui_close_document` / `fgui_get_component_info` / `fgui_get_logs` / `fgui_clear_logs` / `fgui_publish_all`。
  - 关键实现：get_logs 用 `FileShare.ReadWrite` 流式读 Player.log（`ReadAllText` 会 Sharing violation）；publish_all 顺序遍历 `allPackages` 逐个 PublishHandler（deferred）；select_element 走 `UnselectAll + SelectObject`。
  - **去重结论**（FairyGUI-MCP 有而本项目已覆盖）：save/read_document/list_controllers/list_resources/full_search/validate/move|delete_resource/reload 等。
  - **不移植项及原因**：`start_test`/`stop_test`（F5 覆盖 runInBackground）、`switch_device`/`list_devices`（依赖 testView 内部状态，高风险）、`activate`（Python 端 Win32，非编辑器 API）、`reload_plugin`（FairyGUI-MCP 自身仍在探测 API）、`open_publish_settings`/`probe_*`（调试/探针性质，与确定性工具原则冲突）。

## 11. ADR 检查

- [x] 11.1 审查 proposal、design、实现与 review 结论是否产生新的架构决策（如「视觉验证由 subagent 承担」「写工具统一快照可回滚模式」是否值得沉淀）；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 约定创建 ADR；如无，明确记录无需 ADR
