# FGUI MVVM 绑定与质量门禁

本文是 [轻量 DDD、Store 数据流与 MVVM UI 架构](./ui-store-mvvm-architecture.md) 的工程治理配套文档，定义 FGUI 自动绑定、生成物、目录组织、双轨边界和验证要求。

## 1. 自动绑定链

```text
FGUI XML
  -> gen-constants: 生成 ui://包/资源 URL 常量
  -> gen-types: 生成 Fields、Nodes 与能力接口形状
  -> @FUIBind / @FClick: 类定义期收集元数据
  -> FuiComponentRegistry: 以 ui://包/组件 复合键登记
  -> FuiViewHost: 创建 GComponent 并执行 __attach
  -> FuiView: 使用自动注入的能力字段
```

`FuiView` 采用包装器模式，不继承 `GComponent`。业务层只消费引擎无关能力接口，真实 FGUI 类型由 Cocos Adapter 隔离。

## 2. 生成物边界

`gen-types` 只生成：

- 元件名到能力 kind 的 `Fields` 描述。
- 供装饰器参数约束的 `Nodes` 联合类型。
- 供 declaration merging 使用的能力接口形状。

生成器不生成 Store、Use Case、ViewModel、业务 View 或业务规则。所有生成文件禁止手改；当前 `validate` freshness 只保护 `gen-types` 产物，`gen-constants` 产物仍需在源资源变更后显式重跑。为 URL 常量增加 freshness 必须走独立工具链 change。

## 3. 装饰器边界

- `@FUIBind` 只登记组件 URL、构造器、字段描述和点击元数据。
- `@FClick` 保存节点名与原型方法引用，不执行实际绑定。
- 装饰器不得创建引擎对象、访问业务服务或执行 IO。
- 自动注入字段只能在 `onConstruct` 之后访问，构造器和字段初始化器禁止读取。
- 缺失节点、重复注册和类型产物过期必须 fail-fast，不静默回退。
- 目标 API 必须直接消费生成的 URL 契约，避免在业务类重复裸写包名与组件名。当前 `@FUIBind(packageName, componentName, fields)` 与字符串归口规则存在已知缺口；在 API 收敛前不得把新的裸字符串绑定扩散为标准范式。

## 4. FGUI 资源纪律

继续遵守 `AGENTS.md` 与 `.ai/instructions.md`：

- 禁止 graph 和手写 transition；动画由 TS 与 GameClock 驱动。
- 节点名语义化且组件内唯一。
- FGUI URL 必须引用 `assets/ui/generated/` 名字格式常量，禁止短 id 裸写。
- 跨包引用只允许指向 `Common` 或 `Common_xxx`。
- exported 组件名全工程唯一。
- relation、palette、资源 id、文件名和发布流程约束保持不变。
- 修改源 XML/PNG 后重跑生成与 `validate --strict`，并由 FGUI 编辑器重新发布 `.bin` 和 atlas。

## 5. 推荐 Feature 组织

```text
assets/samples/game_xxx/
  domain/
    models.ts
    rules.ts
  application/
    ports.ts
    use-cases.ts
  state/
    types.ts
    store.ts
  view/
    XxxViewModel.ts
    XxxView.ts
  assembly.ts
```

这是职责示意，不是强制目录模板。小 Feature 可合并文件，避免为了分层制造空目录；复杂文件只在职责独立、可复用或可单测时拆分。边界由依赖方向和职责决定，不由文件数量决定。

## 6. 双轨共存

- 新静态页面使用 FuiView + Feature Store + 纯 ViewModel 投影。
- 动态实例页面与存量页面继续使用 `ViewModelRenderer` 和按名节点句柄。
- 动态节点集合、实例增删和绑定级 diff 属于 `ViewModelRenderer` 的适用场景。
- 同一品类可以双轨共存，不为统一形式强制迁移稳定页面。

## 7. 测试矩阵

| 对象 | 必须验证 |
| --- | --- |
| Domain | 业务不变量、边界值、确定性、无 IO |
| Use Case | 调用顺序、成功/失败映射、取消、过期响应、端口 mock |
| Reducer / Store | 不可变更新、Action 穷尽、dispose 后行为，并禁止 listener/onState 抛错或重入 dispatch |
| ViewModel 投影 | State 到 UI 数据的纯函数结果 |
| FuiView | 输入上行、首次投影、字段写入、dispose 后不再响应 |
| Binding Adapter | 缺失节点 fail-fast、能力 kind、点击注册、销毁级联 |
| FGUI 工具链 | 生成确定性、gen-types freshness、URL 常量显式重生成、引用完整性、`validate --strict` |
| 集成链路 | 点击到 Use Case、dispatch、投影、节点更新及异步失败路径 |

新增系统必须有测试。优先执行最相关的最小测试，再扩展到类型检查、public-boundary、FGUI validate 和集成测试。

## 8. 新静态页面检查清单

- FGUI 组件和节点名已生成 URL、Fields、Nodes 和能力接口。
- View 未导入 `cc`、`fairygui-cc`、网络或存储实现。
- ViewModel 是纯数据与纯投影。
- reducer 同步、纯函数、不可变，Action type 已归口。
- 纯 UI Action 可直接 dispatch；业务意图经 Use Case。
- 异步结果有取消或过期保护。
- Store、View、异步作用域和资源均有明确释放点。
- 未新增全局 EventBus、双向绑定或 Service Locator。
- 单元测试、集成测试、类型检查和 FGUI validate 已通过。

## 9. 方案 B 落地门禁

当前仓库已具备 Store、纯投影、FuiView 自动字段注入和点击绑定，但业务 Use Case 页面尚缺少完整装配接缝。新业务页面采用方案 B 前，必须通过独立 OpenSpec change 完成以下能力：

- 页面创建链提供类型安全的 post-attach binder 或等价页面工厂，在首次 `bindStore` 前注入 Store 与 Use Case/Application facade；端口实现只注入 Use Case，不暴露给页面。
- binder 由组合根或 Feature assembly 提供，不要求业务层导入 Cocos Adapter、调用 `getBoundView`、执行类型断言或访问全局 Service。
- 页面句柄明确绑定实例、异步作用域和释放所有权；创建失败时已建立的绑定必须回滚。
- FUI 绑定装饰器直接消费生成 URL 契约，消除包名和组件名裸字符串。
- FUI 注册、字段和点击缺失错误收敛到 `FrameworkError`。
- FuiView 清理链和 Host 的 GComponent 级联销毁均逐项失败隔离，并聚合或报告错误，确保引擎组件与页面资源仍会继续释放。

现有 `CloseDialog.bind(store, callbacks)` 与测试中的 `getBoundView` 手工绑定仅用于验证当前基础链，不是新业务页面的标准装配方式。本次文档修订不要求迁移该示范页。

## 10. 架构扩展检查清单

- 新抽象至少有两个真实消费场景，或被明确要求成为稳定框架能力。
- 优先新增窄契约和组合，不扩大既有公共接口。
- 新架构决策走独立 OpenSpec change，并同步 ADR 与架构文档。
- 不修改生成产物作为长期修复。
- 真实性能数据证明全量字段写入成为瓶颈后，才能增加 VM 浅比较或字段级 diff。
- 复杂列表、动态实例和高频渲染继续扩展 `ViewModelRenderer`，不把动态绑定能力塞入 FuiView。
