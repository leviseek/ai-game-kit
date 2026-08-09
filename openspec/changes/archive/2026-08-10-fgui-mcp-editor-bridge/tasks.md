## 1. 阶段 0：实机探针

- [x] 1.1 基于三例同构骨架（package.json main + 顶层副作用 + 钩子导出）搭建最小探针插件，验证插件能在目标 FGUI 编辑器版本编译、加载
- [x] 1.2 探针 `activeDoc.InsertObject(url)`：验证是否要求文档激活、插入是否可见、是否需要 `SetModified`，输出结论文档
- [x] 1.3 探针 `new PublishHandler(pkg, branch).Run()`：验证主线程要求、`onComplete` 时序、`isSuccess` 行为、是否递归触发 `onPublish`、错误契约，输出结论文档
- [x] 1.4 探针 `System.Net.HttpListener`：验证 Puerts 下能否 `Start()` 并响应本地请求、回调线程是否可安全调用编辑器 API；同时验证文件邮箱模式可行性，记录两者稳定性对比
- [x] 1.5 探针 `pkg.Open()` 刷新包设置的即时性与副作用，记录编辑区闪烁影响
- [x] 1.6 汇总探针结论：收敛未知区清单，据此在阶段 3/4 前决策发布触发策略与桥接通道选择
- [x] 1.7 修复三个探针缺陷并复测：publish-handler 的 branch 取值（禁止硬编码 master）、http-listener 的端口获取（HttpListener 不支持端口 0）、insert-object 的 item 查找（改用 `FindItemByName` + `GetItemByPath` 候选形态附属探测）
- [x] 1.8 文件邮箱模式实测通过（读写闭环）；`pkg.Open()` 实测幂等、15ms、编辑区闪烁"是"
- [x] 1.9 复测确认：`PublishHandler.Run()` 空 branch 构造合法、同步返回 299ms、onComplete/isSuccess/onPublish 钩子全触发；HttpListener 端口扫描后 Start/响应/回调线程可读编辑器 API 均通过
- [x] 1.10 insert-object v2 复测通过：数据真实进入文档（children 2→3、appActiveSame=true、opDocIsAppActive=true）、编辑区人工可见 → 组件插入 MCP 工具可开放

## 2. 阶段 1：MCP server 骨架与读工具

- [x] 2.1 在 `tools/fgui-mcp/` 建立独立进程 MCP server（Bun + MCP SDK devDependency），**主桥接通道采用文件邮箱模式**（已实测通过、天然主线程轮询无跨线程风险）；HTTP 作为可选增强待复测
- [x] 2.2 实现读工具：包列表、资源清单（复用 `GetPackageByName`/`items` 遍历证据）、依赖查询（`DependencyQuery`）、发布配置读取（`GetSettings("Publish")` + 反射读字段）、活动文档/活动文件夹
- [x] 2.3 读工具结果与 `tools/fgui` CLI（`list-resources`/`validate`/`read-component`）交叉验证一致，补充一致性测试
- [x] 2.4 实现错误处理：编辑器不可达/操作失败返回结构化错误，不中断后续调用

## 3. 阶段 2：写工具

- [x] 3.1 实现发布配置切换：快照 → CopySetting（跳过只读 `fileName`）→ `Save()` → `project.type` → `project.Save()` → `allPackages.Open()`，返回副作用提示（含"编辑区会闪烁"）
- [x] 3.2 实现发布配置回滚：基于切换前快照恢复，验证只读字段保持原值
- [x] 3.3 实现 `fgui-refresh`（`App.RefreshProject`）端点，供写操作后刷新编辑器感知
- [x] 3.4 探针复测通过后实现组件插入工具（`FindItemByName` → `GetURL` → `OpenDocument` → `UnselectAll` + `InsertObject(url)` → `SetModified`）；未通过则保持禁用并记录原因
- [x] 3.5 发布/分支相关工具参数：branch 为可选参数，默认取 `project.activeBranch`（允许空串），合法值由 `allBranches` 动态生成，**禁止硬编码分支名**（工程当前为无分支形态，MCP 需能表达"发布到主干/无分支"）——设计约束固化于 design.md 决策 4，`fgui_trigger_publish`（5.1）已实现 branch 动态校验

## 4. 阶段 3：半自动发布闭环与一致性检测

- [x] 4.1 在插件中注册 `onPublishEnd`/`onPublish` 钩子：写邮箱文件（含包列表、时间戳），必要时读 `isSuccess`/`exportPath`
- [x] 4.2 MCP server 实现产物检测：发布信号 + 产物 mtime/hash 新鲜度 + `bun run fgui validate --strict` 三重证据判定，失败返回差异明细
- [x] 4.3 实现端到端 demo：改源 XML → 配置切换 → 用户点击发布 → 自动检测 → validate 报告
- [x] 4.4 补充检测链路测试：陈旧 bin 被标记、邮箱信号缺失被标记、validate 失败被标记

## 5. 阶段 4（Run() 已复测通过，可推进）

- [x] 5.1 实现 `fgui_trigger_publish` 全自动发布工具：`new PublishHandler(pkg, activeBranch)` + `Run()`，等待 `onComplete` 并返回 `isSuccess`/`exportPath`；branch 默认取 `project.activeBranch`（空串合法），合法值由 `allBranches` 动态生成，禁止硬编码分支名
- [x] 5.2 实测一次大包发布（AutoBattle），确认 Run() 主线程阻塞表现；若阻塞明显，工具返回中提示"发布期间编辑器卡顿"——实机验证 AutoBattle 232ms 无卡顿
- [x] 5.3 HttpListener 增强通道：复测通过后（回调线程可读编辑器 API 已确认）作为主通道候选或加速通道；文件邮箱仍为默认主通道——`runInBackground` 已根治后台轮询停摆，HTTP 增强通道必要性降低，保留文件邮箱为主通道
- [x] 5.4 端到端全自动验证：意图 → 组件操作 → 发布 → 检测，无人工干预——实机跑通「配置切换 → 真实发布 assets/ui → check_publish 三重证据全绿」

## 6. 收尾

- [x] 6.1 补充 `tools/fgui-mcp/` 的 README 与扩展方向说明，更新 docs 中 FGUI 工作流章节（如需要）
- [x] 6.2 ADR 检查：change 完成前评估是否产生新架构决策（双组件桥接架构、半自动发布策略、文件邮箱主通道、无分支工程处理），按 `doc/decisions/ADR-NNN-<slug>.md` 约定创建 ADR；如无则明确记录无需 ADR——已创建 `ADR-023-fgui-mcp-editor-bridge.md`
