"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPublishStart = onPublishStart;
exports.onPublish = onPublish;
exports.onPublishEnd = onPublishEnd;
exports.onDestroy = onDestroy;
var FairyEditor = CS.FairyEditor;
const result_1 = require("./common/result");
const env_1 = require("./probes/env");
const insert_object_1 = require("./probes/insert-object");
const publish_handler_1 = require("./probes/publish-handler");
const http_listener_1 = require("./probes/http-listener");
const pkg_open_1 = require("./probes/pkg-open");
const App = FairyEditor.App;
globalThis.__fguiMcpProbe_onPublishFired = false;
function registerMenu() {
    const toolMenu = App.menu.GetSubMenu("tool");
    const probeMenuName = "fgui-mcp-probe";
    toolMenu.AddItem("FGUI MCP 探针", probeMenuName, -1, true, null);
    const probeMenu = toolMenu.GetSubMenu(probeMenuName);
    probeMenu.AddItem("环境快照", "env", () => (0, env_1.runEnvProbe)());
    probeMenu.AddItem("InsertObject", "insert-object", () => (0, insert_object_1.runInsertObjectProbe)());
    probeMenu.AddItem("PublishHandler.Run", "publish-handler", () => (0, publish_handler_1.runPublishHandlerProbe)());
    probeMenu.AddItem("HttpListener", "http-listener", () => (0, http_listener_1.runHttpListenerProbe)());
    probeMenu.AddItem("文件邮箱", "file-mailbox", () => (0, http_listener_1.runFileMailboxProbe)());
    probeMenu.AddItem("pkg.Open", "pkg-open", () => (0, pkg_open_1.runPkgOpenProbe)());
    probeMenu.AddSeperator();
    probeMenu.AddItem("运行全部探针", "run-all", () => {
        (0, env_1.runEnvProbe)();
        (0, insert_object_1.runInsertObjectProbe)();
        (0, publish_handler_1.runPublishHandlerProbe)();
        (0, http_listener_1.runHttpListenerProbe)();
        (0, http_listener_1.runFileMailboxProbe)();
        (0, pkg_open_1.runPkgOpenProbe)();
        (0, result_1.probeLog)(`全部探针执行完毕，结果见 ${result_1.ProbeResultWriter.getResultsFile()}`);
    });
    (0, result_1.probeLog)("FGUI MCP 探针菜单注册完成");
}
try {
    App.add_onProjectOpened(() => {
        registerMenu();
    });
    if (App.project) {
        registerMenu();
    }
    (0, result_1.probeLog)("FGUI MCP 探针插件加载完成");
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
    (0, result_1.probeLog)(`onPublishEnd 触发，包: ${names.join(",")}`);
}
function onDestroy() {
    try {
        const toolMenu = App.menu.GetSubMenu("tool");
        toolMenu.RemoveItem("fgui-mcp-probe");
    }
    catch {
    }
    (0, result_1.probeLog)("FGUI MCP 探针插件卸载");
}
//# sourceMappingURL=main.js.map