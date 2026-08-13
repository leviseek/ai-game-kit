# 字符串归口与资源常量表 设计

日期：2026-08-11
状态：Approved（用户已确认设计）

## 背景与目标

AI 编码过程中代码里出现大量裸字符串字面量（事件名、FGUI 资源 URL、节点名、状态名、场景名等），缺少枚举/常量归口。风险按严重度排序：

1. **静默断裂**：事件名、FGUI 资源 id、UI 节点名拼错一个字符不报编译错误，只在运行时静默不触发/不显示，调试成本远高于写常量的成本。
2. **外部契约失同步**：`ui://cmn00001com03` 等 URL 与 FGUI 源 XML 耦合，源 XML 变更后裸字符串即断。
3. **散落重复、改名爆炸**：同一字符串在多处散落，改名要 grep 全文。
4. **类型系统退化**：`EventMap` 用字符串索引签名时，裸字符串让 `keyof` 约束形同虚设。

根因：项目约束未把「先查常量表」固化为硬规则，基础设施（fgui CLI）能生成资源清单但未产出可引用常量，AI 无约束时天然走最短路径写裸字符串。

目标：通过「规则 + 工具链 + 渐进迁移」三条腿，让裸字符串在类型上与约定上无路可走。

## 现状与根因

- `assets/samples/game_auto_battle/view/unit-node-mapping.ts`：2 个裸 URL（`ui://cmn00001com03`、`ui://abpk0001ab004`）+ 8 个裸节点名（`container_units`、`txt_name` 等）。
- `tests/framework/foundation/scoped-event-channel.test.ts`：同一 `"scoreChanged"` 裸字符串出现 10+ 次。
- `tools/fgui/lib/fgui.ts`：已有 `listPackages`/`readPackage` 可解析工程全部包资源清单；`tools/fgui/cli.ts` 是 bun CLI 命令分发器。
- `.ai/instructions.md` 现有 14 条编号硬规则；`AGENTS.md` 有「FGUI 工作流」节。
- `assets/` 下无 constants 目录，也无 `ui/generated/` 生成产物。

## 关键决策（已确认）

### D1 规则边界：三问判定

命中任一「三问」的字符串必须进常量表，否则允许裸写（避免过度工程）：

1. **跨模块共享**（存在第二个消费方）
2. **耦合外部契约**（FGUI 资源 URL、组件名、节点名、bundle 名、存储 key）
3. **拼错会静默断裂**（事件名、状态名、资源 id）

### D2 非 FGUI 字符串：模块内 `constants.ts`，随用随建

- 事件名/状态名/场景名等定义在所属模块目录下的 `constants.ts`。
- 模式：`const X = {...} as const` + `type X = (typeof X)[keyof typeof X]` 双导出（值 + 类型合一）。
- 升级时机：出现第二个消费方时进表。

### D3 生成脚本承载：`bun run fgui gen-constants` 新命令

- 复用 `lib/fgui.ts` 的 `listPackages`/`readPackage`，解析工程全部包。
- 只生成 `exported="true"` 的组件（含 Common 包，供业务包跨包引用）。
- 常量命名：`Ui<包名PascalCase><资源名PascalCase>`（带包名便于分辨来源包；跨包引用一眼可识别误引）。
- 常量值：名字格式 `ui://<包名>/<资源名>`（如 `ui://AutoBattle/UnitHitFeedbackCom`，去 `.xml`），便于人读识别；**禁用短 id 裸写** `ui://<pkgId><resId>`。运行时 `getItemByURL` 对含 `/` 的 URL 走包名+资源名解析（`fairygui.mjs` 5188 行），两种格式均受支持。
- 产物：每包一文件 `assets/ui/generated/ui-<小写包名>.ts`，**不生成 index.ts**，各包文件独立 import。
- 幂等：可重复跑，资源按 id 确定性排序，diff 干净。

### D4 自动化强制：规则 + review + validate 提示（不搞 eslint 硬拦截）

- `fgui validate` 新增 TS 裸 URL 扫描（扫 `assets/` 与 `tests/` 下所有 `.ts`）：
    - 名字格式匹配到已生成常量 → `warning`（建议改用常量）
    - 名字格式对应不到任何常量 → `error`（未登记 URL，检查资源名或先重跑 gen-constants）
    - 短 id 格式裸写 → `warning`（原则禁用，改用名字格式常量）
- 不引入 eslint 自定义规则（成本高、易误报）。
- FGUI 源 XML（src/defaultItem/跨包引用）内仍是短 id——引擎/编辑器规范，不在禁用范围。

## 具体改动清单

### 规则文案

- `AGENTS.md`「FGUI 工作流」节追加「字符串归口」小节（见下）。
- `.ai/instructions.md` 追加第 15 条。

**AGENTS.md 追加文案**：

> **字符串归口**：新增事件名、状态名、FGUI 资源 URL / 节点名 / 动画名、bundle 名等字符串前，必须先搜索已有常量表与类型联合（`ui/generated/`、模块内 `constants.ts`、既有 `EventMap`/状态联合类型）。命中「三问」任一必须进常量表，否则禁止裸写：
>
> - 跨模块共享（存在第二个消费方）
> - 耦合外部契约（FGUI 资源 URL、组件名、节点名、bundle 名、存储 key）
> - 拼错会静默断裂（事件名、状态名、资源 id）
>
> FGUI 资源 URL 一律引用 `ui/generated/` 生成产物；事件/状态等模块内常量用 `const X = {...} as const` + 联合类型双导出。

**`.ai/instructions.md` 追加第 15 条**：

> 15. 字符串归口：命中三问（跨模块共享 / 耦合外部契约 / 拼错静默）的字符串必须进常量表，禁止在消费点裸写。FGUI 资源 URL 引用 `ui/generated/` 产物；其余用模块内 `constants.ts`（`as const` 对象 + 联合类型双导出）。新字符串先搜已有表，存在则复用。

### `bun run fgui gen-constants` 命令

- `tools/fgui/commands/gen-constants.ts`：解析全包 exported 组件，生成 `assets/ui/generated/ui-<pkg>.ts`。
- 产物示例：

```ts
// assets/ui/generated/ui-common.ts
// 由 `bun run fgui gen-constants` 生成，禁止手改；源 XML 变更后重跑刷新。
export const UiCommonUnitSlot = "ui://Common/UnitSlot";
// ...
```

- `tools/fgui/cli.ts` 注册命令。

### `fgui validate` 扩展 TS 扫描

- `tools/fgui/lib/scan-ts.ts`（或并入现有 lib）：轻量正则提取 TS 中 `"ui://..."`/`'ui://...'`/模板串，与 `ui/generated/*.ts` 常量值映射比对。
- `tools/fgui/commands/validate.ts` 接入扫描逻辑（`assets/` + `tests/` 全扫，默认执行，无官方库豁免概念）。

### 存量迁移 P0a（本次交付内）

- 迁移 `unit-node-mapping.ts` 及其余 `assets/`/`tests/` 中裸 URL 引用点，改为 import `ui/generated/` 常量。
- P0b（事件名）/P1（节点名）样本量大，留待后续批次，本次不承诺。

## 边界与约束

- 不引入第三方依赖（纯 stdlib）；不动 FGUI 源 XML；不手改发布产物。
- 单文件内部一次性字符串不治理（三问判定）。
- `ui/generated/` 提交到 git（是 TS 源码产物，非 .objs）。
- 生成命令不改 package.xml、不写 FGUI 编辑器状态，纯读源、纯写 TS。

## 测试与验证方式

- `tools/fgui/test/gen-constants.test.ts`：给定临时工程（多包、exported/非 exported、子目录组件），断言文件名、常量命名、确定性、幂等性。
- `tools/fgui/test/scan-ts.test.ts`：匹配/不匹配已生成常量分别产出 warning/error；`tests/` 也在扫描范围。
- `bun run fgui validate --strict` 全包通过。
- `bun test ./tools/fgui/test` 通过。
- `bun run typecheck` 通过。
- `rg "ui://" assets tests` 仅剩 `ui/generated/` 产物。

## 风险与回退

- **gen-constants 与源 XML 失同步**：源 XML 变更后未重跑命令，常量过期。缓解：validate 扫描会以 error 兜底（未登记 URL 或值变更时对不上），规则文案强制"改源后重跑"。
- **正则扫描误报**：TS 里模板串/注释中的 `ui://` 可能误报。缓解：仅扫字符串字面量形态，注释与标识符排除；扫描级别为提示不阻断流程。
- **迁移面扩散**：P0a 迁移中发现大量隐藏裸 URL 引用。缓解：按 validate 扫描输出精确列出引用点，逐个迁移，不扩大范围。
