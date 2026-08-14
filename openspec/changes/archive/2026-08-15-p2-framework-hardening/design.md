## Context

现状（见 proposal.md - Why）：

- `CocosInputAdapter.subscribe`：`listener` 单槽位；已绑定后重复订阅返回空退订（第二消费者被静默拒绝）。
- `LoadCoordinator`：`entries` Map 无上限，终态条目仅经 `invalidate` 移除。
- `UiNavigator.close(pageId?)`：行为支持关闭任意页（测试已覆盖非栈顶场景），契约注释未声明。
- `CocosAudioAdapter`：`dispose()` 清空 `sources`；之后 `play` 经 `sourceFor` 重建 source（复活）。
- `resolveMovePath`/`stepToward`：`cur.row !== tgt.row` 时返回 undefined，跨排目标不可达。
- 约束：Creator 转译（`[...iterable]` → concat 失效，用 `Array.from`）；ES2015；`public-boundary` 精确白名单（本批不改白名单）；`IResourceProviderOptions` 为公开契约（新增字段必须可选）。

## Goals / Non-Goals

**Goals:** 多消费方输入；有界协调器缓存；导航契约文档化；音频销毁不可复活；跨排移动可达；本地门禁全绿。

**Non-Goals:** 渲染热路径优化（P2-11）；list 重试事件化（P2-10）；工具链/存档兼容项（P2-4/5/6/9）。

## Decisions

### D1: 输入适配器多订阅者（P2-1）

`listeners` 改为 `Set<(event) => void>`；`emit` 用 `Array.from` 快照遍历（订阅者 emit 期间退订不破坏迭代）。`subscribe`：同一回调重复订阅返回空退订（Set 去重）；首个订阅者加入时 `bindEngine()`（注册全部 handler），最后一个退订时 `unbindEngine()`（按引用 off + 清空手柄状态）。备选：保留单槽位并文档化（限制未来 GM 面板等多消费方）；事件总线中转（过度设计）。

### D2: 协调器终态缓存容量上限（P2-2）

`LoadCoordinatorOptions.maxEntries?`：`settleEntry` 转终态后 `enforceCap()`——Map 按插入序迭代，从头驱逐最早的**终态**条目直至 `size <= cap`；loading 条目永不驱逐（共享加载语义）。已 resolved 的 handle 持有资源引用，驱逐只影响未来 load（重新触发底层加载）。`IResourceProviderOptions.maxCoordinatorEntries?` → `ResourceProvider` → `Memory/CocosResourceProvider` 接线；缺省 undefined 行为不变。备选：LRU 基于访问时间（需要每次 load 更新次序，复杂度高）；只在 Provider 层限（协调器原语仍无界）。

### D3: 导航关闭契约文档化（P2-3）

`UiNavigator.close` JSDoc 补充：关闭非栈顶页面时原地移除该页，其余页面相对顺序不变（层级由打开时按 layer 插入维护），模态状态始终由关闭后的新栈顶推导。行为无改动（既有测试已锁定）。

### D4: 音频适配器 dispose 守卫（P2-7）

新增 `disposed` 标志：`dispose()` 幂等（二次调用 no-op）；`play`/`stop`/`pause`/`resume`/`setVolume` 在 disposed 时直接返回（不重建 source、不发起加载）。服务生命周期契约：销毁即不可用。备选：disposed 后抛错（调用方误用暴露为崩溃）；允许复活（违背销毁语义）。

### D5: 移动解析跨排步进（P2-8）

`stepToward`：行不同时优先向目标行推进一行（列不变），行对齐后沿列方向推进。下界越界（row/col < 0）守卫不变；上界越界由调用方 `grid.move` 校验拒绝（路径解析仅需下界守卫）。确定性不变（纯函数、无随机）；默认 3v3 全前排布阵下行为与旧实现一致（同排移动），仅跨排配置产生新路径。

## Risks / Trade-offs

- **D1 语义扩展**：单消费者 → 多消费者是行为超集；既有"重复订阅空退订"测试改写为 Set 去重 + 多订阅者并存断言。引擎监听绑定时机不变（首订阅绑定/末退订解绑），未注入接缝的默认路径零影响。
- **D2 驱逐时序**：`enforceCap` 在 `settleEntry` 内、waiters 通知之后执行——驱逐前所有等待者已收到结果。loading 条目不被驱逐，并发共享语义不受影响。
- **D5 行为变化**：跨排移动改变非前排布阵的战斗轨迹；默认配置（前排）行为不变。unit-motion 的"非同排不移动"测试改写为跨排推进断言；全量战斗确定性测试（1x/2x/3x 一致）以默认前排配置运行，不受影响。

## Migration Plan

1. P2-1：CocosInputAdapter 多订阅者 + 测试重写。
2. P2-2：LoadCoordinator maxEntries + Provider/适配器接线 + cap 回归测试。
3. P2-3：UiNavigator.close JSDoc。
4. P2-7：CocosAudioAdapter disposed 守卫 + 测试。
5. P2-8：move.ts 跨排步进 + unit-motion 测试更新。
6. 文档：ADR-037；`openspec validate --specs --strict` 通过后归档。

回滚：各步独立可回退；D2 移除 maxEntries 即恢复无界（缺省行为）；D5 回退 stepToward 即恢复同排限制。

## Open Questions

无（关键决策均已在 D1–D5 确定；P2-4/5/6/9/10/11 以 Non-Goals 记录，各自独立评估）。
