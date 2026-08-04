## Why

父级 `create-game-framework-v1` 的 3.5–3.8 需要两组无业务含义的纯逻辑工具：有限状态机和显式所有者对象池。SceneFlow 的预加载/成功/失败保留/重试本质是一个状态机，回合制卡牌与格斗组合验证会复用 FSM 与对象池，因此这两组工具是第 5 章资源场景流转和第 8 章组合验证的公共前置。

## What Changes

- 新增无业务含义的纯 TypeScript 有限状态机：声明式状态/事件转移、进入/退出钩子、拒绝非法转换、状态一致性和失败回滚。
- 新增显式所有者的对象池：创建、复用、容量上限、重复归还、reset 钩子和 dispose。
- 保持核心不依赖 Cocos；对象池不自动池化任意 Cocos Node，只对显式持有者提供对象管理。
- 沿用根入口白名单收口策略，仅导出稳定契约与必要工厂。

## Capabilities

### New Capabilities

- `fsm`: 无业务语义的有限状态机，覆盖声明式转移、进入/退出钩子、非法转换拒绝与状态一致性。
- `object-pool`: 显式所有者的对象池，覆盖创建、复用、容量、重复归还、reset 与 dispose。

### Modified Capabilities

- 无。

## Impact

- 影响 `assets/framework/core/fsm`、`assets/framework/core/pooling` 及其纯 TypeScript 实现和测试入口。
- 扩展现有 Bun foundation 测试与 Foundation 类型检查门禁，不新增运行时依赖。
- 新增最小公开契约和工厂导出；后续 SceneFlow（5.6–5.7）可直接复用 FSM，格斗/卡牌组合验证可复用对象池与模拟时钟。
- 本 Change 不引入业务规则、不实现场景流转本身、不自动池化 Cocos Node、不建立资源生命周期或通用 Scope。
