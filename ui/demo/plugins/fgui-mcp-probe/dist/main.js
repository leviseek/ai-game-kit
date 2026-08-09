"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPublishStart = onPublishStart;
exports.onPublish = onPublish;
exports.onPublishEnd = onPublishEnd;
exports.onDestroy = onDestroy;
var FairyEditor = CS.FairyEditor;
var FairyGUI = CS.FairyGUI;
const result_1 = require("./common/result");
const env_1 = require("./probes/env");
const insert_object_1 = require("./probes/insert-object");
const publish_handler_1 = require("./probes/publish-handler");
const http_listener_1 = require("./probes/http-listener");
const pkg_open_1 = require("./probes/pkg-open");
const settimeout_1 = require("./probes/settimeout");
const server_1 = require("./mailbox/server");
const handlers_1 = require("./mailbox/handlers");
const handlers_write_1 = require("./mailbox/handlers-write");
const publish_signal_1 = require("./mailbox/publish-signal");
const handlers_publish_1 = require("./mailbox/handlers-publish");
const App = FairyEditor.App;
globalThis.__fguiMcpProbe_onPublishFired = false;
let mailboxServer = null;
let updateHandler = null;
let timerHandler = null;
const g = globalThis;
function ensureRunInBackground() {
    try {
        CS.UnityEngine.Application.runInBackground = true;
    }
    catch {
    }
}
function stopMailboxServer() {
    if (updateHandler) {
        try {
            App.remove_onUpdate(updateHandler);
        }
        catch {
        }
        updateHandler = null;
    }
    if (timerHandler) {
        try {
            FairyGUI.Timers.inst.Remove(timerHandler);
        }
        catch {
        }
        timerHandler = null;
    }
    mailboxServer = null;
}
function buildMailboxServer(objsPath) {
    stopMailboxServer();
    mailboxServer = new server_1.MailboxServer(CS.System.IO.Path.Combine(objsPath, "fgui-mcp-probe", "mailbox"));
    mailboxServer.register("list_packages", handlers_1.handleListPackages);
    mailboxServer.register("list_resources", handlers_1.handleListResources);
    mailboxServer.register("query_dependencies", handlers_1.handleQueryDependencies);
    mailboxServer.register("read_publish_settings", handlers_1.handleReadPublishSettings);
    mailboxServer.register("get_active_context", handlers_1.handleGetActiveContext);
    mailboxServer.register("switch_publish_settings", handlers_write_1.handleSwitchPublishSettings);
    mailboxServer.register("restore_publish_settings", handlers_write_1.handleRestorePublishSettings);
    mailboxServer.register("refresh_project", handlers_write_1.handleRefreshProject);
    mailboxServer.register("insert_component", handlers_write_1.handleInsertComponent);
    mailboxServer.register("trigger_publish", (0, handlers_publish_1.createTriggerPublishHandler)(mailboxServer));
    const server = mailboxServer;
    ensureRunInBackground();
    updateHandler = () => {
        ensureRunInBackground();
        server.tick();
    };
    App.add_onUpdate(updateHandler);
    try {
        timerHandler = () => {
            ensureRunInBackground();
            server.tick();
            if (timerHandler) {
                FairyGUI.Timers.inst.Add(0.3, 1, timerHandler);
            }
        };
        FairyGUI.Timers.inst.Add(0.3, 1, timerHandler);
    }
    catch (e) {
        (0, result_1.probeLog)(`Timers 驱动不可用（回退 add_onUpdate）: ${e}`);
    }
    g.__fguiMcpProbe_mailboxServer = mailboxServer;
    g.__fguiMcpProbe_mailboxObjsPath = objsPath;
    (0, result_1.probeLog)(`FGUI MCP 邮箱服务器启动: ${CS.System.IO.Path.Combine(objsPath, "fgui-mcp-probe", "mailbox")}`);
}
function startMailboxServer() {
    const objsPath = App.project ? App.project.objsPath : "";
    if (!objsPath)
        return;
    if (g.__fguiMcpProbe_mailboxServer) {
        if (g.__fguiMcpProbe_mailboxObjsPath === objsPath) {
            (0, result_1.probeLog)("邮箱服务器已在另一实例启动，跳过");
            return;
        }
        (0, result_1.probeLog)(`工程目录变化（${g.__fguiMcpProbe_mailboxObjsPath} → ${objsPath}），重建邮箱服务器`);
    }
    if (mailboxServer && g.__fguiMcpProbe_mailboxObjsPath === objsPath)
        return;
    buildMailboxServer(objsPath);
}
function registerMenu() {
    const toolMenu = App.menu.GetSubMenu("tool");
    const probeMenuName = "fgui-mcp-probe";
    try {
        toolMenu.RemoveItem(probeMenuName);
    }
    catch {
    }
    toolMenu.AddItem("FGUI MCP 探针", probeMenuName, -1, true, null);
    const probeMenu = toolMenu.GetSubMenu(probeMenuName);
    probeMenu.AddItem("环境快照", "env", () => (0, env_1.runEnvProbe)());
    probeMenu.AddItem("InsertObject", "insert-object", () => (0, insert_object_1.runInsertObjectProbe)());
    probeMenu.AddItem("PublishHandler.Run", "publish-handler", () => (0, publish_handler_1.runPublishHandlerProbe)());
    probeMenu.AddItem("HttpListener", "http-listener", () => (0, http_listener_1.runHttpListenerProbe)());
    probeMenu.AddItem("文件邮箱", "file-mailbox", () => (0, http_listener_1.runFileMailboxProbe)());
    probeMenu.AddItem("setTimeout", "settimeout", () => (0, settimeout_1.runSetTimeoutProbe)());
    probeMenu.AddItem("pkg.Open", "pkg-open", () => (0, pkg_open_1.runPkgOpenProbe)());
    probeMenu.AddSeperator();
    probeMenu.AddItem("启动邮箱服务器", "mailbox-start", () => startMailboxServer());
    probeMenu.AddItem("运行全部探针", "run-all", () => {
        (0, env_1.runEnvProbe)();
        (0, insert_object_1.runInsertObjectProbe)();
        (0, publish_handler_1.runPublishHandlerProbe)();
        (0, http_listener_1.runHttpListenerProbe)();
        (0, http_listener_1.runFileMailboxProbe)();
        (0, pkg_open_1.runPkgOpenProbe)();
        (0, settimeout_1.runSetTimeoutProbe)();
        (0, result_1.probeLog)(`全部探针执行完毕，结果见 ${result_1.ProbeResultWriter.getResultsFile()}`);
    });
    (0, result_1.probeLog)("FGUI MCP 探针菜单注册完成");
}
function init() {
    const objsPath = App.project ? App.project.objsPath : "";
    if (!objsPath)
        return;
    const lockPath = `${objsPath}/fgui-mcp-probe/.initialized`;
    let stream;
    try {
        stream = CS.System.IO.File.Open(lockPath, CS.System.IO.FileMode.CreateNew);
    }
    catch (e) {
        (0, result_1.probeLog)(`插件已在另一环境初始化，跳过（${e && e.message ? e.message : e}）`);
        return;
    }
    finally {
        if (stream)
            stream.Close();
    }
    try {
        registerMenu();
        startMailboxServer();
        (0, result_1.probeLog)("FGUI MCP 探针插件加载完成");
    }
    catch (e) {
        console.log(`[fgui-mcp-probe] 加载异常: ${e}`);
    }
}
try {
    if (App.project) {
        init();
    }
    else {
        App.add_onProjectOpened(init);
    }
}
catch (e) {
    console.log(`[fgui-mcp-probe] 加载异常: ${e}`);
}
function onPublishStart(pkgs) {
    const names = [];
    for (let i = 0; i < pkgs.Length; i++)
        names.push(pkgs.get_Item(i).name);
    result_1.ProbeResultWriter.record("hook-publish-start", { packages: names });
    (0, result_1.probeLog)(`onPublishStart 触发，包: ${names.join(",")}`);
}
function onPublish(handler) {
    globalThis.__fguiMcpProbe_onPublishFired = true;
    result_1.ProbeResultWriter.record("hook-publish", {
        pkg: handler.pkg ? handler.pkg.name : null,
        fileName: handler.fileName,
        genCode: handler.genCode,
        exportPath: handler.exportPath,
    });
    (0, result_1.probeLog)(`onPublish 触发 pkg=${handler.pkg ? handler.pkg.name : "?"}`);
}
function onPublishEnd(pkgs) {
    const names = [];
    for (let i = 0; i < pkgs.Length; i++)
        names.push(pkgs.get_Item(i).name);
    result_1.ProbeResultWriter.record("hook-publish-end", { packages: names });
    const project = App.project;
    if (project) {
        const publishSettings = project.GetSettings("Publish");
        const path = (0, publish_signal_1.writePublishSignal)({
            ok: true,
            ts: new Date().toISOString(),
            packages: names,
            exportPath: publishSettings?.path ?? "",
            isSuccess: true,
        });
        (0, result_1.probeLog)(`onPublishEnd 触发，包: ${names.join(",")}，信号已写 ${path}`);
    }
    else {
        (0, result_1.probeLog)(`onPublishEnd 触发，包: ${names.join(",")}`);
    }
}
function onDestroy() {
    stopMailboxServer();
    delete g.__fguiMcpProbe_mailboxServer;
    delete g.__fguiMcpProbe_mailboxObjsPath;
    try {
        const lockPath = App.project
            ? `${App.project.objsPath}/fgui-mcp-probe/.initialized`
            : "";
        if (lockPath)
            CS.System.IO.File.Delete(lockPath);
    }
    catch {
    }
    try {
        const toolMenu = App.menu.GetSubMenu("tool");
        toolMenu.RemoveItem("fgui-mcp-probe");
    }
    catch {
    }
    (0, result_1.probeLog)("FGUI MCP 探针插件卸载");
}
//# sourceMappingURL=main.js.map