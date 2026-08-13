## Context

现状战场页渲染是"每 tick 全量重建 VM"（`presenter.ts` render → `buildAutoBattleBindings` 按存活单位动态生成绑定 → `setBindings` 全量刷新）。事件流已具备 `attack` / `skill-damage` / `skill-heal` / `unit-dead`，事件带 `seq`（保序）与 `value` / `targetId`。单位屏幕坐标由 `gridToXY(gridKey)` 单向推导。FGUI 自建组件禁手写 transition（AGENTS），动画必须 TS 驱动。framework `ViewModelNode` 契约目前只有 text/progress/visible/command/position，**无 alpha**（淡出所需）。见 proposal.md - Why 与 `auto-battle-hit-feedback` spec。

## Goals / Non-Goals

**Goals:**

- 事件→特效投影器：把 `attack`/`skill-damage`（伤害飘字 + 受击闪白/抖动）与 `skill-heal`（治疗飘字）投影为特效意图。
- 引擎无关纯逻辑可测：投影器是纯函数（事件增量 → 特效意图），动画器时间源可注入（测试可控推进）。
- 动画终态回到 state 姿态：飘字/闪白/抖动结束后无残留位移/透明度。
- 不进入逻辑层、不改事件流与战斗结果（确定性不回归）。

**Non-Goals:**

- 不做序列帧光效、粒子、复杂动画（D4 排除）。
- 不改战斗逻辑层与事件流；特效不产生新事件。
- 不改 `gridToXY` 坐标语义与 UnitSlot 绑定。
- 不引入新动画库；动画为简单线性插值（alpha/xy 两轴）。

## Decisions

### 决策 1：特效意图模型（引擎无关纯逻辑）

新增 `view/effects.ts`：定义 `HitFeedbackEffect` 判别联合与投影纯函数：

```ts
type HitFeedbackEffect =
    | { kind: "damage-float"; unitId: string; value: number; seq: number }
    | { kind: "heal-float"; unitId: string; value: number; seq: number }
    | { kind: "hit-flash"; unitId: string; seq: number };

projectHitFeedbackEvents(
    events: readonly AutoBattleEvent[],
    cursor: number,
): { effects: readonly HitFeedbackEffect[]; cursor: number }
```

- `cursor` 为上次消费的 `seq`，投影器只产出 `seq > cursor` 的事件对应的特效（增量、幂等、可重放）。
- `attack`/`skill-damage` → `damage-float` + `hit-flash`；`skill-heal` → `heal-float`；`unit-dead` 忽略。
- 纯函数无副作用，测试直接断言输入事件序列 → 输出特效意图。

理由：特效意图是"事件→表现"的映射，做成纯函数使投影逻辑可在无 fgui 环境全量测试，与既有 `formation`/`skills` 纯函数模块先例一致。

### 决策 2：动画器独立于渲染器，时间源可注入

新增 `view/effect-animator.ts`：`createEffectAnimator({ node, timeSource })` 消费特效意图并驱动节点 alpha/xy：

```ts
interface EffectNode {
    setAlpha?(value: number): void;
    setXY?(x: number, y: number): void;
}

createEffectAnimator(options: {
    node: (name: string) => EffectNode | undefined;
    timeSource: () => number; // 毫秒时间戳，测试注入自增源
}): {
    play(effects: readonly HitFeedbackEffect[]): void;
    step(): void; // 每帧推进一次动画插值
    active(): number; // 进行中动画数（测试断言）
}
```

- **飘字**（`damage-float`/`heal-float`）：在目标节点上方创建/复用 `fx_float_{unitId}` 文本节点，显示 `value`，从目标坐标向上位移 + 淡出（alpha 1→0），约 600ms 后终态 alpha=0、xy 归位。
- **闪白**（`hit-flash`）：目标节点下叠加 `fx_flash_{unitId}` 白色遮罩（image 像素图），alpha 0→1→0 短促（约 120ms），终态 alpha=0。
- **抖动**：目标单位节点自身 `xy` 短促偏移（约 200ms，±4px），终态回到 `gridToXY` 派生的原坐标。
- 动画器不触碰渲染器绑定；单位节点坐标经 `gridToXY` 在终态回写，避免与 position 绑定漂移。

理由：渲染器是 state 全量 diff（绑定语义），特效是增量演示（动画语义），两者职责不同，拆开避免渲染器被动画中间值污染（动画中间帧不该进绑定 diff）。时间源注入保证测试可控、确定性。

- 备选：把特效动画塞进 `buildAutoBattleBindings`。放弃：动画中间帧会进入绑定 diff，破坏"state 为准"语义与确定性测试。

### 决策 3：framework `ViewModelNode` 增加可选 `setAlpha?`

`assets/framework/contracts/ui/ViewModel.ts` 的 `ViewModelNode` 增加 `setAlpha?(value: number): void`（后向兼容可选方法，对齐 `setXY?` 先例）；`assets/framework/adapters/cocos/ui/FairyGuiViewHandle.ts` 的 `wrapFairyGuiObject` 补 `setAlpha` 写 `child.alpha`；测试记录节点（assembly/smoke）补 `alpha` 字段记录。渲染器**不新增 alpha 绑定 kind**（特效不走绑定，动画器直接调节点）。

理由：动画器需要 alpha 能力，但该能力只在特效上下文使用；加可选方法保持契约向后兼容（旧节点不实现则不写），与 `setXY?` 的演进模式一致。

- 备选：特效节点单独定义 `EffectNode` 契约不碰 framework。放弃：动画器消费的节点名解析仍走 `node(name)` 接缝（真实 fgui 页面与测试内存节点共用），统一在 `ViewModelNode` 契约扩展更内聚；单独契约会导致装配层两套包装。

### 决策 4：飘字用文本节点、闪白用像素遮罩

- **飘字**：`fx_float_{unitId}` 用 FGUI `text` 节点（伤害/治疗数值），不需要像素图——数字文本由 fontSize 呈现，避免为 0-9 各生成像素。
- **闪白**：`fx_flash_{unitId}` 用 `image` 节点引用白色像素图（`bun run fgui sprite` 生成，palette 取 `white` #ffffff）。
- 像素图与节点 XML 委派 fgui-designer 产出，登记到 `AutoBattle` 包；产出后 `bun run fgui validate --strict` 通过。

理由：飘字数值是动态文本，FGUI text 天然支持；闪白是静态纯色遮罩，符合 palette 锁定的 sprite 生成约束。最小化像素图数量（仅 1 张白图），符合 D4"像素风 + 不做复杂序列帧"。

### 决策 5：presenter 集成与生命周期

`presenter.ts` 每帧：

1. `clock.advance` + tick（不变）→ `render()`（state 全量渲染，不变）；
2. `projectHitFeedbackEvents(events, cursor)` 取增量特效；
3. `animator.play(effects)`；`animator.step()` 推进动画并回写终态；
4. `restart` 时投影器 cursor 重置（事件日志清空），动画器 `active()` 清空（避免旧对局动画残留）。

`assembly.ts` 装配：`viewModel.node(name)` 解析器同时用于动画器（动画器节点名走同一解析器）；测试经 `fixture.effects` 暴露投影器/动画器钩子。

理由：presenter 是渲染与动画的唯一驱动点，cursor 由 presenter 持有保证增量消费与 restart 重置同步；装配层复用既有节点解析器，测试与冒烟共用同一接缝。

## Risks / Trade-offs

- [特效与 position 绑定竞争单位节点坐标（抖动 vs state 坐标）] → 抖动只作用于动画期间、终态回写 `gridToXY` 原坐标；动画器不写绑定 diff，渲染器 state 渲染始终以 `gridToXY` 为准，动画结束即回位。
- [accelerate 挡位下特效堆积] → 飘字复用同节点（新特效覆盖旧值），动画器 `active()` 有上限保护（可配置），避免高频事件下节点无限堆积。
- [framework 契约扩展引入回归] → `setAlpha?` 为可选方法，旧节点不实现则动画器跳过（对齐 `setXY?` 容错语义）；`contract.typecheck.ts` 契约清单同步更新。
- [确定性被特效破坏] → 特效是演示层增量，不进入 tick 序列与事件流；既有"同编队回放一致"测试继续锁定；新增测试断言"有无特效渲染事件序列一致"。
- [动画时钟与模拟钟混淆] → 动画器用独立 `timeSource`（真实节拍），战斗推进仍用模拟钟；两者不混用，动画只影响表现不参与结算。
