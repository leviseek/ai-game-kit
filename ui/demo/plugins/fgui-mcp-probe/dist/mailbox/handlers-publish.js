"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTriggerPublishHandler = createTriggerPublishHandler;
var FairyEditor = CS.FairyEditor;
const publish_signal_1 = require("./publish-signal");
const App = FairyEditor.App;
function createTriggerPublishHandler(server) {
    return (params) => {
        const project = App.project;
        if (!project)
            throw new Error("无打开工程");
        const packageName = params["package"];
        if (!packageName)
            throw new Error("缺少参数 package");
        const pkg = project.GetPackageByName(packageName);
        if (!pkg)
            throw new Error(`包不存在: ${packageName}`);
        let branch = project.activeBranch;
        const branchArg = params["branch"];
        if (branchArg !== undefined && branchArg !== "") {
            const branches = [];
            const all = project.allBranches;
            if (all) {
                for (let i = 0; i < all.Count; i++)
                    branches.push(all.get_Item(i));
            }
            if (!branches.includes(branchArg)) {
                throw new Error(`分支不存在: ${branchArg}（可用分支: ${branches.join(",") || "无（仅主干）"}）`);
            }
            branch = branchArg;
        }
        const reqId = params["__requestId"];
        if (!reqId)
            throw new Error("缺少请求 id（内部错误）");
        let handler;
        try {
            handler = new FairyEditor.PublishHandler(pkg, branch);
        }
        catch {
            handler = new FairyEditor.PublishHandler();
        }
        const redirect = params["redirectToScratch"] !== false;
        if (redirect) {
            handler.exportPath = `${project.objsPath}/fgui-mcp-probe/publish-out/${packageName}`;
        }
        handler.genCode = false;
        const t0 = Date.now();
        handler.add_onComplete(() => {
            const payload = {
                ok: handler.isSuccess,
                ts: new Date().toISOString(),
                packages: [packageName],
                exportPath: handler.exportPath,
                isSuccess: handler.isSuccess,
            };
            (0, publish_signal_1.writePublishSignal)(payload);
            server.writeResponse(reqId, {
                ok: true,
                result: {
                    status: handler.isSuccess ? "success" : "failed",
                    isSuccess: handler.isSuccess,
                    exportPath: handler.exportPath,
                    fileName: handler.fileName,
                    elapsedMs: Date.now() - t0,
                    packages: [packageName],
                },
            });
        });
        try {
            handler.Run();
        }
        catch (e) {
            server.writeResponse(reqId, {
                ok: false,
                error: String(e && e.message ? e.message : e),
            });
            return { id: reqId };
        }
        return { deferred: true, id: reqId };
    };
}
//# sourceMappingURL=handlers-publish.js.map