## 1. fork 仓库源码修复

- [x] 1.1 核实 Cocos `Color.fromHEX` 对 `#` 前缀的兼容性：**已核实** Cocos 3.8.8 `color.ts:153/522` `hex = hex[0] === '#' ? hex.substring(1) : hex` 显式处理 `#` 前缀，直接传 `#ff5252` 兼容。
- [x] 1.2 修改 `third-party/fairygui/source/src/GTextField.ts` 的 `updateText()`：UBB 分支解析后消费 `defaultParser.lastColor`/`lastSize`（对齐 GTextInput:57-70 参考实现）；**不改 `_fontSize`/`_color` 状态字段**；注释为英文（fork 第三方库，规避官方文件 GBK/UTF-8 混合编码问题）。
- [x] 1.3 核对官方 `parse()` 已重置 `lastColor`/`lastSize = null`（`UBBParser.ts:122-123`，无单例泄漏）。

## 2. fork 仓库构建与提交

- [x] 2.1 构建尝试：`npm install` 后 `npm run build`（gulp）在 node v24 下解析出 typescript 7.x 导致 `convertCompilerOptionsFromJson is not a function` 失败；装 `typescript@4.9.5` 构建成功，但**产生 d.ts 引用漂移（`../lib/cc.d.ts` → `../cc`）与全文件格式漂移**。为保持最小 diff，**放弃 gulp 重建，改手工同步 dist 的 updateText 段**（mjs 可读版 + min 压缩版各一处），diff 仅 27 insertions/3 deletions，d.ts 未动（类型声明不变）。
- [x] 2.2 提交 fork 仓库（源码 GTextField.ts + dist mjs/min.mjs 手工修复），commit `45c7d68`。

## 3. 主仓库产物同步与提交

- [x] 3.1 主仓库 `bun run build:fairygui`：产物 mjs/min.mjs 更新为含修复版本；`.meta` 不动；产物 hash 与 fork dist MATCH。
- [ ] 3.2 主仓库 submodule 指针 bump 到新 fork commit（45c7d68）；提交产物目录 + 指针。

## 4. 验证与回归

- [x] 4.1 `bun run test:foundation`（1007 pass）/ `bun run typecheck:ci` / `bun run lint` 回归通过（修复不触及项目代码，全绿）。
- [ ] 4.2 Cocos 预览 `?smoke=auto-battle`：飘字伤害红 `#ff5252`/治疗绿 `#6fd96f` 实际渲染；无 UBB 文本（血条数字/轮次/日志）颜色不变。**额外 size 冒烟验证**：构造含 `[size=24]` 的 UBB 文本确认字号变化、无标签回退默认字号；如多行文本 lineHeight 偏差明显，补 `_label.lineHeight` 同步。**需人工在 Cocos 编辑器验证**（含截图 visual-verifier 核对可选项）。
- [x] 4.3 确认既有"飘字 UBB 颜色区分"逻辑测试（`game-auto-battle-hit-feedback.test.ts` 断言文本含颜色标签）不受影响（标签语义未变，仅运行库渲染层修复）；foundation 全量回归通过。

## 5. ADR 检查

- [ ] 5.1 ADR 检查：UBB 单色/单字号修复为第三方库缺陷修复（消费官方已有但未用的 `lastColor`/`lastSize` 字段，对齐 GTextInput 官方先例），不引入新架构决策——ADR-028 已覆盖库托管链路；GTextField/GRichTextField 边界在 fork 源码注释与 design 记录，无需 ADR。本 change 记录"无需新 ADR，理由：库内既有字段消费，行为契约（FairyGUI UBB 标准）不变"。
