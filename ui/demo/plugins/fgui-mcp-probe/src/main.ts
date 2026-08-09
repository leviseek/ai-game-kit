import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "./common/result";
import { runEnvProbe } from "./probes/env";
import { runInsertObjectProbe } from "./probes/insert-object";
import { runPublishHandlerProbe } from "./probes/publish-handler";
import { runHttpListenerProbe, runFileMailboxProbe } from "./probes/http-listener";
import { runPkgOpenProbe } from "./probes/pkg-open";

const App = FairyEditor.App;

/** onPublish 钩子是否经 PublishHandler.Run() 路径触发（由 publish-handler 探针读取） */
(globalThis as any).__fguiMcpProbe_onPublishFired = false;

/** 注册"工具 > FGUI MCP 探针"菜单 */
function registerMenu(): void {
    const toolMenu = App.menu.GetSubMenu("tool");
    const probeMenuName = "fgui-mcp-probe";
    toolMenu.AddItem("FGUI MCP 探针", probeMenuName, -1, true, null);
    const probeMenu = toolMenu.GetSubMenu(probeMenuName);

    probeMenu.AddItem("环境快照", "env", () => runEnvProbe());
    probeMenu.AddItem("InsertObject", "insert-object", () => runInsertObjectProbe());
    probeMenu.AddItem("PublishHandler.Run", "publish-handler", () => runPublishHandlerProbe());
    probeMenu.AddItem("HttpListener", "http-listener", () => runHttpListenerProbe());
    probeMenu.AddItem("文件邮箱", "file-mailbox", () => runFileMailboxProbe());
    probeMenu.AddItem("pkg.Open", "pkg-open", () => runPkgOpenProbe());
    probeMenu.AddSeperator();
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

// 顶层副作用：工程打开即注册菜单（与三个示例同构）
try {
    App.add_onProjectOpened(() => {
        registerMenu();
    });
    if (App.project) {
        registerMenu();
    }
    probeLog("FGUI MCP 探针插件加载完成");
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
    try {
        const toolMenu = App.menu.GetSubMenu("tool");
        toolMenu.RemoveItem("fgui-mcp-probe");
    } catch {
        /* 菜单已不存在则忽略 */
    }
    probeLog("FGUI MCP 探针插件卸载");
}
