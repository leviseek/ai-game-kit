## Why

FairyGUI Cocos 运行库的 `GTextField` 在启用 UBB 时，`defaultParser.parse(text2, true)` 会把 `[color=#ff5252]...[/color]` 标签**剥掉只留纯文本**再赋给 Cocos 普通 `Label.string`（`fairygui.mjs:6141-6143`）。UBBParser 的 `onTag_COLOR` 已把颜色写入 `lastColor`（5775 行），但 GTextField 从未消费它——导致 `[color]` 标签无法在运行库渲染出颜色。本项目 change-07 命中反馈特效的飘字用 UBB 颜色区分伤害红 `#ff5252`/治疗绿 `#6fd96f`，当前只在逻辑层正确、运行库实际渲染为单色。

修复位于 fork 仓库（`leviseek/FairyGUI-cocoscreator`）`source/src/GTextField.ts`，经 `npm run build` 产出 dist，再经 `bun run build:fairygui` 同步到项目产物目录。

## What Changes

- **fork 仓库** `source/src/GTextField.ts` 的 `updateText()`：UBB 解析后消费 `defaultParser.lastColor` 与 `defaultParser.lastSize`——解析出颜色则经 `assignFontColor` 设置 `_label.color`（兼容 BitmapFont 不可染色与 grayed 语义），否则回退 `this._color`；解析出字号则设置 `_label.fontSize`，否则回退 `this._fontSize`。
- 对齐 `GTextInput` 官方参考实现（`GTextInput.ts:57-70` 已消费 lastColor/lastSize）；官方 `parse()` 已在开头重置两者（无单例泄漏）。
- 同步构建：fork 仓库 `npm run build` 产出 `source/dist/fairygui.mjs`，主仓库 `bun run build:fairygui` 同步产物；两者一起提交（子仓库 + 主仓库产物目录）。
- **影响面**：仅 UBB 且含 `[color]`/`[size]` 标签的 GTextField 显示为标签色/字号；无 UBB/无标签的文本（血条数字、日志等）不变（回退默认值）。`[b]`/`[i]`/`[u]`/`[img]`/`[url]` 在普通 Label 下剥标签不渲染（设计使然，多段样式/图片/链接走 GRichTextField）。
- **不改变**：项目代码、import-map、spec 契约（`[color]`/`[size]` 是 FairyGUI UBB 标准语义，项目传参一直正确，纯运行库 bug 修复）。

## Capabilities

### New Capabilities

（无——第三方库缺陷修复，项目行为契约不变，`skip_specs: true`）

### Modified Capabilities

（无）

## Impact

- **fork 仓库** `third-party/fairygui/source/src/GTextField.ts`（`updateText` 消费 lastColor/lastSize）——提交到 fork 仓库独立历史。
- **fork 仓库** `source/dist/fairygui.mjs`（构建产物）——随 fork 仓库提交。
- **主仓库** `assets/framework/libs/fairygui/fairygui.mjs`（`bun run build:fairygui` 同步产物）——随主仓库提交；`.meta` GUID 不变。
- 验证：Cocos 预览 `?smoke=auto-battle` 确认飘字伤害红/治疗绿与 `[size]` 字号；无 UBB 文本颜色不变；`bun test` / typecheck / lint 回归。
