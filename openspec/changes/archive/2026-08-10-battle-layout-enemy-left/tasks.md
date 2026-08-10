## 1. 布局重构（fgui-designer）

- [x] 1.1 委派 fgui-designer 重构 `ui/demo/assets/AutoBattle/AutoBattleView.xml`：把敌方三列（unit_3/4/5）移到屏幕左半区、己方三列（unit_0/1/2）移到右半区，保留侧内纵向列排布，节点名与槽位序不变
- [x] 1.2 产出后运行 `bun run fgui validate --strict` 校验引用完整性与语义，确保通过（含跨包引用、controller/gear、节点名一致性）
- [x] 1.3 在 FGUI 编辑器中重新发布 `AutoBattle` 包，经 `fgui check-publish` 三重证据核对源 XML 与产物一致（编辑器发布、产物 mtime、validate 通过）

## 2. 验证回归

- [x] 2.1 运行 `?smoke=auto-battle` 冒烟，确认页面可打开、节点名对齐校验通过、可驱动完整对局到终局
- [x] 2.2 截图战场页，委派 visual-verifier（mode=fgui）核对布局为敌左我右（敌方在左、己方在右）且各单位文本/血条/能量条完整
- [x] 2.3 运行相关既有测试（`bun test` 自动战斗相关用例），确认逻辑层与绑定无回归

## 3. 收尾

- [x] 3.1 确认 `view/view.ts`、`logic/`、`models/` 零改动，冒烟与测试全部通过
- [x] 3.2 ADR 检查：本 change 为纯布局表现改动，无新增架构决策（坐标式模型/映射表已归入 change-04 的 ADR-025），明确记录无需新增 ADR
