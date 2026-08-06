# Implement Audio Service v1

## Why

主框架 change `create-game-framework-v1` 的第 6 章规划了音频能力：RPG、格斗等品类需要按 music/sfx/ui 分组管理音频，支持音量、静音、切歌、作用域停止，并在音频作为可选模块失败时不终止应用。当前框架没有音频契约与实现，`assets/audio` Bundle 已建立但无消费方。本 change 补齐 6.6/6.7：先建立引擎无关的音频服务内核与测试，再实现 Cocos 音频适配器。

## What Changes

- 新增 `audio` 能力，提供引擎无关的音频服务模型：
  - 分组：music / sfx / ui 三类音频分组，各自独立音量与静音状态
  - 音量与静音：分组级与全局音量控制，静音不破坏音量设定
  - 切歌与播放：支持按资源播放、停止、暂停/恢复与切歌
  - 作用域停止：页面或功能作用域释放时停止其启动的音频
  - 可选模块降级：音频后端不可用时服务降级为 no-op，不导致应用失败
- 新增 Cocos 音频适配器：基于 `cc.AudioSource`/`AudioClip` 实现播放、停止与音量，遵循薄映射与引擎接缝可注入 mock 模式
- 前后台策略：接入 `ApplicationVisibility` 契约，后台暂停、前台恢复（或按策略处理），与 `CocosApplicationAdapter` 同链
- 根入口白名单同步：按既有 `expectedRootExports` 机制收口新公开符号

## Capabilities

### New Capabilities

- `audio`: 分组音频服务，覆盖 music/sfx/ui 分组、音量、静音、切歌、作用域停止、可选模块降级与前后台切换策略

### Modified Capabilities

无。`platform-time-scheduling` 的 `ApplicationVisibility` 仅被消费，不改变其行为需求。

## Impact

- 新增代码：`assets/framework/contracts/audio/*`（纯契约）、`assets/framework/core/audio/*`（分组音频服务与降级逻辑）、`assets/framework/adapters/cocos/audio/*`（Cocos 音频适配器）
- 新增测试：`tests/framework/foundation/audio.test.ts` 覆盖 6.6 全部点（分组、音量、静音、切歌、作用域停止、可选模块降级）；Cocos 适配器集成测试覆盖 6.7 前后台策略
- 依赖：内核为纯 TypeScript，无 Cocos 依赖；适配器依赖 `cc`、资源层（`kind: "asset"` 加载 AudioClip）与 `ApplicationVisibility`
- 影响公开入口：`index.ts` 白名单需同步新增音频契约与核心符号
