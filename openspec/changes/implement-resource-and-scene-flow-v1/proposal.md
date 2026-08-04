## Why

Foundation 已具备应用生命周期、时间与调度、FSM 和对象池，但 Framework 仍缺少资源加载协调与场景流转边界。当前业务只能依赖 Cocos 默认 `resources` 和手工 `assetManager.loadBundle()`，无法表达 Bundle 所有权、并发去重、作用域释放和场景切换失败保留。现在按 ADR-004 的 Bundle First 策略补齐资源与场景流转能力，可以让后续 UI、音频、配置、存档和五类组合验证建立在统一资源所有权模型之上。

## What Changes

- 新增引擎无关的资源 handle，封装 Bundle/资源标识、加载状态和加载 Promise，业务代码只持有 handle 而不直接操作 `cc.Asset`。
- 新增资源作用域模型，支持页面/场景/应用作用域逆序释放；仍被引用的资源保留，全部所有者释放后 Bundle 才可卸载。
- 新增加载协调器，覆盖并发加载去重、加载失败传播、取消等待者和不同作用域共享同一底层资源。
- 新增 `IResourceProvider` 契约与 Cocos Asset Bundle 适配器，成为业务代码访问资源的唯一入口；禁止业务直接调用 `assetManager.loadBundle()`，保留底层错误 cause 和资源标识。
- 新增 `SceneFlow` 场景流转编排，覆盖预加载、进度上报、成功切换、失败保留当前场景、重试和场景作用域释放。
- 新增 Cocos 场景适配器，将 `SceneFlow` 规则映射到 `cc.director.loadScene`，不修改 `startup.scene` 序列化内容。
- 通过 Cocos Creator 建立最小 `common`、`ui`、`audio` 和游戏内容 Bundle，确认 `resources` 只保留启动所需资源。
- 不实现 FairyGUI package 注册与 View 生命周期，该能力依赖 UI 相关 change；本 Change 只建立 Bundle 与资源作用域基础设施。

## Capabilities

### New Capabilities

- `resource-management`: 定义引擎无关的资源 handle、资源作用域、加载协调器和 `IResourceProvider` 契约，覆盖加载去重、失败传播、取消、作用域逆序释放与 Bundle 可卸载判断。
- `scene-flow`: 定义场景流转编排行为，覆盖预加载、进度上报、成功切换、失败保留当前场景、重试与场景作用域释放。

### Modified Capabilities

- 无。

## Impact

- 影响 `assets/framework/contracts`、`assets/framework/core`、`assets/framework/adapters/cocos` 及现有 Bun foundation 测试与类型检查门禁，不新增运行时依赖。
- 新增最小公开契约和工厂导出，后续 UI、音频、配置与存档 Change 可复用资源作用域与 `SceneFlow`。
- 通过 Cocos Creator 建立新 Bundle 目录和最小资源；不手工编辑 `.meta` UUID、项目 UUID、`startup.scene` 序列化或 Creator 生成目录。
- 本 Change 不实现 FairyGUI package 生命周期、页面级资源自动释放联动、音频资源策略或跨场景业务状态迁移；这些能力留给后续独立 Change。
