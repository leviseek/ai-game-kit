## 1. 逻辑层：规模上限与槽位语义

- [x] 1.1 `logic/config.ts`：新增 `MAX_TEAM_SIZE = 6` 常量；`readTeam` 上限校验从固定 3 改为 `raw.length > MAX_TEAM_SIZE` 抛错（注释同步更新：MVP 固定槽位 → 逻辑槽位 0..N-1）。
- [x] 1.2 `models/models.ts`：`AutoBattleUnit.index` 注释更新为"队内逻辑槽位序号 0..N-1（实例化顺序与同排稳定次序身份）"，明确与 `position`（目标选择语义）的分工。
- [x] 1.3 逻辑层测试：新增 `1v1`/`5v5`/`6v6` 配置开战测试（`config` 解析 + `battle` 推进到终局）；超上限（7 单位/队）配置解析拒绝测试；既有 3v3 测试回归。
- [x] 1.4 更新既有超规模断言：`tests/framework/foundation/game-auto-battle-fixture.test.ts` 的超规模抛错测试（现向 ally/enemy 各注入 4 单位断言抛错，L135-159）改为注入 7 单位，同步注释（放开上限后 4 单位合法，原断言必红）。

## 2. framework 契约：坐标写入能力

- [x] 2.1 `assets/framework/contracts/ui/ViewModel.ts`：`ViewModelNode` 增加可选方法 `setXY?(x: number, y: number): void`；`Binding` 判别联合新增 `PositionBinding<VM>`（kind `"position"`，get 返回 `{ x: number; y: number }`），导出类型；`assets/framework/index.ts` 补充导出 `PositionBinding`。
- [x] 2.2 `assets/framework/core/ui/ViewModelRenderer.ts`：`applyBinding` 增加 `position` 分发，调用 `view.setXY?.(x, y)`；diff 用**结构比较**（对 `position` 绑定按 x/y 分量分别与上次值比较，避免对象字面量每次新引用导致 `Object.is` 恒 false 的重复写入），其余绑定仍走原值 diff；节点不支持 `setXY` 时忽略不中断；补 exhaustiveness 兜底（`position` 缺失时编译期提示）。
- [x] 2.3 framework 测试：`tests/framework/foundation/view-model-renderer.test.ts` 的 `RecordingNode` 增加 `xy` 记录字段与 `setXY` 实现；新增 `position` 绑定写入、相同坐标不重复写入、节点不支持时忽略、未实现 `setXY` 节点不中断测试；`public-boundary.test.ts` 契约清单同步更新（`ViewModelNode`/`PositionBinding`）。

## 3. FGUI adapter：节点坐标写入

- [x] 3.1 `assets/framework/adapters/cocos/ui/FairyGuiViewHandle.ts`：节点实现补 `setXY`（写 fgui `GObject.xy`），保持 fgui 类型只在 adapter 边界。
- [x] 3.2 冒烟/装配层：`assets/samples/game_auto_battle/smoke.ts` 支持按参数/URL 注入规模配置（默认 3v3，可注入 6v6），`assembly.ts` 的 `toViewModelNode` 如需暴露 `setXY` 记录则同步（随 4.x 渲染验证）。

## 4. view 层：slot→xy 映射表与动态绑定

- [x] 4.1 `view/view.ts`：新增 `slotToXY(side, slotIndex, teamSize)` 纯函数（敌左、己右映射，单队上限内返回稳定坐标）；导出供绑定与测试。**语义澄清**：`slotIndex` 为队内参数（0..N-1），`teamSize` 为单侧规模，两侧各自独立推导；渲染绑定节点名的全局索引 = side 偏移（己方 0、敌方 N） + 队内 `slotIndex`，避免 6v6 时敌我节点名冲突。
- [x] 4.2 `AutoBattleUnitView` 增加 `side` 字段（或 VM 暴露每侧数量）；动态槽位绑定：`createAutoBattleBindings` 从固定 `index < 6` 改为按 `MAX_TEAM_SIZE` 预置；单位组新增 `position` 绑定（节点 `unit_{全局索引}`，get 返回映射表坐标）与 `visible` 绑定（按单位是否存在显隐）；文本/进度绑定节点名约定不变。**规模边界**：首版支持对称规模（NvN）渲染，不对称配置（如 3v2）在两侧各自独立推导（各侧 teamSize 取自对应侧单位数），并留待 05 统一。
- [x] 4.3 view 层测试：映射表坐标断言（3v3/6v6 下己方右侧、敌方左侧）；VM/绑定 diff 覆盖规模变化。

## 5. FGUI：槽位预置与发布

- [x] 5.1 委派 fgui-designer：`AutoBattleView.xml` 每侧预置 6 槽（`unit_0..11` 共 12 槽组）并规划垂直排布（1280×720 内与日志区/按钮区协调），节点名沿用 `txt_unit_{全局索引}_*` / `bar_unit_{全局索引}_*`；**为 12 个槽组启用统一显示/隐藏**（确保超规模槽位整组联动隐藏，组内 txt/bar 子元素一并隐藏）；新槽位对象 id（`ab_unit_6..11` 等）按续编规范处理；产出后 `bun run fgui validate --strict` 通过。
- [x] 5.2 在 FGUI 编辑器重新发布 `AutoBattle` 包，`fgui check-publish` 核对产物与源一致（不提交陈旧 bin）。

## 6. 集成验证与回归

- [x] 6.1 `bun test` 全绿：logic（1v1/5v5/6v6/超上限）、framework（position 绑定）、view（映射表/显隐）无回归。
- [x] 6.2 `?smoke=auto-battle` 冒烟驱动 3v3 与 6v6 对局到终局（经 3.2 注入），确认渲染/槽位显隐正确；截图 + visual-verifier（mode=fgui）核对敌左我右、槽位排布与超规模槽位整体隐藏。
- [x] 6.3 注释一致性：确认本 change 涉及文件（logic/models/view/assembly）注释同步，无陈旧"固定 3v3/MVP 固定 6 槽位"表述残留；`tests/framework/support/auto-battle-fixture.ts` 镜像类型的 `index` 注释（"队内阵列序号 0-2"）同步更新为 0..N-1。

## 7. ADR 落档与检查

- [x] 7.1 创建 `doc/decisions/ADR-025-coordinate-battle-unit-model.md`：记录坐标式战斗单元模型决策（`position` 保留为目标选择语义、`side+index` 逻辑槽位、slot→xy 单向映射、`setXY` 可选契约），状态 Accepted。
- [x] 7.2 ADR 检查：确认本 change 其余决策（上限常量位置、字段不改名、槽位预置策略）均属实现期局部决策，无需单独 ADR；若发现新架构决策则补档。
