# ADR-015 Config Service Model, Typed Reads, and Save Separation

## 状态

Accepted

## 背景

父级 `create-game-framework-v1` 第 7.1/7.2 节要求提供类型化配置服务与 Bundle 配置加载：静态配置随版本发布，玩家存档随玩家变化，两者生命周期与错误处理不同。总计划设计决策 11 确立"配置与存档使用版本化、引擎无关的数据边界"；ADR-013 已记录存档侧（`versioned-storage`）契约/错误/键编码，配置侧此前无契约与实现。本 ADR 记录 change `implement-config-service-v1` 落地的配置服务模型、类型化读取约定与配置/存档分离的实现边界，供后续配置能力（热更新、配置版本化、Schema 校验）复用。

## 决策

### 1. 配置内核采用"不可变配置表 + 只读快照"模型

`core/config/ConfigTable.ts` 提供引擎无关配置服务：`createConfigTable(content)` 把纯对象装载为不可变配置表，装载后深度冻结（`Object.freeze` 递归），`snapshot()` 返回同一份冻结结构，读取方拿到即不可变；框架不提供任何可变访问路径。

**理由：** 配置只读语义直接对应 spec 快照需求；冻结结构避免深拷贝开销，快照与表共享同一份只读数据；引擎无关便于 TDD。
**未采用方案：** 每次读取做深拷贝（无必要开销）；提供运行时配置写入路径（写路径属存档，见 `versioned-storage`）。

### 2. 类型化读取用最小声明式形状检查，不引入 schema 依赖

读取以 `ConfigReadType<T>` 声明调用方期望的类型与形状，内置 `configString`/`configNumber`/`configBoolean`/`configObject`/`configArray`；形状不符抛 `ConfigTypeMismatchError`，结构化内容（以 `{`/`[` 开头）解析失败抛 `ConfigParseError`，键缺失抛 `ConfigMissingError`，三者均为 `FrameworkError` 子类且携带键名诊断。默认值仅在缺失时生效，配置存在但解析失败仍报错。

**理由：** 项目约束不主动引入新依赖；基础形状检查（对象/数组/标量）足以支撑类型化读取与调用方分支处理；错误携带键名使发布流程可定位漂移。
**未采用方案：** 引入完整 JSON Schema 验证器；把类型不匹配与解析失败合并为单一错误（spec 要求分别表达）。

### 3. 配置经资源层加载，不与玩家存档混用

`core/config/ConfigLoader.ts` 的 `loadConfigTable(provider, bundle, path)` 经 `IResourceProvider.load`（`kind: "asset"`）读取配置资源并解析为配置表，复用 `LoadCoordinator`/`ResourceScope` 语义，全程不接触 `PlatformStorage`/`VersionedStorage`。装载失败抛 `ConfigLoadError` 并解包 `LoadCoordinator` 包装，保留底层原因；内容非纯对象抛 `ConfigParseError`，均不产生部分配置状态。Cocos 适配器 `adapters/cocos/config/CocosConfigLoader.ts` 解包 `JsonAsset.json` 后复用同一加载路径。

**理由：** 设计决策 11 的分离边界由此在实现层落实；配置与存档生命周期不同，混用会把配置生命周期与玩家存档耦合；复用资源层加载去重与作用域语义，不重建加载逻辑。
**未采用方案：** 配置存到键值后端（与 ADR-013 存档侧耦合，违反设计决策 11）；在适配器内重建加载协调逻辑。

### 4. 无业务配置模型，配置结构属 game 层

配置服务不定义具体游戏配置结构；配置内容以 JSON/类型化资源表达，游戏层在读取时声明键与类型，框架只提供读取契约与错误语义。

**理由：** 与既有架构一致（如 ADR-005 框架/游戏边界），配置结构属具体项目，框架层保持通用。
**未采用方案：** 框架内置业务配置枚举或配置类（把业务灌入通用层）。

## 理由

- 配置服务模型决定后续所有配置能力（热更新、版本化、Schema 校验）的接入方式，属长期架构契约；若未来改变"配置表 + 只读快照 + 类型化读取"语义，各品类项目的行为预期会漂移而不被察觉。
- 配置/存档分离是设计决策 11 的另一半落地：ADR-013 锁定存档侧，本 ADR 锁定配置侧，两者共同构成"配置随版本发布、存档随玩家变化"的完整边界。
- 错误类型化（缺失/类型不匹配/解析失败/加载失败）与键名诊断是公开行为契约，配置发布流程依赖其可分支处理。

## 影响

- 后续配置模块（热更新、配置版本化、Schema 校验）必须复用 `ConfigTable` 的只读快照与 `ConfigReadType` 读取语义，不得另建可变配置容器或直接访问引擎资源 API。
- 新平台配置加载器必须走 `IResourceProvider`（`kind: "asset"`）并经 `loadConfigTable` 统一失败语义，不得触达 `PlatformStorage`/`VersionedStorage`。
- 根入口 `index.ts` 已同步导出配置契约与核心符号（`expectedRootExports` 含 15 个配置符号），后续新增公开符号同样需同步白名单。
- 配置类型声明（`configObject` 等）与错误类（`ConfigTypeMismatchError`/`ConfigParseError`）是公开 API，`public-boundary.test.ts` 已新增配置边界测试锁定内核/契约零 `cc`/`fgui`/存储导入。
- 若出现需要"配置热更新"或"配置 schema 校验"的场景，通过独立 change 扩展，不破坏当前配置服务契约。
