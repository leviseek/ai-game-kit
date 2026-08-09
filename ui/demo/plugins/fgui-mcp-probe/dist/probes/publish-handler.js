"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPublishHandlerProbe = runPublishHandlerProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runPublishHandlerProbe() {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        result_1.ProbeResultWriter.record("publish-handler", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const pkgName = "Demo";
    const pkg = project.GetPackageByName(pkgName);
    if (!pkg) {
        result_1.ProbeResultWriter.record("publish-handler", { status: "blocked", reason: `包 ${pkgName} 不存在` });
        return;
    }
    const scratchOut = `${project.objsPath}/fgui-mcp-probe/publish-out/${pkgName}`;
    const allBranches = [];
    const branches = project.allBranches;
    if (branches) {
        for (let i = 0; i < branches.Count; i++)
            allBranches.push(branches.get_Item(i));
    }
    try {
        let handler;
        let ctorMode;
        try {
            handler = new FairyEditor.PublishHandler(pkg, project.activeBranch);
            ctorMode = `activeBranch: "${project.activeBranch}"`;
        }
        catch (e) {
            const err1 = String(e && e.message ? e.message : e);
            try {
                handler = new FairyEditor.PublishHandler();
                ctorMode = `activeBranch 构造失败(${err1})，回退无参构造成功`;
            }
            catch (e2) {
                result_1.ProbeResultWriter.record("publish-handler", {
                    status: "error",
                    activeBranch: project.activeBranch,
                    allBranches,
                    ctorError: err1,
                    ctorError2: String(e2 && e2.message ? e2.message : e2),
                });
                return;
            }
        }
        globalThis.__fguiMcpProbe_onPublishFired = false;
        const completed = { fired: false, ts: "" };
        handler.add_onComplete(() => {
            completed.fired = true;
            completed.ts = new Date().toISOString();
            (0, result_1.probeLog)(`publish-handler onComplete 触发 isSuccess=${handler.isSuccess} exportPath=${handler.exportPath}`);
            result_1.ProbeResultWriter.record("publish-handler", {
                status: "complete-callback",
                isSuccess: handler.isSuccess,
                exportPath: handler.exportPath,
                onCompleteFired: true,
                onPublishHookFired: globalThis.__fguiMcpProbe_onPublishFired,
                ctorMode,
                allBranches,
            });
        });
        handler.exportPath = scratchOut;
        handler.genCode = false;
        const t0 = Date.now();
        let runReturnedSync = false;
        try {
            handler.Run();
            const elapsed = Date.now() - t0;
            runReturnedSync = true;
            (0, result_1.probeLog)(`Run() 同步返回，耗时 ${elapsed}ms（若远小于发布时长则说明内部异步）`);
        }
        catch (e) {
            result_1.ProbeResultWriter.record("publish-handler", {
                status: "error",
                error: String(e && e.message ? e.message : e),
                runReturnedSync: false,
            });
            return;
        }
        const deadline = Date.now() + 60000;
        const handle = { active: true };
        const poll = () => {
            if (!handle.active)
                return;
            if (handler.isSuccess || handler.paused || Date.now() >= deadline) {
                handle.active = false;
                App.remove_onUpdate(poll);
                const elapsed = Date.now() - t0;
                if (handler.isSuccess) {
                    (0, result_1.probeLog)(`发布完成 isSuccess=true 总耗时 ${elapsed}ms`);
                }
                result_1.ProbeResultWriter.record("publish-handler", {
                    status: handler.isSuccess ? "pass" : "pending-callback",
                    isSuccess: handler.isSuccess,
                    exportPath: handler.exportPath,
                    fileName: handler.fileName,
                    elapsedMs: elapsed,
                    runReturnedSync,
                    onCompleteFired: completed.fired,
                    onPublishHookFired: globalThis.__fguiMcpProbe_onPublishFired,
                    scratchOut,
                    ctorMode,
                    allBranches,
                });
            }
        };
        App.add_onUpdate(poll);
    }
    catch (e) {
        result_1.ProbeResultWriter.record("publish-handler", {
            status: "error",
            error: String(e && e.message ? e.message : e),
        });
    }
}
//# sourceMappingURL=publish-handler.js.map