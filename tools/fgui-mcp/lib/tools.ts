/**
 * MCP 读工具注册表：把 MCP 工具名映射到邮箱桥接方法或 fgui CLI 子进程调用。
 * 每个工具返回结构化结果；编辑器不可达/操作失败返回结构化错误（spec：failed tool returns structured error）。
 */

import { MailboxBridge, isBridgeReachable } from "./bridge";
import { runFguiCli } from "./fgui-cli";
import { FguiMcpError } from "./paths";

/** 工具统一返回形态：结构化数据 + 可选 bridge 状态。 */
export interface ToolResult {
    readonly ok: boolean;
    readonly data?: unknown;
    readonly error?: string;
    /** 桥接层状态：编辑器是否可达（仅编辑器侧工具含此字段） */
    readonly bridge?: { reached: boolean };
}

/** 从 fgui CLI 输出提取业务结果（exitCode!=0 时视为校验/查询失败）。 */
function cliResult(args: readonly string[]): ToolResult {
    const { exitCode, stdout, stderr } = runFguiCli(args);
    if (exitCode !== 0) {
        return {
            ok: false,
            error: (stderr.trim() || stdout.trim() || `fgui CLI 退出码 ${exitCode}`),
        };
    }
    return { ok: true, data: stdout.trim() };
}

/** 调用邮箱桥接并归一化结果。 */
async function bridgeResult(bridge: MailboxBridge, method: string, params: Record<string, unknown>): Promise<ToolResult> {
    const call = await bridge.call(method, params);
    return {
        ok: call.ok,
        data: call.result,
        error: call.error,
        bridge: { reached: call.reached },
    };
}

/** 读工具集：包/资源/依赖/发布配置/活动上下文 走编辑器桥；validate 走 fgui CLI。 */
export const READ_TOOLS: Record<string, { description: string; run: (bridge: MailboxBridge, params: Record<string, unknown>) => Promise<ToolResult> }> = {
    fgui_list_packages: {
        description: "列出当前工程所有 FGUI 包（name/id/opened）。需要 FGUI 编辑器已打开工程且插件已加载。",
        run: (bridge, params) => bridgeResult(bridge, "list_packages", params),
    },
    fgui_list_resources: {
        description: "列出指定包的资源清单（kind/id/name/path/exported/branch）。参数: package。",
        run: (bridge, params) => bridgeResult(bridge, "list_resources", params),
    },
    fgui_query_dependencies: {
        description: "查询指定资源的依赖引用（DependencyQuery, ALL）。参数: url（ui://...）。",
        run: (bridge, params) => bridgeResult(bridge, "query_dependencies", params),
    },
    fgui_read_publish_settings: {
        description: "读取全局发布设置（GetSettings('Publish') 字段快照）与工程类型。",
        run: (bridge, params) => bridgeResult(bridge, "read_publish_settings", params),
    },
    fgui_get_active_context: {
        description: "返回活动文档（url/isModified/title）与活动文件夹。",
        run: (bridge, params) => bridgeResult(bridge, "get_active_context", params),
    },
    fgui_validate_package: {
        description: "用 tools/fgui validate 校验包引用完整性与语义（默认跳过官方库，--strict 全量）。参数: package, 可选 strict/component。",
        run: (_bridge, params) => {
            const pkg = params["package"] as string | undefined;
            if (!pkg) return Promise.resolve({ ok: false, error: "缺少参数 package" });
            const strict = params["strict"] === true ? ["--strict"] : [];
            const component = params["component"] as string | undefined;
            const args = [
                "validate",
                "--package",
                pkg,
                ...(component ? ["--component", component] : []),
                ...strict,
            ];
            return Promise.resolve(cliResult(args));
        },
    },
};

/** 检查编辑器桥是否可达；不可达时返回结构化错误而非中断。 */
export function requireBridge(bridge: MailboxBridge, mailboxDir: string): ToolResult | null {
    if (!isBridgeReachable(mailboxDir)) {
        return {
            ok: false,
            error: "编辑器桥不可达：未找到邮箱目录。请确认 FGUI 编辑器已打开工程且 fgui-mcp-probe 插件已加载。",
            bridge: { reached: false },
        };
    }
    return null;
}

/** 供工具分发统一包裹：先查桥可达性（仅编辑器侧工具），再执行。 */
export function wrapToolRun(
    isEditorTool: boolean,
    mailboxDir: string,
    bridge: MailboxBridge,
    run: (bridge: MailboxBridge, params: Record<string, unknown>) => Promise<ToolResult>,
): (params: Record<string, unknown>) => Promise<ToolResult> {
    return async (params) => {
        if (isEditorTool) {
            const blocked = requireBridge(bridge, mailboxDir);
            if (blocked) return blocked;
        }
        try {
            return await run(bridge, params);
        } catch (e) {
            if (e instanceof FguiMcpError) return { ok: false, error: e.message };
            return { ok: false, error: String(e instanceof Error ? e.message : e) };
        }
    };
}
