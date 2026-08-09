/**
 * MCP 读工具注册表：把 MCP 工具名映射到邮箱桥接方法或 fgui CLI 子进程调用。
 * 每个工具返回结构化结果；编辑器不可达/操作失败返回结构化错误（spec：failed tool returns structured error）。
 */

import { MailboxBridge, isBridgeReachable } from "./bridge";
import { runFguiCli } from "./fgui-cli";
import { FguiMcpError } from "./paths";
import { checkPublish, type CheckPublishResult } from "./check-publish";

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
    fgui_read_project_settings: {
        description:
            "读取工程设置快照（Adaptation/Common/I18n/PackageGroup）。参数: 可选 section（指定段，默认全部）。",
        run: (bridge, params) => bridgeResult(bridge, "read_project_settings", params),
    },
    fgui_full_search: {
        description: "全工程资源搜索。参数: keyword（必填）、可选 maxResults（结果上限）。",
        run: (bridge, params) => bridgeResult(bridge, "full_search", params),
    },
    fgui_read_document: {
        description:
            "读取已打开文档的结构快照（子对象/控制器/关系/过渡列表）。参数: package、component。",
        run: (bridge, params) => bridgeResult(bridge, "read_document", params),
    },
    fgui_list_controllers: {
        description:
            "列出组件的控制器（名称/页面/选中页）。参数: package、component。",
        run: (bridge, params) => bridgeResult(bridge, "list_controllers", params),
    },
    fgui_get_selection: {
        description:
            "返回活动文档的选中对象列表（id/name/objectType）。参考 FairyGUI-MCP。",
        run: (bridge, params) => bridgeResult(bridge, "get_selection", params),
    },
    fgui_get_component_info: {
        description:
            "返回组件元信息（name/id/type/width/height/path/url/exported）。参数: package、component。",
        run: (bridge, params) => bridgeResult(bridge, "get_component_info", params),
    },
    fgui_get_logs: {
        description:
            "返回编辑器控制台日志尾部（Unity Application.consoleLogPath 最近 N 行）。参数: 可选 lines（默认 100）。",
        run: (bridge, params) => bridgeResult(bridge, "get_logs", params),
    },
    fgui_find_unused_resources: {
        description:
            "未使用资源检查（只读报告，不删除）。参数: 可选 package（默认全部包）。deferred：异步完成后返回。",
        run: (bridge, params) => bridgeResult(bridge, "find_unused_resources", params),
    },
    fgui_find_duplicate_resources: {
        description:
            "重复资源检查（只读报告，不删除）。参数: 可选 package（默认全部包）。deferred：异步完成后返回。",
        run: (bridge, params) => bridgeResult(bridge, "find_duplicate_resources", params),
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

/**
 * 写工具集：发布配置切换/回滚、工程刷新、组件插入。
 * 全部走编辑器桥（是编辑器独有能力）。发布配置切换前返回快照，供回滚留存。
 */
export const WRITE_TOOLS: Record<string, { description: string; run: (bridge: MailboxBridge, params: Record<string, unknown>) => Promise<ToolResult> }> = {
    fgui_switch_publish_settings: {
        description:
            "程序化切换全局发布设置。参数: settings（字段覆盖，如 path/fileExtension/binaryFormat/atlasSetting），可选 projectType（工程类型）。" +
            "返回 before 快照（含 settings 与 projectType），供 fgui_restore_publish_settings 回滚。副作用：包设置刷新，编辑区会闪烁。",
        run: (bridge, params) => bridgeResult(bridge, "switch_publish_settings", params),
    },
    fgui_restore_publish_settings: {
        description:
            "基于 switch 返回的 before 快照回滚发布设置。参数: snapshot（settings 字段快照），可选 projectType。副作用：包设置刷新，编辑区会闪烁。",
        run: (bridge, params) => bridgeResult(bridge, "restore_publish_settings", params),
    },
    fgui_refresh_project: {
        description: "刷新工程（App.RefreshProject），供写操作（如源 XML/PNG 变更）后编辑器感知变更。",
        run: (bridge, params) => bridgeResult(bridge, "refresh_project", params),
    },
    fgui_reload_package: {
        description:
            "刷新包内容（FairyGUI-MCP reload 方案）：pkg.Touch() + 遍历 item.Touch() + 延迟 Touch，" +
            "让编辑器感知源 XML/PNG 变更，比全量刷新更精准。参数: package；传 full=true 走 App.RefreshProject 全量。",
        run: (bridge, params) => bridgeResult(bridge, "reload_package", params),
    },
    fgui_save_documents: {
        description:
            "保存活动文档或全部未保存文档（写闭环：内存态修改落盘）。参数: mode（active 保存活动文档，默认 all 保存全部未保存）。" +
            "发布流程会自动先保存，无需单独调用。",
        run: (bridge, params) => bridgeResult(bridge, "save_documents", params),
    },
    fgui_import_resource: {
        description:
            "导入外部文件（如 sprite CLI 生成的 PNG）到包内并登记为资源。参数: package（目标包）、files（文件路径数组）、" +
            "可选 path（目标目录，默认 /）、可选 resName。批量语义，部分失败项列出不整体回滚。",
        run: (bridge, params) => bridgeResult(bridge, "import_resource", params),
    },
    fgui_add_child: {
        description:
            "在组件内创建并添加子对象。参数: package、doc（目标文档组件名）、type（image/text/component 等；graph 禁止）、" +
            "可选 name、可选 src（资源 id/组件名）、可选 index。返回新对象 id 与 childrenDelta；内存态操作需 fgui_save_documents 持久化。",
        run: (bridge, params) => bridgeResult(bridge, "add_child", params),
    },
    fgui_delete_child: {
        description:
            "删除文档中的对象。参数: package、doc、target（对象 id 或 name）。返回 childrenDelta 与引用警告（relation/gear 引用对象）。",
        run: (bridge, params) => bridgeResult(bridge, "delete_child", params),
    },
    fgui_set_object_property: {
        description:
            "修改已打开文档中对象的属性。参数: package、doc、target（对象 id 或 name）、properties（键值对象，白名单：xy/width/height/scale/rotation/alpha/visible/name/text 等）。" +
            "graph 对象拒绝；非法/只读属性在 rejected 列出。内存态操作需 fgui_save_documents 持久化。",
        run: (bridge, params) => bridgeResult(bridge, "set_object_property", params),
    },
    fgui_add_controller: {
        description:
            "新增控制器。参数: package、doc、name、pages（页面名数组）、可选 selected（默认 0）。" +
            "页面与 selected 合法性在 handler 层校验。内存态操作需 fgui_save_documents 持久化。",
        run: (bridge, params) => bridgeResult(bridge, "add_controller", params),
    },
    fgui_update_controller: {
        description:
            "更新控制器（整体替换页面/选中页）。参数: package、doc、name、可选 pages、可选 selected。",
        run: (bridge, params) => bridgeResult(bridge, "update_controller", params),
    },
    fgui_remove_controller: {
        description:
            "删除控制器。参数: package、doc、name。被 gearDisplay/gearXY 等引用的控制器返回引用警告，不静默破坏。",
        run: (bridge, params) => bridgeResult(bridge, "remove_controller", params),
    },
    fgui_switch_page: {
        description:
            "切换控制器页面。参数: package、doc、name、index（目标页索引）或 page（目标页名）。目标页不存在返回结构化错误。",
        run: (bridge, params) => bridgeResult(bridge, "switch_page", params),
    },
    fgui_set_relation: {
        description:
            "设置对象关系。参数: package、doc、target（对象 id 或 name）、targetRelation（目标对象 id/name 或空=父级）、sidePair。" +
            "内置 sidePair ≤2 项与合法取值校验。内存态操作需 fgui_save_documents 持久化。",
        run: (bridge, params) => bridgeResult(bridge, "set_relation", params),
    },
    fgui_remove_relation: {
        description:
            "删除对象关系。参数: package、doc、target、targetRelation（目标对象 id/name 或空=父级）。",
        run: (bridge, params) => bridgeResult(bridge, "remove_relation", params),
    },
    fgui_create_package: {
        description: "新建包。参数: name（包名）。返回包 id/name。",
        run: (bridge, params) => bridgeResult(bridge, "create_package", params),
    },
    fgui_delete_package: {
        description:
            "删除包（破坏性）：先返回影响范围，调用方传 confirm: true 二次确认后才执行。参数: package、可选 confirm。",
        run: (bridge, params) => bridgeResult(bridge, "delete_package", params),
    },
    fgui_create_folder: {
        description: "在包内创建文件夹。参数: package、name、可选 path（父目录，默认 /）。",
        run: (bridge, params) => bridgeResult(bridge, "create_folder", params),
    },
    fgui_rename_resource: {
        description: "重命名资源。参数: package、name（原资源名）、newName。",
        run: (bridge, params) => bridgeResult(bridge, "rename_resource", params),
    },
    fgui_move_resource: {
        description: "移动资源到目标路径。参数: package、name、path（目标目录）。",
        run: (bridge, params) => bridgeResult(bridge, "move_resource", params),
    },
    fgui_delete_resource: {
        description:
            "删除资源（破坏性）：被其他组件引用时返回清单并拒绝，调用方传 confirm: true 二次确认。参数: package、name、可选 confirm。",
        run: (bridge, params) => bridgeResult(bridge, "delete_resource", params),
    },
    fgui_create_component: {
        description:
            "创建空组件资源（编辑器 FPackage.CreateComponentItem，id 由编辑器分配）。参数: package、name、可选 width/height（默认 100x100）、可选 path。",
        run: (bridge, params) => bridgeResult(bridge, "create_component", params),
    },
    fgui_copy_items: {
        description:
            "跨包复制组件（带依赖，CopyHandler 语义）。参数: sourcePackage、name、targetPackage、可选 targetPath。返回 id 映射。",
        run: (bridge, params) => bridgeResult(bridge, "copy_items", params),
    },
    fgui_list_branches: {
        description: "返回分支清单与活动分支。",
        run: (bridge, params) => bridgeResult(bridge, "list_branches", params),
    },
    fgui_switch_branch: {
        description: "切换活动分支。参数: branch（目标分支名，动态取自 allBranches，禁止硬编码）。",
        run: (bridge, params) => bridgeResult(bridge, "switch_branch", params),
    },
    fgui_capture_preview: {
        description:
            "截图采集（FairyGUI 官方路径：GetScreenShot + ImageConversion.EncodeToPNG），返回 PNG 路径供 visual-verifier 视觉核对（mode=fgui）。" +
            "编辑器不可达/截图失败返回结构化错误，不产生半截图像。",
        run: (bridge, params) => bridgeResult(bridge, "capture_preview", params),
    },
    fgui_open_component: {
        description:
            "独立打开组件文档并激活。参数: package、component。参考 FairyGUI-MCP handleOpenComponent。",
        run: (bridge, params) => bridgeResult(bridge, "open_component", params),
    },
    fgui_show_preview: {
        description: "预览组件（App.ShowPreview）。参数: package、component。参考 FairyGUI-MCP handlePreview。",
        run: (bridge, params) => bridgeResult(bridge, "show_preview", params),
    },
    fgui_select_element: {
        description:
            "选中文档中的元素。参数: package、doc、target（对象 id 或 name）。参考 FairyGUI-MCP handleSelectElement。",
        run: (bridge, params) => bridgeResult(bridge, "select_element", params),
    },
    fgui_close_document: {
        description: "关闭活动文档或指定文档。参数: 可选 package、可选 doc（组件名）。参考 FairyGUI-MCP handleClose。",
        run: (bridge, params) => bridgeResult(bridge, "close_document", params),
    },
    fgui_clear_logs: {
        description: "清空编辑器控制台日志（ConsoleView.Clear）。",
        run: (bridge, params) => bridgeResult(bridge, "clear_logs", params),
    },
    fgui_insert_component: {
        description:
            "向目标文档插入组件。参数: package（包名）、component（要插入的组件名）、doc（目标文档组件名）。" +
            "返回 inserted/isModified/childrenDelta/opDocIsActive；可见性需人工或截图确认。",
        run: (bridge, params) => bridgeResult(bridge, "insert_component", params),
    },
    fgui_trigger_publish: {
        description:
            "全自动发布指定包（PublishHandler.Run()）。参数: package（包名）、可选 branch（默认 activeBranch，空串=主干）、" +
            "可选 redirectToScratch（默认 true 重定向到 .objs 不碰真实产物；false 走真实发布路径）。" +
            "发布为异步操作，等待 onComplete 后返回 isSuccess/exportPath/elapsedMs；期间编辑器可能卡顿。",
        run: (bridge, params) => bridgeResult(bridge, "trigger_publish", params),
    },
    fgui_publish_all: {
        description:
            "全自动发布全部包（顺序遍历 allPackages，逐个 PublishHandler 发布）。参数: 可选 redirectToScratch（默认 true）、" +
            "可选 exclude（跳过包名数组）。deferred 异步，全部完成后返回逐包结果。参考 FairyGUI-MCP publish_all。",
        run: (bridge, params) => bridgeResult(bridge, "publish_all", params),
    },
};

/**
 * 检测工具：发布结果一致性检测（三重证据：信号 + 产物新鲜度 + validate --strict）。
 * 走外部文件检测（check-publish.ts），不依赖编辑器桥——发布动作已由用户在编辑器完成。
 */
export interface CheckPublishToolOptions {
    readonly signalPath: string;
    readonly project: import("./paths").FguiProjectInfo;
}

export const CHECK_PUBLISH_TOOL: {
    description: string;
    run: (options: CheckPublishToolOptions, params: Record<string, unknown>) => ToolResult;
} = {
    description:
        "检测发布结果与源一致性（三重证据：编辑器发布信号 + 产物 mtime 新鲜度 + validate --strict）。" +
        "参数: 可选 packages（指定包，默认取信号中的包或全部产物包）。" +
        "返回 evidence 与 mismatches；任一证据缺失判定失败。前置：用户在编辑器执行发布。",
    run: (options, params) => {
        const packages = (params["packages"] as string[] | undefined) ?? [];
        const result: CheckPublishResult = checkPublish(options.project, {
            signalPath: options.signalPath,
            packages,
        });
        return { ok: result.ok, data: result };
    },
};

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
