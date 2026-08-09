你必须遵守：

1. 修改代码前先解释设计
2. 不允许创建超过300行的新文件
3. 不允许引入第三方库
4. 优先复用已有模块
5. 修改架构必须更新docs
6. 每个系统必须有测试
7. 每个模块必须说明未来扩展方向
8. 注释使用简体中文，只解释意图与权衡；标识符、API 名保持英文
9. FGUI 组件源 XML 禁止使用 graph 组件（含纯色矩形等一切几何图形）；纯色视觉必须用 sprite 生成像素图并以 image 引用
10. FGUI 自建组件禁止手写 transition（动画由 TS 推进 controller selectedIndex）；禁止 image 误用 loader 专属 fill 属性；组件 XML 内文件名（fileName）必须与 package.xml 登记路径一致
11. FGUI 资源 id 采用前缀续编（如 demo 包 dm000/dm001…），禁止随机造 id；子元件 name 必须语义化（推荐 txt_/btn_/bg_/bar_/loader_ 前缀），组件内唯一且禁止无语义命名
12. FGUI 单个 `<relation>` 的 `sidePair` 最多声明 2 项（横向与纵向约束各一项）；禁止凭相似性叠加第 3 项，否则 FGUI 编辑器可能在刷新时数组越界
13. FGUI 跨资源包引用只允许指向通用资源包 `Common` 或 `Common_xxx`（如 `cmn00001`）；禁止业务包（Demo/CardGame 等）跨包引用其它业务包，也禁止跨包引用 FairyGUI 编辑器官方库包 `Basic`/`Builder`（它们只能作为参考示例，不得使用）。通用按钮/进度条等共享组件统一承载于 `ui/demo/assets/Common/`，业务包跨包引用一律指向 Common；打开业务页面 package 前必须先注册 Common（fgui loadPackage 不自动加载依赖包），否则跨包组件退化为空组件、点击事件不触发
14. FGUI 发布产物（`assets/ui/*/*.bin` 与 atlas）由 FGUI 编辑器发布生成，禁止手改或提交编辑器未发布的陈旧 bin；修改源 XML/PNG 后需在 FGUI 编辑器中重新发布对应包
