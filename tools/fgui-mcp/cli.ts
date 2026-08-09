/**
 * FGUI 编辑器 MCP server 入口。
 * 用 @modelcontextprotocol/sdk 的 McpServer + StdioServerTransport 暴露读工具面，
 * 主桥接通道为文件邮箱（MailboxBridge → 编辑器插件），validate 等确定性操作透传 tools/fgui CLI。
 *
 * 启动：bun run tools/fgui-mcp/cli.ts  （由 OpenCode/任意 MCP 客户端经 stdio 拉起）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MailboxBridge } from "./lib/bridge";
import { locateProject } from "./lib/paths";
import { READ_TOOLS, wrapToolRun, type ToolResult } from "./lib/tools";

async function main(): Promise<void> {
    const project = locateProject();
    const bridge = new MailboxBridge(project.mailboxDir);
    const server = new McpServer({ name: "fgui-mcp", version: "0.1.0" });

    for (const [name, tool] of Object.entries(READ_TOOLS)) {
        server.registerTool(name, {
            description: tool.description,
            inputSchema: {
                // 所有读工具参数可选；缺参会由 handler/CLI 侧给出明确错误
                package: z.string().optional().describe("包名"),
                component: z.string().optional().describe("组件名"),
                strict: z.boolean().optional().describe("全量校验（不豁免官方库）"),
                url: z.string().optional().describe("资源 ui:// URL"),
            },
        }, async (args) => {
            // 仅编辑器侧工具需要先做桥可达性检查；validate 走 CLI 不依赖编辑器
            const isEditorTool = name !== "fgui_validate_package";
            const wrapped = wrapToolRun(isEditorTool, project.mailboxDir, bridge, tool.run);
            const result: ToolResult = await wrapped(args);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        });
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error(`[fgui-mcp] 启动失败: ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(1);
});
