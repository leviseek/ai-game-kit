# ADR-037: Input Multi-Subscribers, Coordinator Cache Cap, and Cross-Row Movement

## Status

Accepted

## Context

P1 批次后的五个 P2 级框架加固项：

1. `CocosInputAdapter` 单槽位 listener——第二订阅者被静默拒绝，未来多消费方（GM 面板等）无法并存。
2. `LoadCoordinator` 终态缓存无上限——长生命周期 Provider 加载大量 key 且从不 invalidate 时无界增长。
3. `UiNavigator.close` 非栈顶关闭行为有测试锁定但契约注释未声明。
4. `CocosAudioAdapter.dispose` 后 `play` 经 `sourceFor` 重建 AudioSource——"废弃服务复活"。
5. `resolveMovePath` 的 `stepToward` 行不同即返回 undefined——跨排目标（中排打前排）永远不可达。

## Decision

### 1. 输入适配器多订阅者（P2-1）

`listener` 单槽位改为 `Set<(event) => void>`：`emit` 以 `Array.from` 快照遍历（emit 期间退订不破坏迭代）；`subscribe` 同一回调去重（第二次空退订）；首个订阅者加入时 `bindEngine()` 注册全部引擎 handler，最后一个退订时 `unbindEngine()` 按引用解绑并清空手柄状态（引用计数）。理由：多消费者是单消费者的行为超集，引擎绑定时机不变，默认路径零影响。

### 2. 协调器终态缓存容量上限（P2-2）

`LoadCoordinatorOptions.maxEntries?`：`settleEntry` 转终态后 `enforceCap()`——Map 按插入序迭代，驱逐最早终态条目至 `size <= cap`，loading 条目永不驱逐（共享加载语义）。经 `IResourceProviderOptions.maxCoordinatorEntries?` 接线到 Provider 与 Memory/Cocos 适配器；缺省不设上限（行为不变）。理由：已 resolved 的 handle 持有资源引用，驱逐只影响未来 load，无泄漏；LRU 按访问时间重排复杂度高、收益低。

### 3. 导航关闭契约文档化（P2-3）

`UiNavigator.close` JSDoc 声明非栈顶关闭语义：原地移除、其余相对顺序不变（层级由打开时按 layer 插入维护）、模态由新栈顶推导。行为无改动。

### 4. 音频适配器 dispose 守卫（P2-7）

新增 `disposed` 标志：`dispose()` 幂等；`play`/`stop`/`pause`/`resume`/`setVolume` 在 disposed 时直接返回（不重建 source、不发起加载）。服务生命周期契约：销毁即不可用。

### 5. 移动解析跨排步进（P2-8）

`stepToward` 行不同时优先向目标行推进一行（列不变），行对齐后沿列推进；下界越界守卫不变，上界越界由调用方 `grid.move` 校验拒绝。确定性不变（纯函数）；默认前排布阵行为与旧实现一致，仅跨排配置产生新路径。

## Consequences

- **framework/adapters/cocos**：`CocosInputAdapter`（多订阅者）、`CocosAudioAdapter`（dispose 守卫）。
- **framework/core**：`LoadCoordinator`（maxEntries + enforceCap）、`ResourceProvider`（接线）、`UiNavigator`（契约注释）。
- **framework/contracts**：`IResourceProviderOptions.maxCoordinatorEntries?`（可选）。
- **samples/game_auto_battle/logic**：`move.ts` 跨排步进。
- **测试**：input 多订阅者重写、load-coordinator cap、audio dispose 守卫、unit-motion 跨排更新。全部门禁本地绿。
- **Non-Goals（记录）**：P2-11 渲染热路径（架构文档约定 MVP 全量写，需真实性能数据）；P2-10 list 重试事件化（需 UI-ready 就绪管线）；P2-4/5/6/9 工具链与存档兼容项独立评估。
- **落地 change**：`2026-08-15-p2-framework-hardening`。
