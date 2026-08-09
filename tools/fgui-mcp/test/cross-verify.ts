/**
 * 交叉验证脚本：编辑器开启时人工执行，对比编辑器桥读工具与 tools/fgui CLI 结果。
 * 用法: bun run tools/fgui-mcp/test/cross-verify.ts [--package Demo]
 * 前置: FGUI 编辑器已打开 ui/demo 工程且 fgui-mcp-probe 插件已加载（邮箱服务器已启动）。
 *
 * 对比项：
 * - fgui_list_resources vs bun run fgui list-resources
 * - fgui_validate_package vs bun run fgui validate（透传层，天然一致，仅打印）
 */

import { MailboxBridge } from "../lib/bridge";
import { locateProject } from "../lib/paths";
import { runFguiCli } from "../lib/fgui-cli";

const packageName = process.argv.includes("--package") ? process.argv[process.argv.indexOf("--package") + 1] : "Demo";

async function main(): Promise<void> {
    const project = locateProject();
    const bridge = new MailboxBridge(project.mailboxDir, { timeoutMs: 10_000 });

    console.log(`== 交叉验证（包: ${packageName}）==`);

    // 1. 编辑器桥资源清单
    const bridgeRes = await bridge.call("list_resources", { package: packageName });
    if (!bridgeRes.reached) {
        console.error("[交叉验证] 编辑器桥不可达。请确认编辑器已打开且邮箱服务器已启动。");
        process.exit(1);
    }
    if (!bridgeRes.ok) {
        console.error(`[交叉验证] 编辑器桥错误: ${bridgeRes.error}`);
        process.exit(1);
    }
    const bridgeRows = (bridgeRes.result as { resources: Array<{ kind: string; id: string; name: string; exported: boolean }> }).resources;

    // 2. CLI 资源清单（解析文本行）
    const cliOut = runFguiCli(["list-resources", "--package", packageName]);
    const cliRows: Array<{ kind: string; id: string; name: string; exported: boolean }> = [];
    for (const line of cliOut.stdout.split("\n")) {
        const m = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+\.xml|\S+\.png|\S+\.jpg|\S+\.webp|\S+\.gif|\S+\.svg|\S+\.mp3|\S+\.wav)\s+@\S+(\s+export)?/);
        if (m) {
            cliRows.push({
                kind: m[1]!,
                id: m[2]!,
                name: m[3]!,
                exported: m[4] !== undefined,
            });
        }
    }

    // 3. 对比：按 id → {kind,name,exported} 建映射
    const bridgeMap = new Map(bridgeRows.map((r) => [r.id, r]));
    const cliMap = new Map(cliRows.map((r) => [r.id, r]));
    const allIds = new Set([...bridgeMap.keys(), ...cliMap.keys()]);
    let mismatches = 0;
    for (const id of allIds) {
        const b = bridgeMap.get(id);
        const c = cliMap.get(id);
        if (!b || !c || b.kind !== c.kind || b.name !== c.name || b.exported !== c.exported) {
            console.error(`[不一致] id=${id} 桥=${JSON.stringify(b)} CLI=${JSON.stringify(c)}`);
            mismatches++;
        }
    }

    if (mismatches === 0) {
        console.log(`✓ 资源清单一致（${allIds.size} 项）`);
    } else {
        console.error(`✗ 发现 ${mismatches} 项不一致`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(String(e));
    process.exit(1);
});
