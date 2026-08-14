## Why

P1 批次后剩余的五个 P2 级缺陷，均为可本地验证的小幅加固：

1. **P2-1 `CocosInputAdapter` 单消费者假设**：`subscribe` 单槽位 listener，第二订阅者被拒绝（返回空退订）；未来多消费方（如 GM 面板）并存会互相吞事件。
2. **P2-2 `LoadCoordinator` 终态缓存无上限**：长生命周期 Provider 加载大量不同 key 且从不 invalidate 时，ready/failed 终态条目无界增长。
3. **P2-3 `UiNavigator.close` 非栈顶语义未文档化**：关闭非栈顶页的行为（原地移除、其余相对顺序不变）有测试覆盖但契约注释未声明。
4. **P2-7 `CocosAudioAdapter.dispose` 后无守卫**：销毁后调用 `play` 会经 `sourceFor` 重建 AudioSource（"废弃服务复活"）。
5. **P2-8 `resolveMovePath` 仅同排前移**：跨排目标（如中排打前排）永远不可达，"只守不攻"（玩法规则正确性）。

## What Changes

- **P2-1**：`CocosInputAdapter` 改为多订阅者（`Set` 去重，全部订阅者收到同一事件流）；引擎监听在首个订阅者加入时绑定、最后一个退订时解绑（引用计数）；同一回调重复订阅去重。
- **P2-2**：`createLoadCoordinator` 新增可选 `maxEntries`（终态缓存上限）：超过上限按插入序驱逐最早进入终态的条目，loading 条目永不驱逐；经 `IResourceProviderOptions.maxCoordinatorEntries` 接线到 Provider 与 Memory/Cocos 适配器（缺省不设上限，行为不变）。
- **P2-3**：`UiNavigator.close` 契约注释补充非栈顶关闭语义（原地移除、其余相对顺序不变、模态由新栈顶推导）。
- **P2-7**：`CocosAudioAdapter` 新增 `disposed` 守卫：`dispose` 后 `play`/`stop`/`pause`/`resume`/`setVolume` 为 no-op，不重建 AudioSource；重复 dispose 幂等。
- **P2-8**：`resolveMovePath` 的 `stepToward` 改为行不同时优先向目标行推进一行（列不变）、行对齐后沿列推进；跨排目标可达，占用/越界仍停在当前格（确定性不变）。

## Goals / Non-Goals

**Goals:** 输入适配器支持多消费方；协调器缓存有界；导航契约文档完整；音频销毁后不可复活；跨排移动可达；本地全部门禁保持全绿。

**Non-Goals:** 不做 P2-11 渲染热路径优化（架构文档约定 MVP 全量写，需真实性能数据后才引入 diff）；不做 P2-10 list.ts 重试事件化（需新增 UI-ready 就绪事件管线，轮询当前功能正确）；不做 P2-4/5/6/9（工具链跨包反向校验、public-boundary AST 化、大文件拆分、版本化存储迁移涉存档兼容，均需独立决策）。

## Capabilities

### Modified Capabilities

- `input`: Cocos 输入适配器多订阅者（引擎监听引用计数绑定/解绑）。
- `resource-management`: 加载协调器终态缓存可选容量上限（驱逐最早终态，loading 不驱逐）。
- `ui-navigation`: 导航关闭契约补非栈顶语义文档。
- `audio`: 音频适配器 dispose 后 no-op 守卫（不重建 AudioSource）。
- `auto-battle-unit-motion`: 移动解析跨排步进（优先行后列，目标可达）。

## Impact

- **assets/framework/adapters/cocos**: `input/CocosInputAdapter.ts`（多订阅者）、`audio/CocosAudioAdapter.ts`（dispose 守卫）。
- **assets/framework/core**: `resource/LoadCoordinator.ts`（maxEntries）、`resource/ResourceProvider.ts`（接线）、`ui/UiNavigator.ts`（契约注释）。
- **assets/framework/contracts**: `interfaces/IResourceProviderOptions.ts`（maxCoordinatorEntries）。
- **assets/framework/adapters**: `memory/MemoryResourceProvider.ts`、`cocos/resource/CocosResourceProvider.ts`（接线）。
- **assets/samples/game_auto_battle/logic**: `move.ts`（跨排步进）。
- **tests/framework/foundation**: `cocos-input-adapter.test.ts`（多订阅者重写）、`load-coordinator.test.ts`（cap 回归）、`cocos-audio-adapter.test.ts`（dispose 守卫）、`game-auto-battle-unit-motion.test.ts`（跨排移动更新）。
- **docs**: 新增 ADR-037。
