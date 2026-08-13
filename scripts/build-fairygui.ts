// 构建导出脚本：把 FairyGUI 子模块（third-party/fairygui）的库产物同步到
// Cocos 解析目录（assets/framework/libs/fairygui）。Cocos 只打包 assets 内
// 资源，而第三方库源码统一存根目录 third-party/（submodule，独立版本历史），
// 故用本脚本桥接"子模块产物 → assets 产物目录"，import-map 继续指向产物目录。
//
// 两条调用路径：
//   1) 纯同步（默认）：子模块 source/dist 已是最新，直接拷贝内容文件；
//   2) 源码修改后：先改 third-party/fairygui/source/src，在子模块内
//      `npm install && npm run build`（官方 gulp）产出新 dist，再跑本脚本。
//
// 只写内容文件（mjs/min.mjs/d.ts/LICENSE），不碰 .meta（GUID 由 Cocos 维持），
// 保证资源引用不漂移；LICENSE 统一 LF 行尾（对齐仓库 .gitattributes）。
// 用法：bun scripts/build-fairygui.ts
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const SOURCE_DIR = resolve(PROJECT_ROOT, "third-party/fairygui/source/dist");
const LICENSE_SOURCE = resolve(PROJECT_ROOT, "third-party/fairygui/LICENSE");
const TARGET_DIR = resolve(PROJECT_ROOT, "assets/framework/libs/fairygui");

/** 内容文件清单：子模块产物 → 产物目录（LICENSE 从子模块根取）。 */
const CONTENT_FILES: ReadonlyArray<{ readonly name: string; readonly source: string }> = [
    { name: "fairygui.mjs", source: resolve(SOURCE_DIR, "fairygui.mjs") },
    { name: "fairygui.min.mjs", source: resolve(SOURCE_DIR, "fairygui.min.mjs") },
    { name: "fairygui.d.ts", source: resolve(SOURCE_DIR, "fairygui.d.ts") },
    { name: "LICENSE", source: LICENSE_SOURCE },
];

function sha256(filePath: string): string {
    const hash = createHash("sha256");
    hash.update(readFileSync(filePath));
    return hash.digest("hex");
}

/** 行尾统一为 LF：第三方库仓库的 LICENSE 可能是 CRLF，产物保持仓库基线。 */
function normalizeLf(content: string): string {
    return content.replace(/\r\n/g, "\n");
}

function main(): void {
    if (!existsSync(SOURCE_DIR)) {
        console.error(`[build:fairygui] 子模块产物目录不存在: ${SOURCE_DIR}\n` + "请先初始化子模块：git submodule update --init third-party/fairygui");
        process.exit(1);
    }

    mkdirSync(TARGET_DIR, { recursive: true });

    let copied = 0;
    for (const file of CONTENT_FILES) {
        if (!existsSync(file.source)) {
            console.error(`[build:fairygui] 源文件缺失: ${file.source}`);
            process.exit(1);
        }
        const target = resolve(TARGET_DIR, file.name);
        if (file.name === "LICENSE") {
            // LICENSE 统一 LF，避免 CRLF 漂移
            writeFileSync(target, normalizeLf(readFileSync(file.source, "utf8")), "utf8");
        } else {
            copyFileSync(file.source, target);
        }
        copied += 1;
        console.log(`[build:fairygui] 同步 ${file.name}  (${sha256(target).slice(0, 12)})`);
    }
    console.log(`[build:fairygui] 完成：${copied}/${CONTENT_FILES.length} 个内容文件已同步到 ${TARGET_DIR}`);
    console.log("[build:fairygui] 注：.meta 文件不在此脚本职责内，由 Cocos 维持 GUID。");
}

main();
