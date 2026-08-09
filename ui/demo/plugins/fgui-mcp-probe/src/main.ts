import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "./common/result";
import { runEnvProbe } from "./probes/env";
import { runInsertObjectProbe } from "./probes/insert-object";
import { runPublishHandlerProbe } from "./probes/publish-handler";
import { runHttpListenerProbe, runFileMailboxProbe } from "./probes/http-listener";
import { runPkgOpenProbe } from "./probes/pkg-open";
import { MailboxServer } from "./mailbox/server";
import {
    handleGetActiveContext,
    handleListPackages,
    handleListResources,
    handleQueryDependencies,
    handleReadPublishSettings,
} from "./mailbox/handlers";

const App = FairyEditor.App;

/** onPublish 钩子是否经 PublishHandler.Run() 路径触发（由 publish-handler 探针读取） */
(globalThis as any).__fguiMcpProbe_onPublishFired = false;

/** 邮箱服务器：响应 MCP server 的读请求（阶段 1 读工具）。 */
let mailboxServer: MailboxServer | null = null;
/**
 * 邮箱服务器守卫（globalThis 承载）：
 * 防同一 JS 环境内重复启动；跨环境的重复由 init() 的文件锁兜底。
 * 注：宿主会在两个隔离 JS 环境各执行一次 main.js，globalThis 跨环境不共享。
 */
const g = globalThis as any;

function buildMailboxServer(objsPath: string): void {
    mailboxServer = new MailboxServer(CS.System.IO.Path.Combine(objsPath, "fgui-mcp-probe", "mailbox"));
    mailboxServer.register("list_packages", handleListPackages);
    mailboxServer.register("list_resources", handleListResources);
    mailboxServer.register("query_dependencies", handleQueryDependencies);
    mailboxServer.register("read_publish_settings", handleReadPublishSettings);
    mailboxServer.register("get_active_context", handleGetActiveContext);
    App.add_onUpdate(() => mailboxServer?.tick());
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
    probeMenu.AddItem("pkg.Open", "pkg-open", () => runPkgOpenProbe());
    probeMenu.AddSeperator();
    probeMenu.AddItem("启动邮箱服务器", "mailbox-start", () => startMailboxServer());
    probeMenu.AddItem("运行全部探针", "run-all", () => {
        runEnvProbe();
        runInsertObjectProbe();
        runPublishHandlerProbe();
        runHttpListenerProbe();
        runFileMailboxProbe();
        runPkgOpenProbe();
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
    probeLog(`onPublishEnd 触发，包: ${names.join(",")}`);
}

export function onDestroy(): void {
    mailboxServer = null;
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
