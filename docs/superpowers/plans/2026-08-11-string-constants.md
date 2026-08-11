# 字符串归口与资源常量表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过「规则文案 + `bun run fgui gen-constants` 生成命令 + `fgui validate` TS 裸 URL 扫描 + P0a 存量迁移」四条腿，让裸字符串（FGUI URL/事件名/状态名/节点名）在类型与约定上无路可走。

**Architecture:** 复用 `tools/fgui` 现有 CLI 骨架：`lib/fgui.ts` 提供 `listPackages`/`readPackage` 解析全部包，新增 `gen-constants` 命令生成 `assets/ui/generated/ui-<pkg>.ts` 常量表（`Ui<包名PascalCase><资源名PascalCase>`）；`lib/scan-ts.ts` 扫描 `assets/`+`tests/` 下 TS 的裸 `ui://` 字符串并与生成常量比对，`validate` 命令接入。规则文案写入 `AGENTS.md` 与 `.ai/instructions.md`。

**Tech Stack:** Bun、TypeScript（strict）、零第三方依赖（纯 stdlib）。

## Global Constraints

- 注释使用简体中文；标识符/API 名/错误消息字符串保持英文。
- 不引入第三方运行时依赖（仅 devDependency 工具链）。
- 新增文件 ≤300 行。
- 生成产物 `assets/ui/generated/` 提交 git（源 XML 变更后重跑 `gen-constants` 刷新）。
- 不动 FGUI 源 XML、不手改发布产物 bin。
- 提交信息格式：`option: 中文描述`（如 `feat(ui): ...`）。
- 每个系统必须有测试（`bun test ./tools/fgui/test`）。

---

### Task 1: 规则文案（AGENTS.md + .ai/instructions.md）

**Files:**
- Modify: `AGENTS.md`（FGUI 工作流节追加「字符串归口」小节）
- Modify: `.ai/instructions.md`（追加第 15 条）
- Test: 无（文档改动，人工确认）

**Interfaces:**
- Produces: AGENTS.md 的「字符串归口」约定，作为后续所有任务与后续批次（P0b/P1）的规范依据。

- [ ] **Step 1: 在 `AGENTS.md` 的「FGUI 工作流」节末尾追加「字符串归口」小节**

在 `AGENTS.md` 的 `## FGUI 工作流` 节最后一条 bullet 后追加：

```markdown
- **字符串归口**：新增事件名、状态名、FGUI 资源 URL / 节点名 / 动画名、bundle 名等字符串前，必须先搜索已有常量表与类型联合（`ui/generated/`、模块内 `constants.ts`、既有 `EventMap`/状态联合类型）。命中「三问」任一必须进常量表，否则禁止裸写：
  - 跨模块共享（存在第二个消费方）
  - 耦合外部契约（FGUI 资源 URL、组件名、节点名、bundle 名、存储 key）
  - 拼错会静默断裂（事件名、状态名、资源 id）
  FGUI 资源 URL 一律引用 `ui/generated/` 生成产物；事件/状态等模块内常量用 `const X = {...} as const` + 联合类型双导出。
```

- [ ] **Step 2: 在 `.ai/instructions.md` 末尾追加第 15 条**

在 `.ai/instructions.md` 第 14 条后追加：

```markdown
15. 字符串归口：命中三问（跨模块共享 / 耦合外部契约 / 拼错静默）的字符串必须进常量表，禁止在消费点裸写。FGUI 资源 URL 引用 `ui/generated/` 产物；其余用模块内 `constants.ts`（`as const` 对象 + 联合类型双导出）。新字符串先搜已有表，存在则复用。
```

- [ ] **Step 3: 提交**

```bash
git add AGENTS.md .ai/instructions.md
git commit -m "docs(dev): 字符串归口规则（三问判定/先查后建/禁止裸写）写入 AGENTS 与 instructions"
```

---

### Task 2: `gen-constants` 生成命令（lib + command + CLI 注册）

**Files:**
- Create: `tools/fgui/commands/gen-constants.ts`
- Modify: `tools/fgui/cli.ts`（注册命令）
- Test: `tools/fgui/test/gen-constants.test.ts`

**Interfaces:**
- Consumes: `lib/fgui.ts` 的 `locateProject`、`listPackages`、`readPackage`（已有，签名见 `fgui.ts:68/95/105`）。
- Produces: 导出函数 `generateConstants(project: FguiProject): Array<{ pkg: string; file: string; lines: string[] }>`，供 command 与测试复用。常量命名 `Ui<包名PascalCase><资源名PascalCase>`；只含 `exported="true"` 的 component。

- [ ] **Step 1: 写失败测试 `tools/fgui/test/gen-constants.test.ts`**

临时工程含两个包：
- `Demo` 包 id=`4q9x2uij`：`LobbyView.xml`（exported，id=`03gta`，根目录）、`SettingsPanel2.xml`（exported，id=`29kie`）
- `Common` 包 id=`cmn00001`：`UnitSlot.xml`（exported，id=`com03`）
- 另加一个非 exported 组件 `Hidden.xml` 与一个 image `bg.png`（断言不生成）

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateConstants } from "../commands/gen-constants";
import { locateProject } from "../lib/fgui";

function setupProject(): { dir: string } {
    const dir = mkdtempSync(join(tmpdir(), "fgui-gen-"));
    writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
    const setupPkg = (pkgName: string, pkgId: string, comps: Array<[string, string, boolean]>) => {
        const pkgDir = join(dir, "assets", pkgName);
        mkdirSync(pkgDir, { recursive: true });
        const resources = comps.map(([id, name, exported]) =>
            `<component id="${id}" name="${name}" path="/" exported="${exported}"/>`).join("");
        writeFileSync(join(pkgDir, "package.xml"),
            `<?xml version="1.0" encoding="utf-8"?>\n<packageDescription id="${pkgId}"><resources>${resources}<image id="bg00" name="bg.png" path="/img/"/></resources></packageDescription>`);
        for (const [, name] of comps) {
            writeFileSync(join(pkgDir, name), `<component size="1,1"><displayList/></component>`);
        }
        mkdirSync(join(pkgDir, "img"), { recursive: true });
        writeFileSync(join(pkgDir, "img", "bg.png"), "x");
    };
    setupPkg("Demo", "4q9x2uij", [["03gta", "LobbyView.xml", true], ["29kie", "SettingsPanel2.xml", true], ["hid00", "Hidden.xml", false]]);
    setupPkg("Common", "cmn00001", [["com03", "UnitSlot.xml", true]]);
    return { dir };
}

describe("generateConstants", () => {
    test("仅 exported 组件生成常量，命名 Ui<包名><资源名>，含跨包", () => {
        const { dir } = setupProject();
        try {
            const project = locateProject(dir);
            const out = generateConstants(project);
            const demo = out.find((o) => o.pkg === "Demo");
            const common = out.find((o) => o.pkg === "Common");
            expect(demo).toBeDefined();
            expect(common).toBeDefined();
            expect(demo!.lines).toContain('export const UiDemoLobbyView = "ui://4q9x2uij03gta";');
            expect(demo!.lines).toContain('export const UiDemoSettingsPanel2 = "ui://4q9x2uij29kie";');
            expect(common!.lines).toContain('export const UiCommonUnitSlot = "ui://cmn00001com03";');
            expect(demo!.lines.some((l) => l.includes("Hidden"))).toBe(false);
            expect(demo!.lines.some((l) => l.includes("bg"))).toBe(false);
            expect(out.length).toBe(2);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("确定性：同工程两次生成输出一致", () => {
        const { dir } = setupProject();
        try {
            const project = locateProject(dir);
            const a = generateConstants(project);
            const b = generateConstants(project);
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test ./tools/fgui/test/gen-constants.test.ts`
Expected: FAIL，报 `generateConstants` 未定义 / 模块不存在。

- [ ] **Step 3: 实现 `tools/fgui/commands/gen-constants.ts`**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flagString, hasHelp, parseArgs } from "../lib/args";
import { listPackages, locateProject, readPackage, type FguiProject } from "../lib/fgui";

export const help = "gen-constants —— 生成 FGUI exported 组件 URL 常量表到 assets/ui/generated/";

interface GeneratedFile {
    readonly pkg: string;
    readonly file: string;
    readonly lines: readonly string[];
}

/** 包名/资源名转 PascalCase：连接符与空白剔除，各段首字母大写。 */
function toPascalCase(name: string): string {
    return name
        .split(/[-_\s]+/)
        .filter((s) => s.length > 0)
        .map((s) => s[0]!.toUpperCase() + s.slice(1))
        .join("");
}

/** 解析工程全部包，生成每包一份 exported 组件常量清单（确定性：按包名/资源 id 排序）。 */
export function generateConstants(project: FguiProject): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    for (const pkgName of listPackages(project).sort()) {
        const pkg = readPackage(project, pkgName);
        const exported = pkg.resources
            .filter((r) => r.kind === "component" && r.exported)
            .sort((a, b) => a.id.localeCompare(b.id));
        if (exported.length === 0) continue;
        const lines: string[] = [];
        lines.push(`// 由 \`bun run fgui gen-constants\` 生成，禁止手改；源 XML 变更后重跑刷新。`);
        lines.push(`// 包: ${pkg.name} (id=${pkg.id})`);
        for (const r of exported) {
            const constantName = `Ui${toPascalCase(pkg.name)}${toPascalCase(r.name.replace(/\.xml$/i, ""))}`;
            const url = `ui://${pkg.id}${r.id}`;
            lines.push(`export const ${constantName} = "${url}";`);
        }
        const file = join(project.root, "assets", "ui", "generated", `ui-${pkg.name.toLowerCase()}.ts`);
        files.push({ pkg: pkg.name, file, lines });
    }
    return files;
}

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }
    const project = locateProject(flagString(parsed, "project"));
    const files = generateConstants(project);
    let written = 0;
    for (const f of files) {
        mkdirSync(join(project.root, "assets", "ui", "generated"), { recursive: true });
        writeFileSync(f.file, `${f.lines.join("\n")}\n`, "utf8");
        written++;
        console.log(`[fgui:gen-constants] 生成 ${f.pkg}: ${f.lines.length - 2} 个常量 → ${f.file}`);
    }
    console.log(`[fgui:gen-constants] 共生成 ${written} 个包常量文件`);
    return 0;
}
```

- [ ] **Step 4: 在 `tools/fgui/cli.ts` 注册命令**

`cli.ts` 顶部 import 后，在 `COMMANDS` 对象中加入：

```ts
    "gen-constants": {
        run: runGenConstants,
        usage: "gen-constants [--project <工程目录>] 生成 exported 组件 URL 常量表到 assets/ui/generated/",
    },
```

`import { run as runGenConstants } from "./commands/gen-constants";`

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test ./tools/fgui/test/gen-constants.test.ts`
Expected: PASS（2 个测试全过）。

- [ ] **Step 6: 提交**

```bash
git add tools/fgui/commands/gen-constants.ts tools/fgui/cli.ts tools/fgui/test/gen-constants.test.ts
git commit -m "feat(fgui): gen-constants 生成 exported 组件 URL 常量表（Ui<包名><资源名>）"
```

---

### Task 3: `fgui validate` 增加 TS 裸 URL 扫描

**Files:**
- Create: `tools/fgui/lib/scan-ts.ts`
- Modify: `tools/fgui/commands/validate.ts`
- Test: `tools/fgui/test/scan-ts.test.ts`

**Interfaces:**
- Consumes: `lib/fgui.ts` 的 `locateProject`；`commands/gen-constants.ts` 的 `generateConstants`（复用生成逻辑拿到常量表）。
- Produces: `scanTsRawUrls(project: FguiProject, constantFiles: readonly { file: string; lines: readonly string[] }[]): TsUrlIssue[]`；`TsUrlIssue = { file: string; line: number; severity: "warning" | "error"; message: string }`。`validate.ts` 接入后打印 `[warning]`/`[error]` 并影响 exit code。

- [ ] **Step 1: 写失败测试 `tools/fgui/test/scan-ts.test.ts`**

构造临时工程：`ui/generated/ui-common.ts` 含 `export const UiCommonUnitSlot = "ui://cmn00001com03";`；被测 TS 源码含匹配/不匹配/注释中的 URL。

```ts
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateProject, type FguiProject } from "../lib/fgui";
import { scanTsRawUrls } from "../lib/scan-ts";

function setupProject(): { dir: string } {
    const dir = mkdtempSync(join(tmpdir(), "fgui-scan-"));
    writeFileSync(join(dir, "demo.fairy"), `<?xml version="1.0" encoding="utf-8"?>\n<projectDescription id="t" type="CocosCreator" version="5.0"/>`);
    const genDir = join(dir, "assets", "ui", "generated");
    mkdirSync(genDir, { recursive: true });
    writeFileSync(join(genDir, "ui-common.ts"),
        `// 由 \`bun run fgui gen-constants\` 生成\n` +
        `export const UiCommonUnitSlot = "ui://cmn00001com03";\n`);
    const srcDir = join(dir, "assets", "samples");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "usage.ts"),
        `const a = "ui://cmn00001com03";\n` +        // 匹配生成常量 → warning
        `const b = "ui://cmn00001zzz99";\n` +        // 未登记 → error
        `// 注释里的 ui://cmn00001com03 不扫\n`);     // 注释应忽略
    return { dir };
}

describe("scanTsRawUrls", () => {
    test("匹配生成常量报 warning，未登记报 error，注释忽略", () => {
        const { dir } = setupProject();
        try {
            const project = locateProject(dir);
            const issues = scanTsRawUrls(project);
            const srcIssues = issues.filter((i) => i.file.endsWith("usage.ts"));
            expect(srcIssues.length).toBe(2);
            expect(srcIssues.filter((i) => i.severity === "warning").length).toBe(1);
            expect(srcIssues.filter((i) => i.severity === "error").length).toBe(1);
            expect(srcIssues.some((i) => i.severity === "error" && i.message.includes("zzz99"))).toBe(true);
            expect(srcIssues.some((i) => i.line === 3)).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("生成文件自身不报问题", () => {
        const { dir } = setupProject();
        try {
            const project = locateProject(dir);
            const issues = scanTsRawUrls(project);
            expect(issues.some((i) => i.file.includes("ui-common.ts"))).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test ./tools/fgui/test/scan-ts.test.ts`
Expected: FAIL，`scanTsRawUrls` 未定义。

- [ ] **Step 3: 实现 `tools/fgui/lib/scan-ts.ts`**

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { listPackages, readPackage, type FguiProject } from "./fgui";

export interface TsUrlIssue {
    readonly file: string;
    readonly line: number;
    readonly severity: "warning" | "error";
    readonly message: string;
}

/** 从一行源码提取字符串字面量中的 ui:// URL（单双引号；排除注释行）。 */
function extractUrlsFromLine(line: string): string[] {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return [];
    const urls: string[] = [];
    const re = /["'`](ui:\/\/[a-zA-Z0-9]+)["'`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) urls.push(m[1]!);
    return urls;
}

/** 递归收集目录下所有 .ts 文件相对工程根路径。 */
function collectTsFiles(root: string, dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectTsFiles(root, full));
        else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(relative(root, full));
    }
    return out;
}

/**
 * 扫描 assets/ 与 tests/ 下 TS 源码中的裸 ui:// 字符串并映射到生成常量表。
 * 匹配到生成常量 → warning（建议改用常量）；未登记 → error（资源 id 检查或重跑 gen-constants）。
 * 生成产物目录 assets/ui/generated/ 自身排除。
 */
export function scanTsRawUrls(project: FguiProject): TsUrlIssue[] {
    const issues: TsUrlIssue[] = [];
    const known = new Map<string, string>();
    for (const pkgName of listPackages(project)) {
        const pkg = readPackage(project, pkgName);
        for (const r of pkg.resources) {
            if (r.kind !== "component" || !r.exported) continue;
            known.set(`ui://${pkg.id}${r.id}`, `Ui${pkgName}${r.name.replace(/\.xml$/i, "")}`);
        }
    }
    const roots = ["assets", "tests"].map((d) => join(project.root, d)).filter((d) => existsSync(d));
    for (const root of roots) {
        for (const file of collectTsFiles(project.root, root)) {
            if (file.startsWith(join("assets", "ui", "generated"))) continue;
            const lines = readFileSync(join(project.root, file), "utf8").split("\n");
            for (let i = 0; i < lines.length; i++) {
                for (const url of extractUrlsFromLine(lines[i]!)) {
                    const constantName = known.get(url);
                    const msg = constantName
                        ? `建议改用生成常量 ${constantName}（裸 ui:// URL 应引用 ui/generated/ 产物）`
                        : `未登记的 ui:// URL "${url}"（检查资源 id 或先重跑 gen-constants）`;
                    issues.push({ file, line: i + 1, severity: constantName ? "warning" : "error", message: msg });
                }
            }
        }
    }
    return issues;
}
```

- [ ] **Step 4: 在 `tools/fgui/commands/validate.ts` 接入扫描**

`validate.ts` 顶部 import：

```ts
import { scanTsRawUrls } from "../lib/scan-ts";
```

在 `run` 函数中、`// 2. 组件校验` 段之前插入：

```ts
    // 1b. 全工程 TS 源码裸 ui:// URL 扫描（assets/ 与 tests/，生成产物目录除外）
    const tsIssues = scanTsRawUrls(project);
    for (const issue of tsIssues) {
        console.error(`[${issue.severity}] ${issue.file}:${issue.line} ${issue.message}`);
        if (issue.severity === "error") exitCode = 1;
    }
```

`--strict` 与豁免逻辑不影响该段（TS 扫描无官方库豁免概念）。

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test ./tools/fgui/test/scan-ts.test.ts`
Expected: PASS（2 个测试全过）。

- [ ] **Step 6: 提交**

```bash
git add tools/fgui/lib/scan-ts.ts tools/fgui/commands/validate.ts tools/fgui/test/scan-ts.test.ts
git commit -m "feat(fgui): validate 扫描 TS 裸 ui:// URL（匹配常量 warning/未登记 error）"
```

---

### Task 4: 存量迁移 P0a（生成产物 + 引用点改常量）

**Files:**
- Create: `assets/ui/generated/ui-common.ts`、`assets/ui/generated/ui-autobattle.ts`
- Modify: `assets/samples/game_auto_battle/view/unit-node-mapping.ts`
- Modify: `tests/framework/foundation/dynamic-component-view-handle.test.ts`
- Test: 无新增（复用既有测试 + typecheck + validate 扫描归零验证）

**Interfaces:**
- Consumes: Task 2 生成的常量文件。
- Produces: 迁移后的引用点；`rg "ui://"` 全库仅剩 `ui/generated/` 产物（P0a 完成标准）。

- [ ] **Step 1: 运行 `gen-constants` 生成真实产物**

Run: `bun run fgui gen-constants`
Expected: 生成 `assets/ui/generated/ui-common.ts`（含 `UiCommonUnitSlot = "ui://cmn00001com03"`）、`ui-autobattle.ts`（含 `UiAutoBattleUnitHitFeedbackCom = "ui://abpk0001ab004"`）。确认文件只含 exported 组件。

- [ ] **Step 2: 迁移 `unit-node-mapping.ts`**

`assets/samples/game_auto_battle/view/unit-node-mapping.ts`：
- 顶部加 import：`import { UiCommonUnitSlot } from "../../../ui/generated/ui-common";` 与 `import { UiAutoBattleUnitHitFeedbackCom } from "../../../ui/generated/ui-autobattle";`
- 第 30 行 `componentUrl: "ui://cmn00001com03"` → `componentUrl: UiCommonUnitSlot`
- 第 56 行 `componentUrl: "ui://abpk0001ab004"` → `componentUrl: UiAutoBattleUnitHitFeedbackCom`

注意：`unit-node-mapping.ts` 头注释称"纯配置数据，不依赖 fgui"——更新为"常量来自 ui/generated/ 生成产物"。

- [ ] **Step 3: 迁移 `tests/framework/foundation/dynamic-component-view-handle.test.ts`**

该测试第 13、139 行 `componentUrl: "ui://cmn00001com03"` / `"ui://abpk0001ab004"` 改为 import 同名常量（import 路径按测试文件所在 `tests/framework/foundation/` 计算：`../../../assets/ui/generated/ui-common` 与 `../../../assets/ui/generated/ui-autobattle`）。

- [ ] **Step 4: 验证扫描归零**

Run: `bun run fgui validate --strict`
Expected: 无 TS 裸 URL 的 `[error]`/`[warning]`（`ui/generated/` 自身排除；XML 侧校验全包通过）。

Run: `rg "ui://" assets tests`
Expected: 仅命中 `assets/ui/generated/*.ts`（4 处旧裸引用全部消除）。

- [ ] **Step 5: 全量验证**

Run: `bun run typecheck && bun test ./tools/fgui/test && bun test ./tests/framework/foundation`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add assets/ui/generated assets/samples/game_auto_battle/view/unit-node-mapping.ts tests/framework/foundation/dynamic-component-view-handle.test.ts
git commit -m "refactor(ui): 裸 ui:// URL 迁移到 ui/generated 生成常量（P0a）"
```

---

## Self-Review

**Spec 覆盖：**
- D1 三问规则 → Task 1（AGENTS.md + instructions）
- D3 gen-constants → Task 2（命令 + CLI 注册 + 测试）
- D4 validate 扫描 → Task 3（scan-ts + validate 接入 + 测试）
- P0a 迁移 → Task 4（生成产物 + 两处引用点 + 验证）
- 测试与完成标准 → Task 2/3 单测 + Task 4 全量验证

**占位符检查：** 无 TBD/TODO；每步含完整代码或精确行号改动。

**类型一致性：**
- `generateConstants` 返回 `Array<{ pkg; file; lines }>`，Task 2 command 与 Task 3 均消费一致形态（Task 3 scan-ts 不直接复用 generateConstants，而是独立用 `listPackages`/`readPackage` 构建 `known` 映射，避免依赖生成文件存在——语义等价，减少耦合）。
- `scanTsRawUrls(project)` 签名在测试与 command 中使用一致。
- 常量名 `UiCommonUnitSlot`/`UiAutoBattleUnitHitFeedbackCom` 在 Task 2 测试、Task 3 测试、Task 4 迁移三处一致。
- `toPascalCase`：`Demo`→`Demo`、`Common`→`Common`、`AutoBattle`→`AutoBattle`、`UnitHitFeedbackCom`→`UnitHitFeedbackCom`（XML 名去 `.xml` 后无分隔符，原样保留大小写）。`UnitSlot` 同理。已按真实资源 id 核对（com03/cmn00001/ab004/abpk0001/03gta/4q9x2uij）。

**风险备注：** Task 4 Step 3 的测试 import 相对路径 `../../../assets/ui/generated/ui-common` 需按 `tests/framework/foundation/` 层级核对（tests → framework → foundation，向上三级到仓库根，再入 assets）。若与 repo 结构不符，实现时以 `resolve` 后实际可达路径为准并运行 typecheck 兜底。
