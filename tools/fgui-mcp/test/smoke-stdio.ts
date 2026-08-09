/**
 * stdio 集成冒烟测试：真实拉起 fgui-mcp server 进程，走 MCP 握手 + tools/list + tools/call。
 * 前置：无需编辑器（仅验证 server 进程协议层；编辑器侧工具调用返回"桥不可达"结构化错误）。
 *
 * 用法: bun run tools/fgui-mcp/test/smoke-stdio.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
    const transport = new StdioClientTransport({
        command: "bun",
        args: ["run", "./tools/fgui-mcp/cli.ts"],
        cwd: process.cwd(),
    });
    const client = new Client({ name: "smoke-test", version: "0.1.0" });
    await client.connect(transport);

    console.log("== tools/list ==");
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    console.log(names.join("\n"));
    if (!names.includes("fgui_list_packages") || !names.includes("fgui_validate_package")) {
        throw new Error("tools/list 缺少预期工具");
    }

    console.log("\n== tools/call fgui_validate_package (无需编辑器) ==");
    const validate = await client.callTool({ name: "fgui_validate_package", arguments: { package: "Demo" } });
    console.log(JSON.stringify(validate, null, 2));

    console.log("\n== tools/call fgui_list_packages (编辑器侧，期望结构化'桥不可达'错误) ==");
    const list = await client.callTool({ name: "fgui_list_packages", arguments: {} });
    console.log(JSON.stringify(list, null, 2));

    await client.close();
    console.log("\n✓ stdio 冒烟通过");
}

main().catch((e) => {
    console.error(`✗ 冒烟失败: ${e}`);
    process.exit(1);
});
