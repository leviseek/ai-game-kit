# ADR-032 Store Data Flow and FuiView Binding Architecture

## 状态

Accepted

## 背景

FGUI 页面此前每次都要手写节点名常量与按名 `getChild` 样板（`nodes.ts` 自认"拼错即静默失败"），静态页状态呈现没有统一数据流约束，状态到视图同步散落在各页面实现。用户选定架构方向：轻量 DDD 模块化 + Store 数据流 + MVVM UI，UI 部分用「FGUI 自动绑定 + 自动生成类型接口」。

实现过程中发现 design 原稿的 userClass 方案与仓库边界约束矛盾（详见决策 1），调整为包装器模式。本 ADR 固化最终架构决策。

## 决策

### 1. FuiView 采用包装器模式，不 extends GComponent（否决 userClass）

- **C-01** `FuiView`（contracts/ui，纯 TS、引擎无关）是静态页业务类的基类，**不 extends GComponent**；它持有引擎无关的视图接缝 `FuiViewSeam`（`child(name, kind)` 返回能力节点、`onClick(name, handler)` 注册点击），接缝实现位于 Adapter 边界。业务类零 fgui 导入。
- **C-02** 否决 `UIPackage.createObject(pkg, res, userClass)` 方案：FairyGUI 会把 `userClass` 当 GComponent 构造子节点，要求注册类 extends GComponent；而仓库边界测试把 fgui-cc 锁在 `adapters/cocos/`、root barrel 不得 re-export adapter、游戏层只能经 root 导入——引擎基类无法被业务层 import。故改用包装器：`FuiViewHost` 创建 GComponent 后把字段注入 FuiView 实例。
- **C-03** 字段以 `_` + 元件名命名，类型来自 gen-types 生成的 **declaration merging interface**（`interface X extends XShape {}` 与类同名合并，业务类零手写字段）。点击经 `@FClick` 注册，绑定缺失在注入阶段抛错（开发期 fail-fast）。

### 2. Store 为自研不可变 reducer 原语（core/state）

- **C-04** `createStore(reducer, initialState)` 返回 `{ getState, dispatch, subscribe, dispose }`，reducer 纯函数、state 不可变、action 判别联合 + 常量表归口。不引入运行时依赖（仓库禁运行时依赖）。纯 UI 行为可由视图直接 dispatch；涉及领域规则、IO、资源或跨模块协作的业务意图由 Application / Use Case 执行，并以成功或失败 action 收敛回 Store。视图不直接访问基础设施，reducer 始终保持纯。Use Case 的类型安全页面注入接缝由方案 B 的实例级 required binder 提供（见决策 7），示范页经 `createCloseDialogFeature` 装配 Store 与 Application facade，不再使用匿名回调。
- **C-05** Store 非全局单例，所有权在组合根装配时固定为品类 Module 或页面作用域：Module Store 在 `start` 创建、`stop` 释放，页面 Store 随页面创建与关闭；页面不得释放共享的 Module Store。示范页经 `bind({ store, application })` 获得 Store 与 Application facade（见决策 7），投影函数由 View 模块静态依赖。

### 3. 单向数据流纪律

- **C-06** 静态页呈现链固定为：`Store.dispatch(action) → reducer → 新 State → project(state) 纯函数 → FuiView.onState(vm) → 写能力接口字段`。交互回路：`@FClick → dispatch(action) → reducer → 订阅 → 重新投影`。
- **C-07** 严格单向，**禁止双向绑定**；输入控件取值在 action 构造时经能力接口读值（`TypedInputNode.readText()`），不作为绑定数据源。写进 spec 防 drift。
- **C-08** MVP 不做字段级 diff（每次投影全量写字段），性能问题出现时再在 VM 层做浅 diff。

### 4. gen-types 产物治理

- **C-09** `tools/fgui gen-types` 生成三类产物到 `assets/ui/generated/ui-<包>-types.ts`：节点名联合（`@FClick` 参数类型约束）、字段描述 const（元件名 → kind，运行时注入用）、declaration merging interface。产物带"禁止手改"头，排序确定性。
- **C-10** `validate` 新增 freshness 校验：重跑 gen-types 解析逻辑与磁盘产物逐字对比，不一致即失败（改名/删元件必须重跑 gen-types 才能通过）。与既有 scan-ts（裸 URL 扫描）并列。
- **C-11** 能力 kind → 引擎无关能力接口（TypedTextNode/TypedButtonNode/TypedInputNode/TypedProgressNode/TypedImageNode/TypedComponentNode/TypedListNode）由 Adapter 的 `wrapFairyGuiObjectTyped` 按运行时能力探测分派，不依赖 GTextField 等类引用（mock 环境无此类）。

### 5. 双轨分工与过渡

- **C-12** 静态页（新范式）用 FuiView + Store；动态实例页（auto_battle 战场 `unit_{id}` 运行时元件名）与存量页继续用 ViewModelRenderer + 按名节点句柄，双轨共存。新静态页一律 FuiView，存量页不强制迁移。
- **C-13** 创建路径经 `FuiViewHost.createFairyGuiBoundView()` 组合闭包：先查 `FuiComponentRegistry`（`@FUIBind` 登记的绑定视图），未命中回退 `createFairyGuiView`，存量/动态页行为不变。

### 6. 注册表为 globalThis 单例（非 DI token）

- **C-14** `FuiComponentRegistry` 采用 globalThis 私有符号键单例（对齐 `BundleModuleRegistry` 跨 bundle 注册桥），因为 `@FUIBind` 在类定义/模块加载期登记，早于组合根 DI。FuiViewHost 缺省读全局单例，可注入测试用注册表。

### 7. 运行时绑定、装配所有权与端到端清理（方案 B）

方案 B 落地了「URL 契约 → required binder → 事务式装配 → 端口只进 facade」的运行时绑定链，并统一了端到端清理失败隔离语义。

- **C-15** 绑定链 URL 契约固定为 `FuiComponentUrl` 模板字面量（`ui://<包>/<组件>` 品牌类型）：`@FUIBind(url, fields, { runtimeBinding })` 首参数直接消费 `ui/generated` 生成常量（如 `UiDemoCloseDialog`），并显式声明运行时绑定策略 `runtimeBinding: "required" | "none"`（编译期必填，无旧三参数重载）。`FuiComponentRegistry.register/lookup` 以 `FuiComponentUrl` 为键；Host 内部经 internal `createFuiComponentUrl(packageName, resName)` 单点构造 URL，注册表查询、错误与 binder 复用同一值，无散落类型断言。禁止裸字符串拼接与短 id 散落。
- **C-16** 运行时依赖装配为实例级 required binder（非 globalThis、不进 ApplicationContext）：Feature assembly 经 `defineFuiViewBinding(url, ctor, bind)` 创建冻结绑定描述，经 `FuiViewBindingRegistrar.register` 登记；内部 resolver `bindRequired(url, view, scope)` 在视图 `__attach` 后执行对应 binder，required 组件缺 binder 抛 `FuiViewBindingRegistrationError`（fail-fast），视图 ctor 与 binder ctor 不匹配抛 `FuiBindingError`。`createFuiViewBinderRegistry()` 返回 registrar + resolver 一体对象，由组合根创建，resolver 保持内部局部值（不进根公共导出）。
- **C-17** 绑定为事务式作用域：binder 每获得句柄立即 `FuiViewBindingScope.own` 登记；成功后 scope 作为单一句柄转交 `view.__own`（视图 dispose 逆序清理）；失败时 Host 是唯一回滚所有者——逆序逐句柄 try/catch 释放 scope 句柄、View 与 GComponent，各底层句柄至多执行一次；primary 错误保持为 `FuiViewCreationError.cause`，清理失败并入 `cleanupErrors` 聚合，不覆盖 primary。
- **C-18** 端口只注入 Application facade：View 依赖类型只含 Store 与 Application facade（Use Case 端口），网络/存储/资源端口与匿名业务回调不进入 View。Feature/Module Store 归 Feature 所有：`createCloseDialogFeature(registrar, effects)` 为唯一装配入口，创建 Feature Store 与 facade 并向 registrar 注册 binder，`dispose()` 先注销 registration 再释放 Store（幂等）；页面 scope 只拥有 View 订阅等页面局部句柄，不拥有 Feature Store。`assembleApp(options)` 产出已接线的 `uiHost` 与公共 `fuiViewBindingRegistrar`（与 UiHost 内部 resolver 同源），`AppRoot` 消费 `assembly.uiHost`，不再重复装配。
- **C-19** 端到端清理失败隔离：`FuiView.__own`/`dispose`、Host 的 View + GComponent 级联销毁、`FairyGuiPageAdapter.destroy/dispose`、`UiHost.dispose`、`GameLobbyHostImpl.closeEntryPage/dispose` 均先收敛引用（disposed/undefined）再逐项 try/catch 清理，单步失败不阻断后续，全部失败聚合为公共 `FuiViewCleanupError extends FrameworkError`（冻结 `errors` 快照、`cause` 取首个失败；替代 ES2015 不可用的原生 `AggregateError`）。会话作用域始终释放。`FuiComponentRegistrationError`/`FuiViewBindingRegistrationError`/`FuiViewCreationError`/`FuiBindingError` 内部化，仅 `FuiViewCleanupError` 进根公共导出。

## 影响

- `tools/fgui`：新增 `gen-types` 命令与 `validate` freshness 校验（含测试）。
- `assets/framework`：新增 `contracts/state/Store`、`core/state/Store`、`contracts/ui/FuiView`（基类+seam）、`contracts/ui/TypedNode`（能力接口族）、`core/fui/FuiBindings`（@FUIBind/@FClick）、`core/fui/FuiComponentRegistry`、`core/fui/FuiErrors`（FUI 错误族）、`core/fui/FuiViewBinderRegistry`（实例级事务式 binder registry）、`adapters/cocos/ui/FuiViewHost`；扩展 `FairyGuiViewHandle.wrapFairyGuiObjectTyped`；`index.ts` 白名单同步。
- `assets/boot/host/UiHost`：`createView` 接缝改为 `createFairyGuiBoundView(resolver, options)` 组合闭包；组合根 `assembleApp` 创建 binder registry，以 resolver 接线 UiHost、以 registrar 暴露 Feature 安装接缝。
- `assets/samples/game_fui_demo`：示范静态页（CloseDialog，`@FUIBind` 消费生成 URL 常量）+ `assembly.ts` Feature 装配（Store + facade）+ `store.ts` 收敛为单一装配入口 + 集成测试。
- `assets/samples/entry.ts`：导出冻结 `SAMPLES_BUNDLE_DESCRIPTOR`，经 `registerBundle` 暴露 `createCloseDialogFeature`。
- `expectedRootExports` 白名单同步新增符号。

## 后续

- 装饰动画/动画接入仍按 ADR-029 约束（经 GameClock，动画器只读 now()），FuiView 的 onState 写字段不经渲染器 diff，动画叠加不受影响。
- Store/投影/视图全部手写业务，DDD/Store/MVVM 层无生成物。
- Use Case 边界按 `doc/architecture/ui-store-mvvm-architecture.md` 执行；现有示范页不要求在本次文档修订中迁移，后续业务交互新增或修改时再按该边界收敛。
- 残余约束（未实现，继续生效）：Store `subscribe` 监听器为同步遍历，未实现队列化重入或处理器失败隔离，订阅者与 `onState` 必须保持无异常、不得在通知期间再次 dispatch（需要重入或隔离语义时须走独立 OpenSpec change）；`validate` freshness 只保护 `gen-types` 产物，`gen-constants` 产物仍需在源资源变更后显式重跑。
