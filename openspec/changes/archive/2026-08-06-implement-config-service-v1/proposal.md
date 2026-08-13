# Implement Config Service v1

## Why

主框架 change `create-game-framework-v1` 的第 7 章规划了配置能力：静态配置随版本发布、玩家存档随玩家变化，两者生命周期和错误处理不同。当前框架没有配置契约与实现，既有 `versioned-storage` 已覆盖存档侧（7.3/7.4），配置侧（7.1/7.2）仍缺失。本 change 补齐 7.1/7.2：先建立引擎无关的配置服务与测试，再实现 Bundle 配置加载适配器，并保证配置不与玩家存档混用。

## What Changes

- 新增 `config` 能力，提供引擎无关的配置服务模型：
    - 类型化读取：按配置键读取类型化配置值，键与值的类型由调用方声明
    - 缺失与解析失败：缺失配置、解析失败分别以类型化错误表达，可被调用方分支处理
    - 默认值策略：配置缺失时可回退到调用方提供的默认值
    - 只读快照：读取到的配置以只读快照暴露，配置装载后不被运行时修改
- 新增 Bundle 配置加载适配器：经资源层加载配置资源，复用 `LoadCoordinator`/`ResourceScope` 语义
- 配置与存档边界：配置走资源读取路径，不使用玩家存档的键值存储后端，互不混用
- 根入口白名单同步：按既有 `expectedRootExports` 机制收口新公开符号

## Capabilities

### New Capabilities

- `config`: 类型化配置服务，覆盖类型化读取、缺失/解析失败处理、默认值策略、只读快照与 Bundle 配置加载

### Modified Capabilities

无。`resource-management` 的加载能力仅被复用，不改变其行为需求。

## Impact

- 新增代码：`assets/framework/contracts/config/*`（纯契约）、`assets/framework/core/config/*`（配置服务与只读快照）、`assets/framework/adapters/cocos/config/*`（Bundle 配置加载适配器）
- 新增测试：`tests/framework/foundation/config.test.ts` 覆盖 7.1 全部点（类型化读取、缺失、解析失败、默认值策略、只读快照）；Bundle 配置加载适配器集成测试覆盖 7.2
- 依赖：内核为纯 TypeScript，无 Cocos 依赖；适配器依赖 `cc`、资源层与配置 Bundle
- 影响公开入口：`index.ts` 白名单需同步新增配置契约与核心符号
