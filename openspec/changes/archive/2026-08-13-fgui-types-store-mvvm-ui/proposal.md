## Why

FGUI 页面目前每次都要手写节点名常量与按名 `getChild` 的样板代码（`nodes.ts` 注释自认"拼错即静默失败"），静态页面的状态呈现没有统一的数据流约束，状态到视图的同步散落在各页面实现里。目标是把静态页面 UI 收敛为「Store 单向数据流 + 自动生成类型接口 + 自动绑定」：声明式、类型安全、拼错在编译期拦截。

## What Changes

- 新增 `tools/fgui gen-types` 命令：解析每包每个 exported 组件的 XML `displayList`，生成三类确定性产物到 `assets/ui/generated/`：
    - 字段描述（组件名 → 字段名 → 能力 kind，text/progress/button/input/image/component）
    - 节点名字面量联合（供 `@FClick` 等参数类型约束，编译期拦截拼错）
    - declaration merging interface（`interface LoginView { _txt_status: TypedTextNode; ... }`，与手写组件类同名合并，`this._txt_*` 类型自动获得）
- 扩展 `tools/fgui validate`：新增 freshness 校验，生成产物与 XML `displayList` 不一致即失败（改名/删元件必须重跑 gen-types）。
- 新增轻量 Store 原语（core 层自研）：不可变 State + 纯 reducer/action + 订阅，经组合根 `createServiceToken` 注入，不引入运行时依赖。
- 新增 FUIView 基类（`FuiView`）与装饰器 `@FUIBind`（登记 URL→类注册表）、`@FClick`（收集节点名→原型方法元数据）：字段在 `onConstruct` 时机注入、点击在实例化后 bind 注册，dispose 幂等并挂现有页面销毁路径。
- 新增能力接口族（`TypedTextNode`/`TypedButtonNode`/`TypedInputNode` 等，引擎无关），实现在 Adapter 边界按 kind 分派，业务层不持 fgui 引擎类型。
- 扩展 `FairyGuiPageAdapter.createView` 接缝与 `GameLobbyHostImpl.openEntryPage`：查询注册表，命中则 `UIPackage.createObject(pkg, res, userClass)` 创建绑定视图，未命中走现有路径（新旧双轨）。
- 新增 ADR：Store 数据流 + FUIView 绑定架构（单向数据流纪律、FUIView 与渲染器分工、gen-types 产物治理）。

不引入 sendNotification / 全局事件总线；不做双向绑定；不引入运行时依赖；不生成 DDD/Store/MVVM 层代码。

## Capabilities

### New Capabilities

- `fgui-type-codegen`: `gen-types` 命令产出 FGUI 组件的类型描述产物（字段描述 / 节点名联合 / declaration merging interface），并由 `validate` freshness 校验保证产物与源 XML 一致。
- `store-data-flow`: 轻量 Store 数据流原语（不可变 State + 纯 reducer/action + 订阅），组合根注入，支持页面经单向数据流同步状态到视图。
- `fui-view-binding`: FUIView 基类 + `@FUIBind`/`@FClick` 装饰器 + 能力接口族 + 注册表 + 创建路径桥接，实现静态页面元素自动绑定与类型安全访问。

### Modified Capabilities

- `fairygui-ui-adapter`: 页面创建路径支持按注册表命中传入 userClass 创建绑定视图，未命中保持既有行为。

## Impact

- **tools/fgui**: 新增 `commands/gen-types.ts`，扩展 `commands/validate.ts`（freshness），配套 `lib/fgui.ts`/`lib/xml.ts` 读取 displayList 的能力与测试。
- **assets/framework**: 新增 `core/state/Store.ts`、`contracts/state/Store.ts`、`contracts/ui/`（能力接口族与 FuiView 契约）、`adapters/cocos/ui/FuiViewHost.ts`；扩展 `adapters/cocos/ui/FairyGuiPageAdapter.ts` 的 createView 接缝；同步 `framework/index.ts` 白名单与 `expectedRootExports`。
- **assets/ui/generated**: 新增 gen-types 产物文件（禁止手改，validate 保护）。
- **boot/host/GameLobbyHostImpl**: `openEntryPage` 加注册表查询桥（一处）。
- **docs**: 新增 ADR 描述 Store 数据流 + FUIView 绑定架构与双轨分工。
- **存量页面（tycoon/rpg/auto_battle）**: 不迁移，保留现有渲染器路径，双轨共存。
