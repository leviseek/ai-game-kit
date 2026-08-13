## Context

现状（见 proposal.md - Why 与 specs）：
- FGUI 源在 `ui/demo/assets/<包>/`，`tools/fgui` CLI 已提供 `gen-constants`（URL 常量）与 `validate --strict`（含 `scan-ts` 裸 URL 扫描）。
- 页面创建链路：`GameLobbyHostImpl.openEntryPage → adapter.createPage(packageName, resName) → options.createView → createFairyGuiView → UIPackage.createObject(pkg, res)`，未传 userClass；页面节点解析走 `createFairyGuiViewHandle`（按名 `getChild`）。
- 现有 `ViewModelRenderer` / `createFairyGuiViewHandle` 服务动态实例页（auto_battle 战场）与存量页，须保留。
- 约束：fgui/cc 类型只在 `adapters/cocos/ui/` 边界；生成产物禁止手改；字符串归口（组件名/节点名必须进常量表或生成产物）；仓库禁运行时依赖；装饰器用 legacy 语义（`experimentalDecorators` 已开）。

## Goals / Non-Goals

**Goals:**
- 静态页面（LobbyView/SettingsPanel 等单实例页）获得声明式绑定：`@FUIBind` + 零手写字段（类型来自生成接口）+ `@FClick`。
- Store 单向数据流成为静态页的状态呈现标准路径：State → 投影 → 视图字段。
- gen-types 产物由 validate freshness 保护，与源 XML 一致。
- 动态实例页与存量页行为不变（双轨共存）。

**Non-Goals:**
- 不引入 sendNotification / 全局事件总线、双向绑定、任何运行时依赖。
- 不生成 DDD/Store/MVVM 层代码（Store/投影/视图全部手写业务）。
- 不迁移存量页（tycoon/rpg/auto_battle）到新范式；新范式只用于新静态页。
- 不做字段级 diff 绑定（MVP 每次投影全量写字段）。
- 不改 FGUI 发布流程（编辑器发布产物 `.bin` 仍由编辑器生成；gen-types 是独立 CLI 读取源 XML）。

## Decisions

### D1: Store 为自研不可变 reducer 原语（`core/state/Store.ts`）

`createStore(reducer, initialState)` 返回 `{ getState, dispatch, subscribe, dispose }`，reducer 纯函数、state 不可变、action 判别联合。理由：仓库禁运行时依赖（.ai instructions 第 3 条）且强调确定性/可测性（ADR-027 投影纯函数先例）；`createTycoonUiViewModels` 快照先例可无缝换源为 `store.getState()`。备选：外部 store 库（违反禁依赖）；可变 state + 命令（不可快照对比、diff 绑定失效）。副作用（IO/调用用例）放在 action 触发方（视图方法内），reducer 保持纯。

### D2: gen-types 三类产物，独立文件独立治理

每包生成一个 `ui-<包>-types.ts`（独立于 `ui-<包>.ts` URL 常量），内含：
1. `interface <组件名> { readonly _<元件名>: <能力接口>; ... }`（declaration merging，供业务类同名合并）
2. `type <组件名>Nodes = "<元件名>" | ...`（供 `@FClick`/`@FClick` 参数类型约束）
3. 内部字段描述 `const`（组件名 → 元件名 → kind，供运行时注入用）

生成逻辑复用 `tools/fgui/lib/fgui.ts` 的 `readPackage` + `readComponent`，遍历 exported 组件的 `displayList`，仅输出带 name 的元件；元件 → 能力 kind 映射规则：`GButton`→button、`GTextInput`→input、`GProgressBar`→progress、`GTextField`→text、`GRichTextField`→richText、`GList`→list、`GComponent`→component、`GImage`→image、`GMovieClip`→movieclip。排序按 XML 顺序稳定输出。头部注释"由 bun run fgui gen-types 生成，禁止手改"。

备选：合并进 `ui-<包>.ts`（职责混杂、freshness 校验耦合）；生成 d.ts（Cocos 资源管线行为未验证）。

### D3: validate 扩展 freshness 校验

`validate --strict`（默认即含）新增步骤：对每个非官方包重跑 gen-types 的"解析 → 期望内容"逻辑，与磁盘产物逐字对比；不一致则按包列出差异（缺失文件/字段增减/kind 变化）并失败。不依赖文件 mtime（跨平台、可重现）。与现有 `scan-ts`（裸 URL 扫描）并列，保持既有命令输出格式。

### D4: 能力接口族 + Adapter 按 kind 分派

`contracts/ui/` 新增引擎无关能力接口：`TypedTextNode`（setText/text/setVisible）、`TypedButtonNode extends TypedTextNode`（onClick）、`TypedInputNode extends TypedTextNode`（readText）、`TypedProgressNode`（setProgress）、`TypedImageNode`、`TypedComponentNode`、`TypedListNode`。Adapter 侧新增 `wrapFairyGuiObjectTyped(obj)` 按运行时类型探测（`value`/`on` 能力，不依赖 GTextField 等类引用，与 `wrapFairyGuiObject` 的探测风格一致）返回对应能力接口。业务层只 import `contracts/ui/` 类型。

### D5: FuiView 基类 + 装饰器只收集元数据（包装器模式）

`contracts/ui/FuiView.ts`（引擎无关）定义抽象基类，业务类 `extends FuiView<S, VM>`：
- 持有引擎无关的视图接缝 `FuiViewSeam`（`child(name)` 返回能力节点、`onClick(name, handler)` 注册点击），接缝实现由 Adapter 提供。
- 生命周期钩子：`onConstruct()`（注入完成后，子类可读 `_` 字段）、`onState(vm)`（Store 投影回调，子类写字段）、`onOpen`/`onClose`（可选）、`dispose()`（退订 Store + 移除监听 + onClose，幂等）。
- 字段注入与 @FClick 注册由框架 `__attach(seam, fields, clicks)` 执行：按生成字段描述 `seam.child(name)` 注入 `_` 字段（绑定缺失抛错 fail-fast）、把 @FClick 收集的「节点名 → 原型方法引用」逐一 `bind(instance)` 注册。

**决策（包装器 vs userClass）**：FairyGUI 的 `UIPackage.createObject(pkg,res,userClass)` 会把 `userClass` 当 GComponent 构造子节点，故注册类必须 extends GComponent；而仓库边界测试把 fgui 类型锁在 `adapters/cocos/`、root barrel 不得 re-export adapter、游戏层只能经 root 导入——引擎基类无法被业务层 import。因此采用**包装器模式**：FuiView 引擎无关、不 extends GComponent，由 FuiViewHost 创建 GComponent 后把字段注入 FuiView 实例，而非走 userClass 路径。

`@FUIBind(pkg, res, fields)` 类装饰器：登记 `{ url, ctor, fields, clicks }` 进 `FuiComponentRegistry`，重复登记抛错。`@FClick<N extends string>(nodeName: N)` 方法装饰器：把 `{ nodeName, methodRef }`（descriptor.value 引用而非方法名字符串，避免重构断开）写入原型元数据。两个装饰器都只收集元数据、不注册/不绑定，实际绑定统一在 `__attach` 执行。注册表用 `ui://<包>/<组件>` 复合键（对齐 gen-constants 名字格式，避免短 id）。

### D6: 创建路径桥接（包装器绑定，不走 userClass）

- `FuiViewHost`（Adapter 边界，`adapters/cocos/ui/FuiViewHost.ts`）：提供 `createBoundView(packageName, resName)`，查 `FuiComponentRegistry`；命中则 `UIPackage.createObject(pkg, res)` 创建 GComponent，`new ctor()` 创建 FuiView 实例，`__attach` 完成字段注入与 FClick 注册，返回挂载视图；未命中返回 null（回退既有路径）。
- 挂载与销毁：命中时返回的视图须满足 `container.addChild`（需真实 GObject）且 `page.view.dispose()` 要级联 FuiView 退订——Host 返回 GComponent 本身并在实例上包装 `dispose`（先 `instance.dispose()` 再原引擎 dispose），保持页面适配器契约不变。
- 接缝改造：`FairyGuiPageAdapterOptions.createView` 保持签名（按 package+resName 创建），`openEntryPage` 处传一个"先查注册表、未命中走 `createFairyGuiView`"的组合闭包；注册表经构造注入 `GameLobbyHostImpl`（D7）。`GameLobbyHostImpl.openEntryPage` 的 node 解析器分支保持：命中注册表的页面其视图已自我绑定，node 句柄可保留（渲染器/动态页路径不受影响）。

### D7: 注册表与 Store 经组合根注入

`FuiComponentRegistry`（`createServiceToken` 注册，ADR-012 风格）与各品类 Store 实例在组合根 `assembleApp` 装配：品类模块（Module）start 时创建 Store 并注入页面工厂，stop 时 dispose。非全局单例，随模块生命周期。业务静态页经工厂获得「Store + 投影函数」引用，与 FuiView 组装。

### D8: 单向数据流纪律

静态页呈现链：`Store.dispatch(action) → reducer → 新 State → 投影函数 project(state) → FuiView.onState(vm) → 写能力接口字段`。输入读值只在 `@FClick` 方法内经 `TypedInputNode.readText()` 读取后随 action 上行，不做反向绑定。写进 ADR 防止 drift。

## Risks / Trade-offs

- **装饰器 this 绑定与构造时机** → @FClick 存原型引用，实例初始化统一 bind；字段注入只在子节点构建完成（onConstruct 时机）执行，禁止在构造器/字段初始化器里访问 `_` 字段（写进 FuiView 契约注释）。
- **declaration merging 依赖生成产物被 import** → 业务类所在文件必须 import 对应生成 interface（即使 type-only），否则合并不生效；validate freshness + 集成测试覆盖典型页。TS 报"多余字段"问题的反面：结构类型允许多余属性，但字段已由生成接口约束，手写字段会被 lint（`no-undef`/类型不匹配）拦截。
- **能力 kind 探测精度** → 运行时按能力探测（value/on/readText），与引擎类解耦；kind 分类不准时注入值仍可用（宽接口），不中断。
- **双轨漂移** → 独立 ADR 明确分工（静态页 FuiView / 动态页渲染器）+ 新静态页一律 FuiView；存量页不迁移。
- **生成产物破坏性变化**（如组件改名）→ validate freshness 直接失败，阻断提交，强制重跑 gen-types 后人工确认引用点。
- **装饰器在 Cocos 管线** → 只用 legacy 语义（experimentalDecorators 已开），不用 TS5 标准 decorator 与 emitDecoratorMetadata，与 @ccclass 生态一致。

## Migration Plan

1. 新增 gen-types + validate freshness（纯工具链，无运行时影响，先落地、先被测试保护）。
2. 新增 Store 原语与能力接口族 + Adapter 分派（framework 增量，导出白名单扩展）。
3. 新增 FuiView 基类、装饰器、注册表与 FuiViewHost 创建桥（框架增量）。
4. `GameLobbyHostImpl`/`FairyGuiPageAdapter` 接缝扩展（一处组合闭包，未命中行为不变）。
5. 一个示范静态页（如 LobbyView）全链路集成验证（dispatch → 投影 → 字段更新）。
6. 写 ADR。
回滚：任一步未合入即可单独回退；接缝闭包默认未命中回退既有路径，存量页零风险。

## Open Questions

- 静态示范页选哪个（LobbyView 或新 Login 页）——实现阶段按最小验证成本决定，不影响 spec/approach/task 拆分。
- 能力接口族是否需要在首个示范页之外覆盖 GList/GImage 场景——MVP 只实现文本/按钮/输入/进度四类，其余随真实需求扩展（spec 只约束"按 kind 分派"，不枚举全部 kind）。
