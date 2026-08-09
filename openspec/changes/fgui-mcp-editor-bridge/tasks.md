## 1. 阶段 0：实机探针

- [ ] 1.1 基于三例同构骨架（package.json main + 顶层副作用 + 钩子导出）搭建最小探针插件，验证插件能在目标 FGUI 编辑器版本编译、加载
- [ ] 1.2 探针 `activeDoc.InsertObject(url)`：验证是否要求文档激活、插入是否可见、是否需要 `SetModified`，输出结论文档
- [ ] 1.3 探针 `new PublishHandler(pkg, branch).Run()`：验证主线程要求、`onComplete` 时序、`isSuccess` 行为、是否递归触发 `onPublish`、错误契约，输出结论文档
- [ ] 1.4 探针 `System.Net.HttpListener`：验证 Puerts 下能否 `Start()` 并响应本地请求、回调线程是否可安全调用编辑器 API；同时验证文件邮箱模式可行性，记录两者稳定性对比
- [ ] 1.5 探针 `pkg.Open()` 刷新包设置的即时性与副作用，记录编辑区闪烁影响
- [ ] 1.6 汇总探针结论：收敛未知区清单，据此在阶段 3/4 前决策发布触发策略与桥接通道选择

## 2. 阶段 1：MCP server 骨架与读工具

- [ ] 2.1 在 `tools/fgui-mcp/` 建立独立进程 MCP server（Bun + MCP SDK devDependency），配置握手文件读取（端口/token）
- [ ] 2.2 实现读工具：包列表、资源清单（复用 `GetPackageByName`/`items` 遍历证据）、依赖查询（`DependencyQuery`）、发布配置读取（`GetSettings("Publish")` + 反射读字段）、活动文档/活动文件夹
- [ ] 2.3 读工具结果与 `tools/fgui` CLI（`list-resources`/`validate`/`read-component`）交叉验证一致，补充一致性测试
- [ ] 2.4 实现错误处理：编辑器不可达/操作失败返回结构化错误，不中断后续调用

## 3. 阶段 2：写工具

- [ ] 3.1 实现发布配置切换：快照 → CopySetting（跳过只读 `fileName`）→ `Save()` → `project.type` → `project.Save()` → `allPackages.Open()`，返回副作用提示
- [ ] 3.2 实现发布配置回滚：基于切换前快照恢复，验证只读字段保持原值
- [ ] 3.3 实现 `fgui-refresh`（`App.RefreshProject`）端点，供写操作后刷新编辑器感知
- [ ] 3.4 探针通过后实现组件插入工具（`UnselectAll` + `InsertObject(url)`）；探针未通过则保持禁用并记录原因

## 4. 阶段 3：半自动发布闭环与一致性检测

- [ ] 4.1 在插件中注册 `onPublishEnd`/`onPublish` 钩子：写邮箱文件（含包列表、时间戳），必要时读 `isSuccess`/`exportPath`
- [ ] 4.2 MCP server 实现产物检测：发布信号 + 产物 mtime/hash 新鲜度 + `bun run fgui validate --strict` 三重证据判定，失败返回差异明细
- [ ] 4.3 实现端到端 demo：改源 XML → 配置切换 → 用户点击发布 → 自动检测 → validate 报告
- [ ] 4.4 补充检测链路测试：陈旧 bin 被标记、邮箱信号缺失被标记、validate 失败被标记

## 5. 阶段 4（可选，取决于探针结论）

- [ ] 5.1 `Run()` 探针通过后开放 `fgui_trigger_publish` 全自动发布工具，实现等待 `onComplete` 并返回 `isSuccess`/`exportPath`
- [ ] 5.2 HttpListener 探针通过后启用 HTTP 通道作为主桥接；否则保留文件邮箱模式
- [ ] 5.3 端到端全自动验证：意图 → 组件操作 → 发布 → 检测，无人工干预

## 6. 收尾

- [ ] 6.1 补充 `tools/fgui-mcp/` 的 README 与扩展方向说明，更新 docs 中 FGUI 工作流章节（如需要）
- [ ] 6.2 ADR 检查：change 完成前评估是否产生新架构决策（双组件桥接架构、半自动发布策略），按 `doc/decisions/ADR-NNN-<slug>.md` 约定创建 ADR；如无则明确记录无需 ADR
