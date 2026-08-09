import FairyEditor = CS.FairyEditor;
import FairyGUI = CS.FairyGUI;
import { ProbeResultWriter, probeLog } from "./common/result";
import { runEnvProbe } from "./probes/env";
import { runInsertObjectProbe } from "./probes/insert-object";
import { runPublishHandlerProbe } from "./probes/publish-handler";
import { runHttpListenerProbe, runFileMailboxProbe } from "./probes/http-listener";
import { runPkgOpenProbe } from "./probes/pkg-open";
import { runSetTimeoutProbe } from "./probes/settimeout";
import { runImportResourceProbe } from "./probes/import-resource";
import { runCopyHandlerProbe } from "./probes/copy-handler";
import { runControllerProbe } from "./probes/controller";
import { runCaptureProbe } from "./probes/capture";
import { MailboxServer } from "./mailbox/server";
import {
    handleGetActiveContext,
    handleListPackages,
    handleListResources,
    handleQueryDependencies,
    handleReadPublishSettings,
    handleReadProjectSettings,
    handleFullSearch,
    handleReadDocument,
    handleListControllers,
    handleGetSelection,
    handleGetComponentInfo,
    handleGetLogs,
    createFindResourcesHandler,
} from "./mailbox/handlers";
import {
    handleAddChild,
    handleDeleteChild,
    handleInsertComponent,
    handleRefreshProject,
    handleRestorePublishSettings,
    handleSaveDocuments,
    handleSetObjectProperty,
    handleSwitchPublishSettings,
    handleAddController,
    handleUpdateController,
    handleRemoveController,
    handleSwitchPage,
    handleSetRelation,
    handleRemoveRelation,
    handleCreatePackage,
    handleDeletePackage,
    handleCreateFolder,
    handleRenameResource,
    handleMoveResource,
    handleDeleteResource,
    handleCreateComponent,
    handleCopyItems,
    handleListBranches,
    handleSwitchBranch,
    handleReloadPackage,
    handleOpenComponent,
    handleShowPreview,
    handleSelectElement,
    handleCloseDocument,
    handleClearLogs,
    createImportResourceHandler,
    createCapturePreviewHandler,
} from "./mailbox/handlers-write";
import { writePublishSignal } from "./mailbox/publish-signal";
import { createTriggerPublishHandler, createPublishAllHandler } from "./mailbox/handlers-publish";

const App = FairyEditor.App;

/** onPublish 钩子是否经 PublishHandler.Run() 路径触发（由 publish-handler 探针读取） */
(globalThis as any).__fguiMcpProbe_onPublishFired = false;

/** 邮箱服务器：响应 MCP server 的读请求（阶段 1 读工具）。 */
let mailboxServer: MailboxServer | null = null;
/** 驱动回调句柄：onDestroy/刷新时必须对称移除，否则旧实例的 tick 持续运行 */
let updateHandler: (() => void) | null = null;
let timerHandler: (() => void) | null = null;
/**
 * 邮箱服务器守卫（globalThis 承载）：
 * 防同一 JS 环境内重复启动；跨环境的重复由 init() 的文件锁兜底。
 * 注：宿主会在两个隔离 JS 环境各执行一次 main.js，globalThis 跨环境不共享。
 */
const g = globalThis as any;

/**
 * 允许 Unity 编辑器后台运行：默认窗口失焦/后台时 Unity 暂停主循环，
 * 插件 add_onUpdate/Timers 均不驱动 → 邮箱轮询停摆（聚焦依赖问题根因）。
 * 设 runInBackground=true 后，后台也跑主循环，定时器照常触发。
 * 注意：F5 预览/部分模式会覆盖该标志，需在每个轮询驱动里持续重置（FairyGUI-MCP 同款模式）。
 */
function ensureRunInBackground(): void {
    try {
        CS.UnityEngine.Application.runInBackground = true;
    } catch {
        /* 设置失败则保持默认行为（前台才轮询） */
    }
}

/** 停止邮箱服务器驱动：移除 add_onUpdate 回调与 Timers 定时器。刷新/卸载/重建前必须调用。 */
function stopMailboxServer(): void {
    if (updateHandler) {
        try {
            App.remove_onUpdate(updateHandler);
        } catch {
            /* 忽略移除异常 */
        }
        updateHandler = null;
    }
    if (timerHandler) {
        try {
            FairyGUI.Timers.inst.Remove(timerHandler);
        } catch {
            /* 忽略移除异常 */
        }
        timerHandler = null;
    }
    mailboxServer = null;
}

function buildMailboxServer(objsPath: string): void {
    // 启动新实例前先停掉旧实例的驱动，避免刷新/重建后两个 server 同时 tick 竞争
    stopMailboxServer();
    mailboxServer = new MailboxServer(CS.System.IO.Path.Combine(objsPath, "fgui-mcp-probe", "mailbox"));
    mailboxServer.register("list_packages", handleListPackages);
    mailboxServer.register("list_resources", handleListResources);
    mailboxServer.register("query_dependencies", handleQueryDependencies);
    mailboxServer.register("read_publish_settings", handleReadPublishSettings);
    mailboxServer.register("get_active_context", handleGetActiveContext);
    mailboxServer.register("read_project_settings", handleReadProjectSettings);
    mailboxServer.register("full_search", handleFullSearch);
    mailboxServer.register("read_document", handleReadDocument);
    mailboxServer.register("list_controllers", handleListControllers);
    mailboxServer.register("get_selection", handleGetSelection);
    mailboxServer.register("get_component_info", handleGetComponentInfo);
    mailboxServer.register("get_logs", handleGetLogs);
    mailboxServer.register("find_unused_resources", createFindResourcesHandler("unused", mailboxServer));
    mailboxServer.register("find_duplicate_resources", createFindResourcesHandler("duplicate", mailboxServer));
    mailboxServer.register("switch_publish_settings", handleSwitchPublishSettings);
    mailboxServer.register("restore_publish_settings", handleRestorePublishSettings);
    mailboxServer.register("refresh_project", handleRefreshProject);
    mailboxServer.register("save_documents", handleSaveDocuments);
    mailboxServer.register("import_resource", createImportResourceHandler(mailboxServer));
    mailboxServer.register("add_child", handleAddChild);
    mailboxServer.register("delete_child", handleDeleteChild);
    mailboxServer.register("set_object_property", handleSetObjectProperty);
    mailboxServer.register("add_controller", handleAddController);
    mailboxServer.register("update_controller", handleUpdateController);
    mailboxServer.register("remove_controller", handleRemoveController);
    mailboxServer.register("switch_page", handleSwitchPage);
    mailboxServer.register("set_relation", handleSetRelation);
    mailboxServer.register("remove_relation", handleRemoveRelation);
    mailboxServer.register("create_package", handleCreatePackage);
    mailboxServer.register("delete_package", handleDeletePackage);
    mailboxServer.register("create_folder", handleCreateFolder);
    mailboxServer.register("rename_resource", handleRenameResource);
    mailboxServer.register("move_resource", handleMoveResource);
    mailboxServer.register("delete_resource", handleDeleteResource);
    mailboxServer.register("create_component", handleCreateComponent);
    mailboxServer.register("copy_items", handleCopyItems);
    mailboxServer.register("list_branches", handleListBranches);
    mailboxServer.register("switch_branch", handleSwitchBranch);
    mailboxServer.register("reload_package", handleReloadPackage);
    mailboxServer.register("open_component", handleOpenComponent);
    mailboxServer.register("show_preview", handleShowPreview);
    mailboxServer.register("select_element", handleSelectElement);
    mailboxServer.register("close_document", handleCloseDocument);
    mailboxServer.register("clear_logs", handleClearLogs);
    mailboxServer.register("capture_preview", createCapturePreviewHandler(mailboxServer));
    mailboxServer.register("insert_component", handleInsertComponent);
    mailboxServer.register("trigger_publish", createTriggerPublishHandler(mailboxServer));
    mailboxServer.register("publish_all", createPublishAllHandler(mailboxServer));
    const server = mailboxServer;

    // 双驱动轮询：add_onUpdate（有帧时响应）与 Timers.inst（真实时间调度）。
    // 哪个可用都能驱动 tick；tick 内部有 300ms 时间门控，双驱动天然去重。
    // 关键：持续重置 runInBackground，确保窗口后台时主循环仍运行、定时器仍触发（根治聚焦依赖）。
    ensureRunInBackground();
    updateHandler = (): void => {
        ensureRunInBackground();
        server.tick();
    };
    App.add_onUpdate(updateHandler);
    try {
        timerHandler = (): void => {
            ensureRunInBackground();
            server.tick();
            if (timerHandler) {
                FairyGUI.Timers.inst.Add(0.3, 1, timerHandler);
            }
        };
        FairyGUI.Timers.inst.Add(0.3, 1, timerHandler);
    } catch (e: any) {
        probeLog(`Timers 驱动不可用（回退 add_onUpdate）: ${e}`);
    }

    // 全局守卫携带实例与绑定目录，第二个模块实例据此跳过
    g.__fguiMcpProbe_mailboxServer = mailboxServer;
    g.__fguiMcpProbe_mailboxObjsPath = objsPath;
    probeLog(`FGUI MCP 邮箱服务器启动: ${CS.System.IO.Path.Combine(objsPath, "fgui-mcp-probe", "mailbox")}`);
}

function startMailboxServer(): void {
    const objsPath = App.project ? App.project.objsPath : "";
    if (!objsPath) return;

    // 全局守卫：另一实例已启动且绑定同一目录 → 跳过；目录不同 → 重建
    if (g.__fguiMcpProbe_mailboxServer) {
        if (g.__fguiMcpProbe_mailboxObjsPath === objsPath) {
            probeLog("邮箱服务器已在另一实例启动，跳过");
            return;
        }
        probeLog(`工程目录变化（${g.__fguiMcpProbe_mailboxObjsPath} → ${objsPath}），重建邮箱服务器`);
    }
    if (mailboxServer && g.__fguiMcpProbe_mailboxObjsPath === objsPath) return;
    buildMailboxServer(objsPath);
}

/**
 * 注册"工具 > FGUI MCP 探针"菜单。
 * 幂等：先移除同名旧项再重建，避免热重载/工程重开导致的重复菜单项。
 */
function registerMenu(): void {
    const toolMenu = App.menu.GetSubMenu("tool");
    const probeMenuName = "fgui-mcp-probe";
    try {
        toolMenu.RemoveItem(probeMenuName);
    } catch {
        /* 首次注册无旧项 */
    }
    toolMenu.AddItem("FGUI MCP 探针", probeMenuName, -1, true, null);
    const probeMenu = toolMenu.GetSubMenu(probeMenuName);

    probeMenu.AddItem("环境快照", "env", () => runEnvProbe());
    probeMenu.AddItem("InsertObject", "insert-object", () => runInsertObjectProbe());
    probeMenu.AddItem("PublishHandler.Run", "publish-handler", () => runPublishHandlerProbe());
    probeMenu.AddItem("HttpListener", "http-listener", () => runHttpListenerProbe());
    probeMenu.AddItem("文件邮箱", "file-mailbox", () => runFileMailboxProbe());
    probeMenu.AddItem("setTimeout", "settimeout", () => runSetTimeoutProbe());
    probeMenu.AddItem("pkg.Open", "pkg-open", () => runPkgOpenProbe());
    probeMenu.AddItem("ImportResource", "import-resource", () => runImportResourceProbe());
    probeMenu.AddItem("CopyHandler", "copy-handler", () => runCopyHandlerProbe());
    probeMenu.AddItem("Controller", "controller", () => runControllerProbe());
    probeMenu.AddItem("截图采集", "capture", () => runCaptureProbe());
    probeMenu.AddSeperator();
    probeMenu.AddItem("启动邮箱服务器", "mailbox-start", () => startMailboxServer());
    probeMenu.AddItem("运行全部探针", "run-all", () => {
        runEnvProbe();
        runInsertObjectProbe();
        runPublishHandlerProbe();
        runHttpListenerProbe();
        runFileMailboxProbe();
        runPkgOpenProbe();
        runSetTimeoutProbe();
        runImportResourceProbe();
        runCopyHandlerProbe();
        runControllerProbe();
        runCaptureProbe();
        probeLog(`全部探针执行完毕，结果见 ${ProbeResultWriter.getResultsFile()}`);
    });

    probeLog("FGUI MCP 探针菜单注册完成");
}

/**
 * 一次性初始化：注册菜单 + 启动邮箱服务器。
 * 跨环境守卫用文件系统锁（.objs/fgui-mcp-probe/.initialized）：
 * 实测宿主会在两个隔离 JS 环境各执行一次 main.js（两环境可能并发，非严格串行），
 * globalThis 跨环境不共享。check-then-act（Exists+WriteAllText）有竞态，
 * 必须用原子创建（FileMode.CreateNew：文件已存在即抛异常）让第二个环境独占失败后跳过。
 */
function init(): void {
    const objsPath = App.project ? App.project.objsPath : "";
    if (!objsPath) return;
    const lockPath = `${objsPath}/fgui-mcp-probe/.initialized`;
    // 原子独占锁：CreateNew 在文件已存在时抛 IOException → 该环境已初始化，跳过
    let stream: any;
    try {
        stream = CS.System.IO.File.Open(lockPath, CS.System.IO.FileMode.CreateNew);
    } catch (e: any) {
        probeLog(`插件已在另一环境初始化，跳过（${e && e.message ? e.message : e}）`);
        return;
    } finally {
        if (stream) stream.Close();
    }
    try {
        registerMenu();
        startMailboxServer();
        probeLog("FGUI MCP 探针插件加载完成");
    } catch (e: any) {
        console.log(`[fgui-mcp-probe] 加载异常: ${e}`);
    }
}

// 顶层副作用：单一触发面——工程已打开则立即初始化，否则挂一次 onProjectOpened 事件。
// 不做双路径，避免"立即 + 事件"两个触发面放大宿主的双环境求值。
try {
    if (App.project) {
        init();
    } else {
        App.add_onProjectOpened(init);
    }
} catch (e: any) {
    console.log(`[fgui-mcp-probe] 加载异常: ${e}`);
}

// 生命周期钩子：记录发布事件，供 publish-handler 探针交叉验证
export function onPublishStart(pkgs: CS.System.Array$1<CS.FairyEditor.FPackage>): void {
    const names: string[] = [];
    for (let i = 0; i < pkgs.Length; i++) names.push(pkgs.get_Item(i).name);
    ProbeResultWriter.record("hook-publish-start", { packages: names });
    probeLog(`onPublishStart 触发，包: ${names.join(",")}`);
}

export function onPublish(handler: CS.FairyEditor.PublishHandler): void {
    (globalThis as any).__fguiMcpProbe_onPublishFired = true;
    ProbeResultWriter.record("hook-publish", {
        pkg: handler.pkg ? handler.pkg.name : null,
        fileName: handler.fileName,
        genCode: handler.genCode,
        exportPath: handler.exportPath,
    });
    probeLog(`onPublish 触发 pkg=${handler.pkg ? handler.pkg.name : "?"}`);
}

export function onPublishEnd(pkgs: CS.System.Array$1<CS.FairyEditor.FPackage>): void {
    const names: string[] = [];
    for (let i = 0; i < pkgs.Length; i++) names.push(pkgs.get_Item(i).name);
    ProbeResultWriter.record("hook-publish-end", { packages: names });
    // 半自动闭环：写发布信号邮箱文件，MCP 侧据此判定"发布动作已发生"
    const project = App.project;
    if (project) {
        const publishSettings = project.GetSettings("Publish") as any;
        const path = writePublishSignal({
            ok: true,
            ts: new Date().toISOString(),
            packages: names,
            exportPath: publishSettings?.path ?? "",
            isSuccess: true,
        });
        probeLog(`onPublishEnd 触发，包: ${names.join(",")}，信号已写 ${path}`);
    } else {
        probeLog(`onPublishEnd 触发，包: ${names.join(",")}`);
    }
}

export function onDestroy(): void {
    // 停止驱动（add_onUpdate/Timers 对称移除）——刷新/卸载后旧实例不再 tick，避免与重建实例竞争
    stopMailboxServer();
    delete g.__fguiMcpProbe_mailboxServer;
    delete g.__fguiMcpProbe_mailboxObjsPath;
    // 对称清理：删除初始化锁，允许下次激活重新初始化
    try {
        const lockPath = App.project
            ? `${App.project.objsPath}/fgui-mcp-probe/.initialized`
            : "";
        if (lockPath) CS.System.IO.File.Delete(lockPath);
    } catch {
        /* 锁文件不存在则忽略 */
    }
    try {
        const toolMenu = App.menu.GetSubMenu("tool");
        toolMenu.RemoveItem("fgui-mcp-probe");
    } catch {
        /* 菜单已不存在则忽略 */
    }
    probeLog("FGUI MCP 探针插件卸载");
}
