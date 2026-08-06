# Implement Audio Service v1 — Design

## Context

框架已具备分层模式：`contracts/*`（纯接口与类型化错误）、`core/*`（引擎无关实现）、`adapters/memory/*` 与 `adapters/cocos/*`（注入接缝）、`tests/framework/foundation/*.test.ts`（bun）。`contracts/platform/Platform.ts` 已有 `ApplicationVisibility` 与 `ApplicationVisibilityState`，`CocosApplicationAdapter` 把引擎前后台事件转换为应用生命周期调用。资源层 `IResourceProvider` 已支持 `kind: "asset"` 加载，`assets/audio` Bundle 已在资源 change 建立。本 change 在其上实现分组音频服务与 Cocos 适配器。

## Goals / Non-Goals

**Goals:**
- 提供引擎无关的分组音频服务：music/sfx/ui 分组、音量、静音、切歌、作用域停止、可选模块降级
- Cocos 音频适配器：基于 `cc.AudioSource`/`AudioClip` 的播放、停止与音量，引擎接缝可注入 mock
- 前后台策略：接 `ApplicationVisibility`，后台暂停、前台恢复
- 严格类型化，内核不依赖 `cc`，根入口白名单同步

**Non-Goals:**
- 不实现 3D 空间音频、音效混合图、音频流文件流式播放或 DSP 效果
- 不实现音频资源清单与加载编排（复用资源层 `kind: "asset"`，不重建加载逻辑）
- 不在框架定义具体游戏音效/音乐标识（属 `game` 层）
- 不实现联网音频或远程流

## Decisions

### 1. 内核采用"分组状态 + 播放作用域 + 后端契约"模型

内核维护 music/sfx/ui 三个分组的状态（音量、静音、当前播放句柄），通过注入的 `AudioBackend` 契约（play/stop/pause/resume/setVolume）驱动真实音频；作用域释放时停止其记录的全部播放。

- **理由**：分组与作用域语义是纯 TS 状态管理，可脱离引擎测试；后端契约薄，Cocos 与测试替身都可实现。
- **备选**：内核直接调用 Cocos API。会让核心逻辑依赖 `cc`，破坏可测试性与分层。

### 2. 降级通过"后端是否可用"开关表达

服务构造时检测后端可用性；不可用时置降级标志，所有操作走 no-op 路径并暴露可查询状态。

- **理由**：设计决策 13 明确"可选音频模块失败不必然终止应用"；显式降级比静默吞错更可诊断。
- **权衡**：降级状态下返回结果而非抛错，调用方需通过可查询状态判断；符合 spec"无副作用成功返回且可感知降级"。

### 3. 前后台策略由调用方配置

服务接收策略配置（如后台暂停 music 分组），订阅 `ApplicationVisibility` 变更并执行对应策略；切换处理内捕获错误并记录结构化诊断，不向上抛破坏生命周期。

- **理由**：前后台行为属产品策略，游戏可按需配置；与 `CocosApplicationAdapter` 的可见性链路一致。
- **备选**：服务内部固定规则。会限制不同品类对前后台音频的需求。

### 4. 音频资源经资源层加载

播放音频以资源键（bundle + path）传入，经 `IResourceProvider.load`（`kind: "asset"`）取得音频资源后交给后端播放。

- **理由**：复用既有加载去重、作用域计数与逆序释放语义，不重建资源加载。
- **权衡**：音频资源的生命周期归资源作用域管理，音频服务需在作用域释放前完成停止。

### 5. 无业务音频标识

服务不枚举具体音乐/音效；播放以调用方提供的音频资源键为参数，框架只保证分组、作用域与音量语义。

- **理由**：与设计决策 10 一致，具体音频属 `game` 层。

## Risks / Trade-offs

- [音频资源与播放作用域生命周期不一致] → 停止先于作用域释放完成，集成测试覆盖资源释放闭环。
- [降级状态被调用方误当成功] → 提供显式可查询的降级状态与结构化诊断，测试断言降级路径。
- [后台暂停与用户手动暂停冲突] → 策略区分"因可见性暂停"与"用户暂停"，恢复时只解除前者，避免覆盖用户意图。
- [Cocos AudioSource 与 Web/原生差异] → 适配器薄映射并集中处理引擎可空引用，Web Desktop 冒烟为当前验证目标。

## Migration Plan

无存量迁移。实现顺序为 TDD：先写 `tests/framework/foundation/audio.test.ts` 覆盖 spec 场景（红期），再实现 `contracts/audio/*` 与 `core/audio/*` 至转绿；随后实现 Cocos 适配器与前后台集成测试；最后同步根入口白名单。归档前执行 ADR 检查。

## Open Questions

无。分组范围、降级语义、前后台策略与资源接入方式已在 Decisions 落定，不改变 spec 行为契约。
