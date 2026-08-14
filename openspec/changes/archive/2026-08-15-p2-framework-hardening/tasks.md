# Implementation Tasks

## 1. P2-1 输入适配器多订阅者

- [x] 1.1 `CocosInputAdapter`：`listener` 单槽位改 `Set` 多订阅者；`emit` 快照遍历；首订阅 `bindEngine()`/末退订 `unbindEngine()`（引用计数）；同一回调重复订阅去重
- [x] 1.2 测试：`cocos-input-adapter.test.ts` 重写 double-subscribe 为「多订阅者并存、引擎绑定一次、末位退订解绑」+「同回调去重」

## 2. P2-2 协调器缓存容量上限

- [x] 2.1 `LoadCoordinatorOptions.maxEntries?` + `enforceCap`（插入序驱逐最早终态，loading 不驱逐）
- [x] 2.2 `IResourceProviderOptions.maxCoordinatorEntries?` → `ResourceProvider` → `Memory/CocosResourceProvider` 接线
- [x] 2.3 测试：`load-coordinator.test.ts`（超上限驱逐最旧 + 重载新资源；loading 条目不驱逐）

## 3. P2-3 导航契约文档

- [x] 3.1 `UiNavigator.close` JSDoc 补充非栈顶关闭语义（行为无改动，既有测试锁定）

## 4. P2-7 音频 dispose 守卫

- [x] 4.1 `CocosAudioAdapter`：`disposed` 标志；`play/stop/pause/resume/setVolume` disposed 时 no-op；`dispose` 幂等
- [x] 4.2 测试：`cocos-audio-adapter.test.ts`（销毁后调用不重建 source、不新增播放/停止、不发起加载）

## 5. P2-8 移动解析跨排步进

- [x] 5.1 `move.ts` `stepToward`：行不同时优先向目标行推进（列不变），行对齐后沿列推进；下界守卫不变
- [x] 5.2 测试：`game-auto-battle-unit-motion.test.ts` 改写「非同排不移动」为跨排推进断言 + 垂直占用阻断场景

## 6. 文档与最终校验

- [x] 6.1 新增 `doc/decisions/ADR-037-framework-hardening-input-subscribers-coordinator-cap-and-cross-row-move.md`
- [x] 6.2 全量门禁：`bun run test` / `bun run typecheck` / `bun run lint` / `bun run format:check` 全部通过
- [x] 6.3 运行 `openspec validate 2026-08-15-p2-framework-hardening --strict`，Expected: PASS
- [x] 6.4 归档后运行 `openspec validate --specs --strict`，Expected: PASS
