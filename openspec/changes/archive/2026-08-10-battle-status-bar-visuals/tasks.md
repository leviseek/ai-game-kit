## 1. 样式准备（fgui-designer + CLI 通道）

- [x] 1.1 委派 fgui-designer 评估血条/能量条区分方案：确认采用 Common 包内样式变体（如 `CommonBarHp.xml`）还是就地换 fill 资源，输出设计结论
- [x] 1.2 如需新增 fill 色：先将其加入 `ui/demo/palette.json`（如 `fill_hp`），再以 `bun run fgui sprite` 生成像素图并登记（`next-id --prefix` 续编），确认颜色 ⊆ 调色板允许集合
- [x] 1.3 产出 Common 包样式变体（若采用变体方案），保持 `extention="ProgressBar"` 语义，fill 使用血条暖色/能量条蓝色区分，必要时辅以尺寸/标签差异
- [x] 1.4 修改 `AutoBattleView.xml`：血条 `bar_unit_{n}_hp` 与能量条 `bar_unit_{n}_energy` 引用可区分的样式/资源，节点名与槽位序不变

## 2. 校验与发布

- [x] 2.1 运行 `bun run fgui validate --strict` 全量校验（含跨包引用、资源 id 续编冲突、fileName 一致、样式变体引用完整性），确保通过
- [x] 2.2 在 FGUI 编辑器中重新发布 `Common` 与 `AutoBattle` 包，经 `fgui check-publish` 三重证据核对源 XML 与产物一致（编辑器发布、产物 mtime、validate 通过）

## 3. 验证回归

- [x] 3.1 运行 `?smoke=auto-battle` 冒烟，确认页面可打开、节点名对齐校验通过、可驱动完整对局到终局
- [x] 3.2 截图战场页，委派 visual-verifier（mode=fgui）核对血条与能量条视觉可区分（颜色/尺寸/标签至少一项不同）且敌左我右布局与单位文本完整
- [x] 3.3 运行相关既有测试（`bun test` 自动战斗相关用例），确认逻辑层、数据模型与绑定无回归

## 4. 收尾

- [x] 4.1 确认 `logic/`、`models/`、`view/view.ts` 绑定声明零改动（或仅对齐），冒烟与测试全部通过
- [x] 4.2 ADR 检查：本 change 为纯状态条视觉表现改动，无新增架构决策（进度条样式变体/调色板扩展属于局部决策），明确记录无需新增 ADR
