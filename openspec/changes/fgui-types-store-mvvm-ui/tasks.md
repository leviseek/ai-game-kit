# Implementation Tasks

## 1. gen-types 生成器（tools/fgui）

- [x] 1.1 在 `tools/fgui/lib/fgui.ts` 增加读取组件 `displayList` 的对象信息（复用 `readComponent`/`ObjectIndex`），提供"exported 组件 → 带 name 元件清单"的确定性遍历
- [x] 1.2 在 `tools/fgui/commands/gen-types.ts` 实现 `gen-types` 命令：解析每包 exported 组件，按 D2 生成三类产物（declaration merging interface、节点名联合、内部字段描述 const）到 `assets/ui/generated/ui-<包>-types.ts`，输出含"禁止手改"注释头，排序确定性
- [x] 1.3 实现元件 → 能力 kind 映射（button/input/progress/text/richText/list/component/image/movieclip，按 D2）
- [x] 1.4 在 `tools/fgui/commands/index.ts`（或 CLI 注册处）注册 `gen-types` 子命令与 `bun run fgui gen-types` 入口
- [x] 1.5 在 `tools/fgui/test/` 新增 `gen-types.test.ts`：单测覆盖三类产物内容、确定性（重复运行一致）、跳过无 name 元件、kind 映射；用现有测试 fixture 工程数据

## 2. validate freshness 校验（tools/fgui）

- [x] 2.1 在 `tools/fgui/commands/validate.ts` 新增 freshness 步骤：按 gen-types 相同解析逻辑生成期望内容，与磁盘 `ui-<包>-types.ts` 逐字对比（缺失/字段增减/kind 变化即失败），复用 D3 决策
- [x] 2.2 在 `tools/fgui/test/` 新增 freshness 失败用例：修改源 XML 字段/改名后不重跑 gen-types 则 validate 失败；产物一致则通过
- [x] 2.3 将 `gen-types` 纳入 `validate` 帮助文本与全工程校验说明

## 3. Store 原语（framework core）

- [x] 3.1 新增 `assets/framework/contracts/state/Store.ts`：`Store<S, A>` 契约（getState/dispatch/subscribe/dispose）
- [x] 3.2 新增 `assets/framework/core/state/Store.ts`：`createStore(reducer, initialState)` 实现（不可变 reducer、订阅/退订、dispose 幂等、dispose 后不再通知）
- [x] 3.3 在 `assets/framework/index.ts` 导出 `createStore` 与 Store 类型，同步 `expectedRootExports`（或对应白名单测试）
- [x] 3.4 在 `tests/framework/foundation/` 新增 Store 单测：reducer 纯/不可变、未变化字段保持引用、订阅退订、dispose 幂等、type 联合约束

## 4. 能力接口族 + Adapter 分派（framework）

- [x] 4.1 在 `assets/framework/contracts/ui/` 新增能力接口族：`TypedTextNode`（setText/text/setVisible）、`TypedButtonNode`（onClick）、`TypedInputNode`（readText）、`TypedProgressNode`（setProgress），必要时 `TypedImageNode`/`TypedComponentNode`/`TypedListNode` 最小形态
- [x] 4.2 在 `assets/framework/adapters/cocos/ui/` 新增 `wrapFairyGuiObjectTyped(obj)`：按运行时能力探测（value/on/readText）返回对应能力接口，不依赖 GTextField 等类引用
- [x] 4.3 在 `assets/framework/index.ts` 导出能力接口类型；更新白名单测试
- [x] 4.4 新增 Adapter 单测：`wrapFairyGuiObjectTyped` 对 text/button/input/progress mock 对象分派正确、读/写/onClick 行为正确

## 5. FuiView 基类 + 装饰器 + 注册表（framework）

- [x] 5.1 新增 `assets/framework/contracts/ui/FuiView.ts`：抽象基类契约（onConstruct/onState/onOpen/onClose/dispose 生命周期、Store 订阅管理）
- [x] 5.2 实现 FuiView 基类：`_` 字段注入流程（按字段描述 getChild + wrapFairyGuiObjectTyped，绑定缺失 fail-fast 抛错）、@FClick 注册（原型方法 bind 实例）、dispose（退订 + 移除监听，幂等）
- [x] 5.3 实现 `@FUIBind(pkg, res)` 类装饰器：登记 `ui://<包>/<组件>` 复合键 → ctor 进注册表，重复登记抛错
- [x] 5.4 实现 `@FClick(nodeName)` 方法装饰器：收集节点名 + 原型方法引用（descriptor.value）元数据，不直接注册
- [x] 5.5 新增 `FuiComponentRegistry`（组合根注入的 token 服务，ADR-012 风格），含登记/查询/重复登记检测
- [x] 5.6 在 `assets/framework/index.ts` 导出 FuiView/装饰器/注册表；更新白名单测试
- [x] 5.7 新增 framework 单测：@FUIBind 登记与重复登记报错、@FClick 元数据收集、FuiView 字段注入（含缺失 fail-fast）、点击以实例为 this 调用、dispose 幂等

## 6. 创建路径桥接（Adapter + GameLobbyHostImpl）

- [x] 6.1 新增 `assets/framework/adapters/cocos/ui/FuiViewHost.ts`：`createBoundView(packageName, resName)` 查注册表，命中则以 userClass 调 `UIPackage.createObject` 并完成注入/注册（FairyGUI onConstruct 时机），未命中返回 null
- [x] 6.2 在 `GameLobbyHostImpl`/页面创建接缝（`FairyGuiPageAdapterOptions.createView` 传入处）扩展为"先查注册表、未命中走 `createFairyGuiView`"的组合闭包，注册表经构造注入
- [x] 6.3 保持 `openEntryPage` 的 node 解析器分支不变（动态页/存量页路径不受影响）
- [x] 6.4 新增 Adapter/集成单测：命中注册表 → 以注册类创建并注入字段；未命中 → 回退既有路径行为不变

## 7. 示范静态页全链路集成

- [x] 7.1 选一个静态页（LobbyView 或最小新页）作为示范：手写 `@FUIBind` + 零手写字段 + `@FClick`，经 `project(state)` 投影 + FuiView.onState 写字段
- [x] 7.2 在游戏层/品类模块装配 Store（组合根或品类 Module start 创建、stop dispose），示范页经注入获得 Store + 投影函数
- [x] 7.3 集成验证：dispatch action → reducer → 投影 → 字段更新 → 引擎节点变化可观察；点击 → 上行 dispatch；dispose 幂等
- [x] 7.4 新增集成测试覆盖 7.3 的完整回路

## 8. 文档与收尾

- [x] 8.1 新增 ADR：Store 数据流 + FuiView 绑定架构（单向数据流纪律、静态页/动态页分工、gen-types 产物治理与 freshness）
- [x] 8.2 全工程 `bun run fgui validate --strict` 通过（含 freshness）
- [x] 8.3 运行类型检查与相关测试（`bun run <typecheck>`、tools/fgui test、framework 单测/集成测试）全绿
