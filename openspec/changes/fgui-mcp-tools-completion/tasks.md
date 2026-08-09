## 1. 探针验证高风险 API

- [ ] 1.1 按 `src/probes/` 既有模式编写 `ImportResource` 最小探针（导入外部 PNG 到包内），验证调用链与返回的资源登记结果
- [ ] 1.2 编写 `CopyHandler` 跨包复制探针（带依赖项），验证 id 映射与依赖复制完整性
- [ ] 1.3 编写 `Document.AddController`/`FController` 探针（加页/切页/删页），验证内存态控制器操作
- [ ] 1.4 编写截图采集探针（先试 `App.Capture` 等公开 API；不可用则实现 OS 级窗口截图备选），验证落盘 PNG 可读
- [ ] 1.5 汇总探针结论：可固化的 API 列表、需回退到 CLI 路径的能力、以及工具描述中的能力受限标注

## 2. 读侧查询工具（无破坏性，先行）

- [ ] 2.1 在 `handlers.ts` 新增 `read_project_settings`：读取 Adaptation/Common/I18n/PackageGroup 设置快照
- [ ] 2.2 在 `handlers.ts` 新增 `find_unused_resources`/`find_duplicate_resources`：输出未使用/重复资源报告（只读，不删除）
- [ ] 2.3 在 `handlers.ts` 新增 `full_search`：全工程资源搜索
- [ ] 2.4 在 `handlers.ts` 新增 `read_document`：已打开文档结构快照（子对象/控制器/关系/过渡列表）
- [ ] 2.5 在 `lib/tools.ts` 注册上述读工具（`fgui_read_project_settings`/`fgui_find_unused_resources`/`fgui_find_duplicate_resources`/`fgui_full_search`/`fgui_read_document`/`fgui_list_transitions`）
- [ ] 2.6 为读侧新增工具补充 `test/` 单测（含结构化错误分支）

## 3. 文档保存与发布前强制保存闭环

- [ ] 3.1 在 `handlers-write.ts` 新增 `save_documents`：保存活动文档或全部未保存文档（`DocumentView.SaveDocument/SaveAllDocuments`）
- [ ] 3.2 在 `lib/tools.ts` 注册 `fgui_save_documents`
- [ ] 3.3 在 `handlers-publish.ts` 的 `trigger_publish` 流程中注入「发布前强制保存全部未保存文档」钩子，保存失败则中止发布
- [ ] 3.4 补充单测：保存后文档 modified 状态清空；存在未保存文档时发布被拦截

## 4. 资源导入

- [ ] 4.1 在 `handlers-write.ts` 新增 `import_resource`：基于探针结论实现 `FPackage.ImportResource` + `ResourceImportQueue` 批量语义
- [ ] 4.2 部分失败语义：成功项保持已登记，错误项在结果中列出；文件不存在返回结构化错误
- [ ] 4.3 在 `lib/tools.ts` 注册 `fgui_import_resource`
- [ ] 4.4 补充单测：成功导入返回资源 id 且 `list_resources` 可查；坏路径不改变清单

## 5. 组件结构内存态编辑

- [ ] 5.1 在 `handlers-write.ts` 新增 `add_child`：`FObjectFactory.CreateObject` + `FComponent.AddChildAt`，返回新对象 id 与 childrenDelta
- [ ] 5.2 在 `handlers-write.ts` 新增 `delete_child`：删除文档对象，返回 childrenDelta 与引用警告（relation/gear 引用对象）
- [ ] 5.3 在 `handlers-write.ts` 新增 `set_object_property`：`DocElement.SetProperty`/`FObject` 属性写，非法/只读属性返回结构化错误
- [ ] 5.4 在 `lib/tools.ts` 注册 `fgui_add_child`/`fgui_delete_child`/`fgui_set_object_property`
- [ ] 5.5 补充单测：插入/删除/改属性后的 childrenDelta 与属性快照正确性

## 6. 控制器与关系管理

- [ ] 6.1 在 `handlers.ts` 新增 `list_controllers`：控制器名称/页面/选中索引
- [ ] 6.2 在 `handlers-write.ts` 新增 `add_controller`/`update_controller`/`remove_controller`/`switch_page`，内置与 `tools/fgui validate` 一致的页面配对与 selected 合法性校验
- [ ] 6.3 `remove_controller` 返回引用警告（被 gearDisplay/gearXY 等引用的控制器）；`switch_page` 校验目标页存在
- [ ] 6.4 在 `handlers-write.ts` 新增 `set_relation`/`remove_relation`，内置 sidePair ≤2 与合法取值校验
- [ ] 6.5 在 `lib/tools.ts` 注册控制器与关系工具
- [ ] 6.6 补充单测：sidePair 3 项被拒、目标页不存在报错、删除在用控制器出引用警告

## 7. 包与资源树管理、分支管理

- [ ] 7.1 在 `handlers-write.ts` 新增 `create_package`/`delete_package`（删除先返回影响范围并二次确认）
- [ ] 7.2 新增 `create_folder`/`rename_resource`/`move_resource`/`delete_resource`/`create_component`（`CreateComponentItem`，id 走前缀续编语义）；`delete_resource` 被引用时返回清单并拒绝
- [ ] 7.3 新增 `copy_items`：基于探针结论实现 `CopyHandler` 跨包带依赖复制，返回 id 映射
- [ ] 7.4 新增 `list_branches`/`switch_branch`：动态取 `project.allBranches`，禁止硬编码
- [ ] 7.5 在 `lib/tools.ts` 注册上述包/资源/分支工具
- [ ] 7.6 补充单测：复制 id 映射、删除被引用资源被拒、切换不存在分支报错

## 8. handler 层禁止路径屏蔽

- [ ] 8.1 在 handler 层拒绝 `FObjectFactory.CreateObject(pkg,"graph")`，返回结构化错误（项目禁止 `<graph>`，纯色视觉走 sprite）
- [ ] 8.2 确认 transition 写入（`Document.AddTransition`）不通过 handler 暴露；只保留读/播放能力
- [ ] 8.3 补充单测：graph 创建被拒、transition 写入无通道

## 9. 视觉验证 subagent 与截图通道

- [ ] 9.1 新建 `.opencode/agent/fgui-visual-verifier.md`（`mode: subagent`，`model: codexapis/gpt-5.6-sol`）：输入编辑器截图/设计稿，输出结构化核验结论（问题列表/符合度/建议修复点+对应写工具），只读不执行写操作，观感项标注「需人工确认」
- [ ] 9.2 在 `handlers-write.ts` 新增 `capture_preview`：基于 1.4 探针结论实现截图落盘 PNG 并返回路径，编辑器不可达返回结构化错误
- [ ] 9.3 在 `lib/tools.ts` 注册 `fgui_capture_preview`
- [ ] 9.4 补充单测：截图工具错误分支（编辑器不可达不产生半截图像）

## 10. 集成验证与文档同步

- [ ] 10.1 运行 `bun run fgui validate --strict` 与既有 fgui-mcp 测试套件（`test/`），确认新增工具未破坏既有确定性路径
- [ ] 10.2 在 FGUI 编辑器实机走一遍闭环：导入 sprite → 结构编辑 → 保存 → 发布 → `fgui_check_publish` 一致性通过
- [ ] 10.3 更新 `tools/fgui-mcp/README.md` 工具面清单（新增工具、能力受限标注、回滚约束）
- [ ] 10.4 确认 `.ai/instructions.md`/AGENTS.md 中与 fgui-mcp 相关的描述与新工具面一致，需要时同步

## 11. ADR 检查

- [ ] 11.1 审查 proposal、design、实现与 review 结论是否产生新的架构决策（如「视觉验证由 subagent 承担」「写工具统一快照可回滚模式」是否值得沉淀）；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 约定创建 ADR；如无，明确记录无需 ADR
