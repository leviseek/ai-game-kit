/**
 * FGUI 编辑器 MCP server 入口。
 * 用 @modelcontextprotocol/sdk 的 McpServer + StdioServerTransport 暴露读/写工具面，
 * 主桥接通道为文件邮箱（MailboxBridge → 编辑器插件），validate 等确定性操作透传 tools/fgui CLI。
 *
 * 启动：bun run tools/fgui-mcp/cli.ts  （由 OpenCode/任意 MCP 客户端经 stdio 拉起）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MailboxBridge } from "./lib/bridge";
import { locateProject } from "./lib/paths";
import { CHECK_PUBLISH_TOOL, READ_TOOLS, WRITE_TOOLS, wrapToolRun, type ToolResult } from "./lib/tools";
import { join } from "node:path";

async function main(): Promise<void> {
    const project = locateProject();
    const bridge = new MailboxBridge(project.mailboxDir);
    const server = new McpServer({ name: "fgui-mcp", version: "0.1.0" });

    // 读工具（含 fgui_validate_package 走 CLI）
    for (const [name, tool] of Object.entries(READ_TOOLS)) {
        server.registerTool(name, {
            description: tool.description,
            inputSchema: {
                package: z.string().optional().describe("包名"),
                component: z.string().optional().describe("组件名"),
                strict: z.boolean().optional().describe("全量校验（不豁免官方库）"),
                url: z.string().optional().describe("资源 ui:// URL"),
                section: z.string().optional().describe("工程设置段（Adaptation/Common/I18n/PackageGroup）"),
                keyword: z.string().optional().describe("搜索关键字"),
                maxResults: z.number().optional().describe("搜索结果上限"),
            },
        }, async (args) => {
            const isEditorTool = name !== "fgui_validate_package";
            const wrapped = wrapToolRun(isEditorTool, project.mailboxDir, bridge, tool.run);
            const result: ToolResult = await wrapped(args);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        });
    }

    // 写工具（全部走编辑器桥）
    for (const [name, tool] of Object.entries(WRITE_TOOLS)) {
        server.registerTool(name, {
            description: tool.description,
            inputSchema: {
                package: z.string().optional().describe("包名"),
                component: z.string().optional().describe("组件名"),
                doc: z.string().optional().describe("目标文档组件名"),
                settings: z.record(z.string(), z.any()).optional().describe("发布设置字段覆盖"),
                projectType: z.string().optional().describe("工程类型"),
                snapshot: z.record(z.string(), z.any()).optional().describe("回滚快照（switch 返回的 before.settings）"),
                branch: z.string().optional().describe("分支（默认 activeBranch，空串=主干）"),
                redirectToScratch: z.boolean().optional().describe("发布重定向到 .objs（默认 true；false 走真实产物路径）"),
                mode: z.string().optional().describe("保存模式（active|all）"),
                name: z.string().optional().describe("名称（资源/组件/控制器/包/文件夹等）"),
                path: z.string().optional().describe("路径（资源/文件夹目标路径）"),
                width: z.number().optional().describe("宽度"),
                height: z.number().optional().describe("高度"),
                keyword: z.string().optional().describe("搜索关键字"),
                sidePair: z.string().optional().describe("关系 sidePair（如 width-width,height-height）"),
                target: z.string().optional().describe("关系目标对象 id 或目标包"),
                properties: z.record(z.string(), z.any()).optional().describe("对象属性键值"),
                index: z.number().optional().describe("子对象插入索引/控制器页索引"),
                newName: z.string().optional().describe("重命名新名称"),
                sourcePackage: z.string().optional().describe("复制源包"),
                targetPackage: z.string().optional().describe("复制目标包"),
                files: z.array(z.string()).optional().describe("文件路径列表"),
                resName: z.string().optional().describe("导入资源重命名"),
                type: z.string().optional().describe("对象类型（image/text/component 等，graph 禁止）"),
                pages: z.array(z.string()).optional().describe("控制器页面名数组"),
                targetRelation: z.string().optional().describe("关系目标对象 id/name（空=父级）"),
                confirm: z.boolean().optional().describe("破坏性操作二次确认"),
                targetPath: z.string().optional().describe("复制/移动目标路径"),
            },
        }, async (args) => {
            // 写工具均为编辑器侧操作，先做桥可达性检查
            const wrapped = wrapToolRun(true, project.mailboxDir, bridge, tool.run);
            const result: ToolResult = await wrapped(args);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        });
    }

    // 检测工具：发布一致性（走外部文件检测，不依赖编辑器桥可达性）
    server.registerTool("fgui_check_publish", {
        description: CHECK_PUBLISH_TOOL.description,
        inputSchema: {
            packages: z.array(z.string()).optional().describe("指定包（默认取信号中的包或全部产物包）"),
        },
    }, async (args) => {
        const signalPath = join(project.probeDir, "publish-signal.json");
        const result: ToolResult = CHECK_PUBLISH_TOOL.run({ signalPath, project }, args);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error(`[fgui-mcp] 启动失败: ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(1);
});
