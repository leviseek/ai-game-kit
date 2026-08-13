// 一次性脚本：用 TypeScript 语言服务格式化 API 把项目全部 TS 缩进迁移为
// editorconfig 基线（4 空格）。只调整空白，不改引号/分号/import，diff 最小。
// 用法：
//   bun scripts/format-ts-indent.ts --dry-run   只统计，不写盘
//   bun scripts/format-ts-indent.ts --write     写回文件
import { existsSync } from "node:fs";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const EXCLUDE_DIRS = new Set(["node_modules", "temp", "library", "build", "local", ".opencode", ".git"]);
const EXCLUDE_FILES = new Set(["assets/third-party/fairygui/fairygui.d.ts"]);

function collectTypeScriptFiles(dir: string): string[] {
    const result: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (EXCLUDE_DIRS.has(entry.name)) continue;
            result.push(...collectTypeScriptFiles(full));
        } else if (entry.name.endsWith(".ts")) {
            const rel = relative(PROJECT_ROOT, full).replaceAll("\\", "/");
            if (EXCLUDE_FILES.has(rel)) continue;
            result.push(full);
        }
    }
    return result;
}

// 探测文件首个换行符：CRLF 文件返回 "\r\n"，否则 "\n"，写回时保持一致。
function detectNewline(text: string): string {
    const crlf = text.indexOf("\r\n");
    const lf = text.indexOf("\n");
    if (crlf === -1) return "\n";
    if (lf === -1) return "\r\n";
    return crlf < lf ? "\r\n" : "\n";
}

function main(): void {
    const dryRun = !process.argv.includes("--write");
    const files = collectTypeScriptFiles(PROJECT_ROOT).sort();
    console.log(`[format-ts] 扫描到 ${files.length} 个 TS 文件（dryRun=${dryRun})`);

    const formatOptions = ts.getDefaultFormatCodeSettings();
    formatOptions.indentSize = 4;
    formatOptions.tabSize = 4;
    formatOptions.convertTabsToSpaces = true;
    formatOptions.newLineCharacter = "\n";

    let changedFiles = 0;
    let changedLines = 0;
    const changedStats: { rel: string; lines: number }[] = [];

    for (const file of files) {
        const text = readFileSync(file, "utf8");
        const host = createFormattingHost(file, text);
        const service = ts.createLanguageService(host);
        const edits = service.getFormattingEditsForDocument(file, formatOptions);

        if (edits.length === 0) continue;

        const newline = detectNewline(text);
        let out = text;
        for (let i = edits.length - 1; i >= 0; i--) {
            const edit = edits[i];
            const newText = edit.newText.replaceAll("\n", newline);
            out = out.slice(0, edit.span.start) + newText + out.slice(edit.span.start + edit.span.length);
        }

        const linesChanged = edits.filter((e) => e.newText.length > 0).length;
        changedFiles++;
        changedLines += linesChanged;
        changedStats.push({ rel: relative(PROJECT_ROOT, file), lines: linesChanged });

        if (!dryRun && out !== text) {
            writeFileSync(file, out, "utf8");
        }
    }

    changedStats.sort((a, b) => b.lines - a.lines);
    console.log(`[format-ts] 有缩进变化的文件 ${changedFiles} 个，共 ${changedLines} 行`);
    console.log("[format-ts] 变化最多的 20 个文件：");
    for (const s of changedStats.slice(0, 20)) {
        console.log(`  ${String(s.lines).padStart(5)}  ${s.rel}`);
    }

    if (dryRun) {
        console.log("[format-ts] dry-run 完成，未写盘。确认后使用 --write 执行。");
    } else {
        console.log("[format-ts] 写盘完成。请用 git diff -w --stat 验证零逻辑改动。");
    }
}

// 为单个文件构造轻量 language service host，避免解析整个项目。
function createFormattingHost(file: string, text: string): ts.LanguageServiceHost {
    const scriptSnapshot = ts.ScriptSnapshot.fromString(text);
    const getLineStarts = () => ts.getLineStarts(text);
    const getText = () => text;
    return {
        getScriptFileNames: () => [file],
        getScriptVersion: () => "0",
        getScriptSnapshot: () => scriptSnapshot,
        getCurrentDirectory: () => PROJECT_ROOT,
        getCompilationSettings: () => ({
            target: ts.ScriptTarget.ES2015,
            module: ts.ModuleKind.ES2015,
            strict: true,
            skipLibCheck: true,
        }),
        getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
        fileExists: (f) => existsSync(f),
        readFile: (f) => (f === file ? text : readFileSync(f, "utf8")),
        readDirectory: (dir, ext, exclude, include, depth) => ts.sys.readDirectory(dir, ext, exclude, include, depth),
        getDirectories: (dir) => ts.sys.getDirectories(dir),
        directoryExists: (dir) => ts.sys.directoryExists(dir),
        getLineAndCharacterOfPosition: (position) => ts.getLineAndCharacterOfPosition(getLineStarts(), position),
        getText,
        // 以下为 language service 可选的性能钩子，返回默认值即可
        getScriptKind: () => ts.ScriptKind.TS,
        getScriptSnapshotWithKind: () => scriptSnapshot,
        getLineStarts,
    };
}

main();
