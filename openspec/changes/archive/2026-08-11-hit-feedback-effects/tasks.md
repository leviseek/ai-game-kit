## 1. framework 契约：alpha 能力

- [x] 1.1 `assets/framework/contracts/ui/ViewModel.ts`：`ViewModelNode` 增加可选方法 `setAlpha?(value: number): void`（后向兼容，对齐 `setXY?` 先例；注释说明"供演示层动画调节透明度，非绑定 kind"）。
- [x] 1.2 `assets/framework/adapters/cocos/ui/FairyGuiViewHandle.ts`：`wrapFairyGuiObject` 补 `setAlpha`（写 fgui `child.alpha`），保持 fgui 类型只在 adapter 边界。
- [x] 1.3 契约清单核对：`contracts.typecheck.ts` 不含 `ViewModelNode` 镜像（仅 framework 契约文件本身校验）；`public-boundary.test.ts` 的白名单仅列导出名，`setAlpha?` 是契约内方法不改变导出面——无需改动，typecheck 与契约类型测试验证通过。

## 2. 特效投影器（引擎无关纯逻辑）

- [x] 2.1 `view/effects.ts`（新）：`HitFeedbackEffect` 判别联合（`damage-float`/`heal-float`/`hit-flash`，字段 unitId/value/seq）；纯函数 `projectHitFeedbackEvents(events, cursor)`——`attack`/`skill-damage` → `damage-float` + `hit-flash`、`skill-heal` → `heal-float`、`unit-dead` 忽略；按 `seq > cursor` 增量产出并返回新 cursor。
- [x] 2.2 `view/effects.ts`：`createAutoBattleEffectsModule()` 登记模块（对齐 formation/skills 纯函数模块登记语义）。

## 3. 动画器（TS 驱动 alpha/xy）

- [x] 3.1 `view/effect-animator.ts`（新）：`createEffectAnimator({ node, timeSource, homeXYOf })`——`play(effects)` 记录待播动画、`step()` 按时间插值推进（飘字上浮淡出 ~600ms、闪白 alpha 0→1→0 ~120ms、抖动以 `homeXYOf` 绝对坐标为基准偏移）、`active()` 返回进行中动画数；终态 alpha=0、坐标回 `homeXYOf` 基准；动画器不触碰渲染器绑定。**实现偏差**：抖动复用闪白事件触发（动画器未独立 SHAKE_DURATION 时长），飘字/闪白/抖动共用动画器生命周期；`homeXYOf` 为调用方注入（presenter/fixture 从 state 按 unitId 查 gridToXY），保证抖动终态回到渲染器写同一 gridToXY 原值。
- [x] 3.2 动画器节点名约定：`fx_float_{unitId}`（文本，UBB 颜色伤害 #ff5252 / 治疗 #6fd96f）、`fx_flash_{unitId}`（image 遮罩，play 时 setXY 定位到单位坐标）；节点不存在或未实现 `setAlpha` 时跳过不中断（容错对齐契约）。**颜色调整（人工验证后）**：伤害飘字从珊瑚红 #d95f59 改为鲜红 #ff5252（与血条色区分），治疗保持亮绿 #6fd96f；palette 新增 `float_damage: #ff5252`。

## 4. presenter / assembly 集成

- [x] 4.1 `view/presenter.ts`：持有投影器 cursor 与动画器实例；每帧 `render()` 后调用 `projectHitFeedbackEvents` 取增量 → `animator.play` → `animator.step()`；`restart` 时重置 cursor 并清空进行中动画（`effectAnimator.reset`）。
- [x] 4.2 `assembly.ts`：装配动画器（节点解析器复用 `viewModel.node`，时间源为模拟时钟 `clock.now()` 供测试确定性推进）；`AutoBattleFixture` 暴露 `effects` 钩子（`project` 投影函数 + `animator` 动画器实例）。
- [x] 4.3 `smoke.ts`：冒烟接入特效投影断言（`hit-feedback` 步骤：完整对局后验证投影器产出 damage/heal-float 与 hit-flash）；动画节点驱动由运行时 presenter 节拍循环负责，冒烟只验证投影语义。**配合项**：`DynamicComponentViewHandle` 支持映射数组 + `activeIds`；`unit-node-mapping.ts` 新增 `AUTO_BATTLE_FX_NODE_MAPPING` 与聚合数组 `AUTO_BATTLE_DYNAMIC_NODE_MAPPINGS`；`entry.ts` / `GameLobbyHostImpl.ts` / `smoke-proxy.ts` 改用映射数组。

## 5. FGUI：特效节点与像素资源（委派 fgui-designer）

- [x] 5.1 委派 fgui-designer：AutoBattle 包新建 `UnitHitFeedbackCom.xml`（组件 id `ab004`，140×110，内含 `fx_float` UBB 文本节点 + `fx_flash` image 遮罩，alpha 初始 0）；闪白像素图 `hit_flash_white.png`（id `fx000`，1×1 白，`bun run fgui sprite` 生成）；palette 新增治疗绿 `float_heal: #6fd96f`；`AutoBattleView.xml` 新增 `container_effects` 容器；`bun run fgui validate --strict` 通过（跨包 Common 引用 warning 为既有正常现象）。
- [x] 5.2 在 FGUI 编辑器重新发布 `AutoBattle` 包，`fgui check-publish` 核对产物与源一致（不提交陈旧 bin）。**已人工在编辑器执行发布并核对通过**。

## 6. 测试

- [x] 6.1 投影器测试（`tests/framework/foundation/game-auto-battle-hit-feedback.test.ts`）：`attack`/`skill-damage` → damage-float + hit-flash；`skill-heal` → heal-float；`unit-dead` 忽略；cursor 增量消费幂等；事件序列确定性（同输入同特效意图）。
- [x] 6.2 动画器测试：飘字/闪白在注入时间源推进下 alpha/xy 中间态正确；动画结束 alpha=0、坐标归位、`active()` 清空；飘字 UBB 颜色伤害/治疗区分；同单位新特效覆盖旧动画；节点未实现 `setAlpha` 跳过不中断；`reset` 清空并回终态。
- [x] 6.3 集成断言：fixture `effects.project` 从真实战斗事件产出特效意图；动态解析器多映射测试（FX 节点走第二套映射进独立容器、prune 随 unit 生命周期回收）；`bun test` 全绿、typecheck 通过。

## 7. 集成验证与回归

- [x] 7.1 `bun test` 全绿（1165 pass / 0 fail）：投影器/动画器 + 既有战斗/编队/渲染/动态解析器测试无回归；`bun run typecheck` / `bun run lint` / `bun run test:foundation:types` 通过。
- [x] 7.2 `?smoke=auto-battle` 冒烟驱动完整对局到终局，确认飘字/闪白/抖动出现且终局结果不变；截图 + visual-verifier（mode=fgui）核对特效节点渲染与终态回位。**已人工在 Cocos 编辑器预览验证通过**（含飘字颜色调整后的视觉确认）。
- [x] 7.3 注释一致性：涉及文件（framework 契约/view/assembly/smoke）注释同步，无陈旧"纯 state 渲染"表述残留；`game-auto-battle-fixture.test.ts` 模块清单断言更新为七类模块（含 effects）。

## 8. ADR 检查

- [x] 8.1 ADR 检查：本 change 落地"事件投影（event projection）表现层 + `ViewModelNode.setAlpha?` 可选契约 + 动画器独立于渲染器 + 动态解析器多映射"，即 roadmap 预判的 ADR-027 决策点——已创建 `doc/decisions/ADR-027-event-driven-presentation.md`（含 move/teleport 事件为一等公民的 08 前瞻说明与 ADR-025 修订预告）。
