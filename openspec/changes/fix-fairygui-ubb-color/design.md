## Context

`third-party/fairygui/source/src/GTextField.ts`（fork 仓库，ccc3.0）当前 `updateText()`：

```ts
protected updateText(): void {
    var text2: string = this._text;
    if (this._templateVars)
        text2 = this.parseTemplate(text2);
    if (this._ubbEnabled) //不支持同一文本不同样式
        text2 = defaultParser.parse(text2, true);
    this._label.string = text2;
}
```

`defaultParser.parse(text2, true)`：`remove=true` 时 handler 的返回（`<color=#ff5252>`）被丢弃，`lastColor` 在 `onTag_COLOR` 中被赋值（`this.lastColor = attr`）。官方 `parse()` 开头重置 `lastColor = null` / `lastSize = null`。UBBParser 是全局单例（`defaultParser`）。

`assignFontColor(label, value)` 已存在（处理 BitmapFont 不可染色转白、grayed 灰化），`this._color` 是 GTextField 默认文本色。本修复只需在 `updateText()` 中消费 `lastColor`。见 proposal.md - Why（第三方库缺陷修复，skip_specs）。

## Goals / Non-Goals

**Goals:**
- UBB 且含 `[color]` / `[size]` 标签的 GTextField 在 Cocos 普通 Label 上渲染出标签色与字号。
- 无 UBB / 无对应标签的文本颜色与字号不变（回退 `this._color` / `this._fontSize`）。
- 修复落在 fork 仓库源码，构建产物经既有 `build:fairygui` 链路同步。

**Non-Goals:**
- 不做"同一文本多段不同样式"（RichText 切换）——源码注释明确"不支持同一文本不同样式"，本项目飘字是整段单色，`lastColor` 单色语义等价；多段样式走 GRichTextField（见边界说明），留待未来需要时评估。
- 不修 `[b]`/`[i]`/`[u]`/`[img]`/`[url]` 在 GTextField 下的表现（设计使然：Cocos Label 无富文本渲染，剥标签是正确行为；图片/链接/多段样式走 GRichTextField，`[url]` 链接不可点是既有缺口本次不修）。
- 不改项目代码 / spec 契约 / import-map。

## Decisions

### 决策 1：`updateText()` 内消费 `lastColor` 与 `lastSize`，无标签回退默认值

`updateText()` 在 `parse` 之后（对齐 GTextInput 官方参考实现 `GTextInput.ts:57-70`）：

```ts
if (this._ubbEnabled) {
    text2 = defaultParser.parse(text2, true);
    if (defaultParser.lastColor)
        this.assignFontColor(this._label, new Color().fromHEX(defaultParser.lastColor));
    else
        this.assignFontColor(this._label, this._color);
    if (defaultParser.lastSize)
        this._label.fontSize = parseInt(defaultParser.lastSize);
    else
        this._label.fontSize = this._fontSize;
}
```

- **color 消费**：`new Color().fromHEX(lastColor)`，`lastColor` 含 `#` 前缀（Cocos 3.8 `Color.fromHEX` 接受 `#`，GTextInput:61 官方先例高置信；实现时冒烟兜底确认）。
- **size 消费**：`parseInt(lastSize)` → `_label.fontSize`（对齐 GTextInput:68 参考实现）。
- **不改 `_fontSize` / `_color` 状态**：直接改渲染层 `_label.fontSize` 与 `assignFontColor(label, ...)`，避免污染 GTextField 状态字段（`fontSize` setter 有 `!=` 去重、`set color` 触发 gear4）——`updateText` 会被 `text`/`ubbEnabled`/`flushVars` 多次触发，无 else 回退则前一次标签样式会残留到后续无标签文本。
- **BitmapFont 场景**：`assignFontColor` 内部已处理不可染色转白；size 对不可缩放位图字体无意义，改字号由 `updateFontSize` 既有逻辑（resizable 判断）决定——本修复直接写 `_label.fontSize`，位图字体场景视觉以冒烟确认为准。
- 只在 UBB 分支内消费：非 UBB 文本走既有 `updateFontColor`（`this._color`）与 `updateFontSize`（`this._fontSize`），不受影响。

理由：`lastColor`/`lastSize` 是官方已存在但 GTextField 未消费的字段（GTextInput 已消费），同文件同函数一并修，一次构建链路解决两类同类缺陷；避免只修 color 后 size 再走一遍 fork 构建 + 产物同步 + 冒烟。备选（Label↔RichText 切换）回归面大、当前不需要。

### 决策 2：不重置 `defaultParser.lastColor`/`lastSize` 前不做特殊处理（官方已重置）

官方 `parse()` 开头 `this.lastColor = null` / `this.lastSize = null`（`UBBParser.ts:122-123`），每次解析先清零。故本修复读到的值只反映当前文本的最后一个标签，无跨文本单例泄漏。

理由：ai-sensei 审查时提示过"单例陷阱"，但已核实官方 `parse()` 自带重置，本修复无需额外处理；在 tasks 中记录该核实结论。

### 决策 3：构建链路与提交边界

- **fork 仓库**：改 `source/src/GTextField.ts` → 子模块内 `npm install && npm run build`（官方 gulp，产出 `source/dist/fairygui.mjs` 等）→ 提交 fork 仓库（源码 + dist 一起）。
- **主仓库**：`bun run build:fairygui` 同步产物到 `assets/framework/libs/fairygui/` → 提交主仓库（产物目录内容变化 + `.meta` 不动）；主仓库 submodule 指针 bump 到新 fork commit。
- 顺序：先 fork 仓库提交（含 dist），再主仓库同步产物 + bump 指针。

理由：fork 仓库是源码 + dist 的单一真源；主仓库只记录指针与同步产物，符合 ADR-028 约定。

### 决策 4：GTextField 单色/单样式与 GRichTextField 多段样式的边界

明确两条渲染路径的适用边界（写进 fork 源码注释与 design，防止未来误用）：

- **GTextField（普通 Cocos Label）**：UBB 解析剥标签（`remove=true`），`[color]`/`[size]` 应用为**整段单色/单字号**（最后一个标签染/缩整段）；`[b]`/`[i]`/`[u]`/`[img]`/`[url]` 在 Label 下剥掉不渲染（无富文本能力）。适合单色短文本（如命中飘字）。
- **GRichTextField（Cocos RichText）**：`parse()` 不带 `remove`，保留 `<color>`/`<size>`/`<u>` 等富文本标签由 RichText 渲染，支持多段样式与图片。**`[url]` 链接当前不可点击**（`<on>` 非 Cocos 标签 + `handleTouchEvent=false`，既有缺口，本次不修）。
- 边界结论：单色/单样式用 GTextField；多段样式/图片/链接用 GRichTextField。本项目飘字整段包裹 `[color]`（`effect-animator.ts`），走 GTextField 路径即可。

理由：GTextField 的 `lastColor`/`lastSize` 单值语义与"整段单样式"天然匹配；明确边界避免未来用 GTextField 做富文本而踩坑。

## Risks / Trade-offs

- [Color.fromHEX 对 `#` 前缀兼容性] → GTextInput:61 官方先例高置信接受 `#`；实现时用 Cocos 预览冒烟兜底（task 4.2）。
- [BitmapFont 不可染色/不可缩放场景] → `assignFontColor` 已处理转白；size 对位图字体以冒烟视觉确认为准。
- [lastSize 消费的 lineHeight 不同步] → 对齐 GTextInput 参考实现只改 fontSize；若多行文本行高偏差明显，冒烟确认后同步 `_label.lineHeight`（记录在 tasks）。
- [影响既有 UBB 文本] → 仅含 `[color]`/`[size]` 标签的文本变色/变字号；无标签回退 `this._color`/`this._fontSize`；冒烟断言无 UBB 文本（血条/日志）不变。
- [fork 构建产物与主仓库产物漂移] → 按顺序（fork 提交 → 主仓库同步+bump），`build:fairygui` 输出 hash 摘要，提交前比对。
- [单例 lastColor/lastSize 泄漏（理论）] → 官方 parse 已重置，tasks 记录核实；若未来官方移除重置则需在 updateText 补 reset。

## Migration Plan

1. fork 仓库：改 `GTextField.ts`（color+size 消费）→ 子模块 `npm run build` → 验证 dist 含修复 → 提交 fork。
2. 主仓库：`bun run build:fairygui` → 产物 hash 变化符合预期 → 提交产物 + bump 子模块指针。
3. 验证：Cocos 预览飘字颜色/字号、无 UBB 文本不变、`bun test`/typecheck/lint 回归。

回滚：主仓库 revert 产物 + 指针提交；fork 仓库 revert GTextField 提交（dist 同步回退）。

## Open Questions

- fork 仓库 `npm run build`（gulp）在 Windows 是否开箱可用？（可能需 `npm install`；失败则改用手工同步 dist 对应段，记录替代路径。）
- lastSize 消费对多行文本 lineHeight 的视觉影响？（实现时冒烟确认；偏差明显则补 `_label.lineHeight` 同步。）

