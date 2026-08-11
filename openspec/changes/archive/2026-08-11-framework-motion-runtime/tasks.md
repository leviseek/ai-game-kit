## 1. core/time：GameClock 与 PauseDomain

- [x] 1.1 `assets/framework/core/time/GameClock.ts`（新）：`PauseDomain` 枚举（`menu`/`combat`）；`GameClock implements TimeSource`——`now(domain?)`（per-domain elapsed，暂停域冻结、未暂停域推进，rate 含在推进）、`timeScale`/`setTimeScale(rate)`（有限正数校验，对齐 SimulationClock）、`pause(domain)`/`resume(domain)`（每域计数）、`advance(ms)`（只推进未冻结域，`ms * rate`）、`jumpTo(t)`（重置 baseTime）、`freezeAll()`/`thawAll()`（应用级暂停=全部域冻结）；**menu 暂停不冻结 combat**。注释中文说明 per-domain elapsed 模型与层级语义。
- [x] 1.2 测试 `tests/framework/foundation/game-clock.test.ts`（新）：rate 缩放推进（rate=2 advance 100 → now 增 200）；menu 暂停不冻结 combat；combat 暂停冻结 combat；freezeAll 冻结全部、thawAll 恢复；jumpTo 显式跳跃；非法 rate（0/负/NaN）拒绝；resume 只解除本域 pause。

## 2. contracts/time：MotionTween 契约

- [x] 2.1 `assets/framework/contracts/time/MotionTween.ts`（新）：`MotionTweenOptions`——`timeSource: TimeSource` 必填（注释：禁默认 Date.now，测试注入可控源）、`domain?: PauseDomain`（默认 Combat）、`durationMs`、`onStep(progress, now)`、`onComplete?`；注释说明动画器零感知（只读 now(domain)，不自行乘 rate/判跳变）。
- [x] 2.2 契约类型检查：`tests/framework/foundation/contracts.typecheck.ts` 或对应契约断言文件确认 MotionTween 类型可用（如适用）。

## 3. framework 导出与白名单

- [x] 3.1 `assets/framework/index.ts`：导出 `GameClock` / `PauseDomain` / `MotionTween`（及 `MotionTweenOptions`）。
- [x] 3.2 `tests/framework/foundation/public-boundary.test.ts`：`expectedRootExports` 白名单同步新增上述导出（负向测试锁定，漏更即红）。

## 4. 动画接入 GameClock

- [x] 4.1 `assets/samples/game_auto_battle/view/presenter.ts`：创建 `GameClock`（rate 初始 1）注入动画器与挡位；`cycleSpeed` → `gameClock.setTimeScale(speed)`；每帧 `delta = gameClock.now() - lastGameNow` 驱动 `autoBattle.clock.advance(delta)`（替代每 interval 推多次）。
- [x] 4.2 `view/effect-animator.ts` / `view/vs-entrance.ts`：timeSource 改为注入 GameClock（presenter 传 `() => gameClock.now()`，测试传自增源）；动画器逻辑零改动（仅换注入源）。
- [x] 4.3 既有动画器测试回归：`game-auto-battle-hit-feedback.test.ts` / `vs-entrance.test.ts` / `presenter.test.ts` 换注入源后全量通过（测试用自增源，不依赖真实时钟）。

## 5. ADR 与约束

- [x] 5.1 创建 `doc/decisions/ADR-029-global-time-control-animation-time-source.md`：状态 Accepted，含背景、决策 C-01~C-20（本 change 落地：三时间域、GameClock 形态、分层 pause、动画跟 rate、动画器零感知、不引入引擎桥）、理由、影响、spike 项。
- [x] 5.2 AGENTS.md / `.ai/instructions.md`：补充"动画优先用 framework 动画 API 与 GameClock；游戏层禁直接 import cc 做 tween；FGUI 禁 transition 不变"（AGENTS 既有第 10 条 FGUI 约束附近）。

## 6. 集成验证与回归

- [x] 6.1 `bun test` 全绿（含新增 game-clock 测试与既有动画器回归）；`bun run typecheck` / `typecheck:ci` / `lint` / `test:foundation:types` 通过。
- [x] 6.2 `public-boundary.test.ts` 通过（新导出白名单已同步）。
- [x] 6.3 注释一致性：涉及文件（core/time/contracts/view/presenter）注释中文同步，无"Date.now 散落驱动"陈旧表述残留。

## 7. ADR 检查

- [x] 7.1 ADR 检查：本 change 即 ADR-029 落地（决策 5.1 已创建）；确认无其它新架构决策需独立 ADR（GameClock 内部实现细节、MAX_DECOR_RATE 默认值属实现期决策，记录即可）。

