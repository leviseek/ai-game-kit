## 1. 时钟倍率语义

- [x] 1.1 `logic/clock.ts`：`AutoBattleClock` 增加 `timeScale` getter 与 `setTimeScale(rate)`（校验有限正数，非法值抛错），`advance(ms)` 按当前倍率推进 `ms * timeScale`；更新接口与注释（简体中文）
- [x] 1.2 既有调用不回归：默认 `timeScale=1` 时 `advance` 行为与现状一致（增量测试锁定）

## 2. VM/绑定与命令

- [x] 2.1 `view/view.ts`：新增 `AutoBattleSpeed = 1 | 2 | 3` 类型；`AutoBattleViewModel` 增加只读 `speed` 字段；`AutoBattleCommands` 增加 `cycleSpeed()`；绑定声明增加 `txt_speed` 状态文本（`x1`/`x2`/`x3`）与 `btn_speed` 命令绑定
- [x] 2.2 更新 fixture 测试支撑类型（`tests/framework/support/auto-battle-fixture.ts`）以对齐新增字段与命令

## 3. 挡位驱动与装配

- [x] 3.1 `view/presenter.ts`：持有挡位状态，interval 内按挡位推进 `advance` 量（`delta * rate`）并循环 `tick`（rate 次）；命令 `cycleSpeed` 更新挡位、调用 `clock.setTimeScale` 并重渲染
- [x] 3.2 `assembly.ts`：夹具暴露 `speed` 状态与 `cycleSpeed`（测试驱动），命令注入 `cycleSpeed` 接线到 `clock.setTimeScale`
- [x] 3.3 `smoke.ts`：冒烟增加挡位切换 + 状态显示断言，并断言切换挡位后驱动到终局结果不变

## 4. FGUI 节点

- [x] 4.1 委派 fgui-designer 在 `AutoBattleView.xml` 增加 `txt_speed`（挡位状态文本）与 `btn_speed`（循环切换按钮，复用 `CommonButton`）节点，位置不干扰既有布局
- [x] 4.2 运行 `bun run fgui validate --strict` 全量校验通过；在 FGUI 编辑器重新发布 `AutoBattle` 包并经 `fgui check-publish` 核对

## 5. 确定性测试与回归

- [x] 5.1 新增测试：`timeScale` 推进语义（2x/3x 下 `advance` 按倍率推进）、挡位循环切换（1x→2x→3x→1x）、`txt_speed` 状态文本更新
- [x] 5.2 新增确定性测试：同一配置分别以 1x/2x/3x（不同 `timeScale` 时钟 + 相同 tick 序列）驱动到终局，断言除 `time` 外的事件序列与终局结果完全一致
- [x] 5.3 运行自动战斗相关 `bun test` 用例确认 `logic/`、数据模型、既有绑定无回归；`?smoke=auto-battle` 冒烟在 Cocos 预览中人工/CI 验证（本地无法 headless 运行，代码已编译通过）

## 6. 收尾

- [x] 6.1 确认 `logic/battle.ts`、`logic/skills.ts`、`logic/formation.ts`、`logic/config.ts`、`models/models.ts`（除新增挡位类型外）零改动；注释与代码同步
- [x] 6.2 ADR 检查：本 change 为观战加速的局部实现决策（timeScale 倍率语义 vs presenter 节流换算、循环按钮交互），roadmap 已明确此类属于 change 内记录决策依据、无需单独 ADR；明确记录无需新增 ADR
