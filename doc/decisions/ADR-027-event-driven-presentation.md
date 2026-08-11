# ADR-027 Event-Driven Presentation

## 状态

Accepted

## 背景

`game_auto_battle` 战场页在 change 01-05 后为"state 全量渲染"：presenter 每 tick 全量重建 ViewModel，经绑定 diff 刷新节点，战斗状态（单位位置/血条/能量条）是渲染唯一真相。但纯观战缺少命中反馈——玩家无法从视觉感知"谁打谁、打了多少"。roadmap Stage 2 决策 D4 要求像素风命中反馈（飘字 + 受击闪白/抖动），并约定：特效作为事件投影（event projection）叠加在 state 渲染之上，动画是"演示层"，逻辑层不等动画完成，动画终态回到 state 快照姿态。

本 ADR 落地事件驱动表现层的第一阶段：命中反馈特效（change 07）。同时为 change 08（入场/移动/瞬移 + 距离移动，`move`/`teleport` 事件成为一等公民）确立模式基线。

## 决策

### 1. 特效意图为引擎无关纯数据，事件经投影器增量产出

新增 `view/effects.ts`：`HitFeedbackEffect` 判别联合（`damage-float` / `heal-float` / `hit-flash`，字段 unitId/value/seq）；纯函数 `projectHitFeedbackEvents(events, cursor)` 把战斗事件按 `seq > cursor` 增量投影为特效意图，返回新游标。

- `attack` / `skill-damage` → 伤害飘字 + 受击闪白/抖动；`skill-heal` → 治疗飘字；`unit-dead` 及无关事件忽略。
- 投影是纯函数（无随机/墙钟/副作用），同输入同输出；游标保证幂等增量（同一事件序列重复投影不重复产出）。

理由：特效意图与逻辑解耦、可全量测试；对齐 `formation`/`skills` 纯函数模块先例。备选（特效直接绑定事件回调）被否：破坏确定性测试与"事件是逻辑层唯一语义流"约定。

### 2. 动画器独立于渲染器，时间源注入

新增 `view/effect-animator.ts`：`createEffectAnimator({ node, timeSource, homeXYOf })` 消费特效意图并驱动节点 alpha/xy，与 ViewModel 渲染器完全分离。

- 渲染器是 state 全量 diff（绑定语义），动画器是增量演示（动画语义）；**动画中间帧不进入绑定 diff**，避免污染"state 为准"。
- 飘字（~600ms 上浮淡出）、闪白（~120ms alpha 脉冲）、抖动（单位节点短促偏移，以 `homeXYOf` 提供的绝对坐标为基准回位）。
- `timeSource` 为注入的毫秒时间戳：测试注入自增源确定性推进；presenter 用真实节拍。
- 动画终态统一回到 state 快照姿态（alpha=0、坐标归位），无状态漂移；`reset` 在 restart 时清空，避免旧对局动画残留。

理由：动画与绑定职责不同，拆开避免渲染器被动画中间值污染（动画中间帧不该进绑定 diff）；时间源注入保证测试可控、确定性不回归。

### 3. `ViewModelNode` 增加可选 `setAlpha?`，向后兼容

`assets/framework/contracts/ui/ViewModel.ts` 的 `ViewModelNode` 增加 `setAlpha?(value: number): void`（可选方法，对齐 `setXY?` 先例）；`wrapFairyGuiObject` 补实现写 `child.alpha`；测试/装配记录节点补 `alpha` 字段。**渲染器不新增 alpha 绑定 kind**——特效不经绑定，动画器直接调节点。

理由：动画器需要 alpha 能力但只在特效上下文使用；可选方法保持契约向后兼容（旧节点不实现则动画器跳过），与 `setXY?` 演进模式一致。

### 4. 动态组件解析器支持多映射与生命周期跟随

`createDynamicComponentViewHandle` 从单套映射演进为支持**映射数组**（每套独立容器/实例表，节点名依次匹配首套命中），并为映射增加可选 `activeIds`（回收时活跃 id 推导）。

- 战场页两套映射：`unit_{id}` → Common/UnitSlot，`fx_*_{id}` → AutoBattle/UnitHitFeedbackCom。
- 命中反馈节点名不在 ViewModel 绑定集内（动画器直接寻址），其活跃 id 从 `unit_{id}` 绑定节点推导——单位阵亡时特效实例随 UnitSlot 一起回收。

理由：特效实例须跟随单位生命周期，但绑定集不含 FX 节点名；多映射 + activeIds 使回收语义可配置。备选（FX 节点也进绑定集）被否：动画中间态会进绑定 diff，破坏决策 2 的分离原则。

### 5. 飘字用文本节点、闪白用像素遮罩，禁 FGUI transition

飘字 `fx_float` 用 FGUI `text` 节点（UBB 颜色：伤害鲜红 `#ff5252`、治疗亮绿 `#6fd96f`），闪白 `fx_flash` 用 `image` 引用白色像素图（`bun run fgui sprite` 生成，palette 取 `white`）。特效节点放 AutoBattle 包 `UnitHitFeedbackCom`（不动 Common 通用组件），页面新增 `container_effects` 容器。**不用 transition**——飘字/闪白/抖动全部由 TS 驱动（alpha/xy），对齐 AGENTS 第 10 条。伤害红与血条色（`#d95f59`）区分，治疗绿与伤害红对比清晰。

理由：飘字数值是动态文本（FGUI text 天然支持），闪白是静态纯色（符合 palette 锁定的 sprite 生成约束）；最小化像素图数量，符合 D4"像素风 + 不做复杂序列帧"。

## 理由

- 真源唯一：state 快照仍是渲染最终真相，特效是叠加演示层，动画终态回到快照姿态。
- 确定性不回归：特效不进入 tick 序列与事件流；"同一对局有无特效渲染事件序列一致"可断言。
- 边界清晰：投影纯函数（逻辑）、动画器（表现）、框架契约（可选方法）、FGUI（特效资源）各司其职。
- 可测试：投影器/动画器引擎无关全量可测（时间源注入）；既有回放一致性测试继续锁定确定性。
- 为 change 08 铺路：`move`/`teleport` 事件将按同一模式成为事件流一等公民，动画器在此基础上扩展入场/前冲/瞬移动画。

## 影响

- framework：`ViewModelNode` 可选 `setAlpha?`；`DynamicComponentViewHandle` 支持映射数组 + `activeIds`（向后兼容单映射）。
- `view/`：新增 `effects.ts`（投影器）、`effect-animator.ts`（动画器）；`presenter.ts` 接入投影游标与动画推进；`unit-node-mapping.ts` 新增 FX 映射与聚合数组。
- `assembly.ts`：装配动画器，fixture 暴露 `effects` 钩子（投影/动画器）。
- FGUI：AutoBattle 包新增 `UnitHitFeedbackCom.xml`（飘字文本 + 闪白遮罩）、`container_effects` 容器、闪白像素图（palette 登记治疗绿）；发布产物由编辑器生成。
- samples/boot 装配：`entry.ts` 导出动态映射数组，`GameLobbyHostImpl`/`smoke-proxy` 传数组给多映射解析器。
- 后续 change 08：扩展 ADR-027 决策（move/teleport 事件一等公民；动画终态语义在逻辑坐标真源下简化），并修订 ADR-025 决策 3（坐标真源移至逻辑层）。
