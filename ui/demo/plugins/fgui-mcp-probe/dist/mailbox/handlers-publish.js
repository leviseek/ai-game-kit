"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTriggerPublishHandler = createTriggerPublishHandler;
exports.createPublishAllHandler = createPublishAllHandler;
var FairyEditor = CS.FairyEditor;
const publish_signal_1 = require("./publish-signal");
const handlers_write_1 = require("./handlers-write");
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
        let savedInfo;
        try {
            savedInfo = (0, handlers_write_1.saveAllDocuments)();
        }
        catch (e) {
            const error = `发布前保存文档失败，已中止发布: ${e && e.message ? e.message : e}`;
            const reqId = params["__requestId"];
            if (reqId)
                server.writeResponse(reqId, { ok: false, error });
            throw new Error(error);
        }
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
                    savedBeforePublish: savedInfo.hadUnsaved,
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
function createPublishAllHandler(server) {
    return (params) => {
        const project = App.project;
        if (!project)
            throw new Error("无打开工程");
        try {
            (0, handlers_write_1.saveAllDocuments)();
        }
        catch (e) {
            const error = `发布前保存文档失败，已中止发布: ${e && e.message ? e.message : e}`;
            const reqId = params["__requestId"];
            if (reqId)
                server.writeResponse(reqId, { ok: false, error });
            throw new Error(error);
        }
        const reqId = params["__requestId"];
        if (!reqId)
            throw new Error("缺少请求 id（内部错误）");
        const exclude = params["exclude"] ?? [];
        const pkgs = [];
        const all = project.allPackages;
        if (all) {
            for (let i = 0; i < all.Count; i++) {
                const p = all.get_Item(i);
                if (!exclude.includes(p.name))
                    pkgs.push(p);
            }
        }
        if (pkgs.length === 0)
            throw new Error("无待发布包（可能全部被 exclude）");
        const redirect = params["redirectToScratch"] !== false;
        const results = [];
        const t0 = Date.now();
        const runNext = (index) => {
            if (index >= pkgs.length) {
                const failedCount = results.filter((r) => !r.isSuccess).length;
                const payload = {
                    ok: failedCount === 0,
                    ts: new Date().toISOString(),
                    packages: results.map((r) => r.package),
                    exportPath: results[results.length - 1]?.exportPath ?? "",
                    isSuccess: failedCount === 0,
                };
                (0, publish_signal_1.writePublishSignal)(payload);
                server.writeResponse(reqId, {
                    ok: true,
                    result: {
                        status: failedCount === 0 ? "success" : "partial",
                        isSuccess: failedCount === 0,
                        total: results.length,
                        failedCount,
                        elapsedMs: Date.now() - t0,
                        packages: results,
                    },
                });
                return;
            }
            const pkg = pkgs[index];
            let handler;
            try {
                handler = new FairyEditor.PublishHandler(pkg, project.activeBranch);
            }
            catch {
                try {
                    handler = new FairyEditor.PublishHandler();
                }
                catch (e) {
                    results.push({ package: pkg.name, isSuccess: false, exportPath: "" });
                    runNext(index + 1);
                    return;
                }
            }
            if (redirect) {
                handler.exportPath = `${project.objsPath}/fgui-mcp-probe/publish-out/${pkg.name}`;
            }
            handler.genCode = false;
            handler.add_onComplete(() => {
                results.push({ package: pkg.name, isSuccess: handler.isSuccess, exportPath: handler.exportPath });
                runNext(index + 1);
            });
            try {
                handler.Run();
            }
            catch (e) {
                results.push({ package: pkg.name, isSuccess: false, exportPath: "" });
                runNext(index + 1);
            }
        };
        try {
            runNext(0);
        }
        catch (e) {
            server.writeResponse(reqId, { ok: false, error: String(e && e.message ? e.message : e) });
        }
        return { deferred: true, id: reqId };
    };
}
//# sourceMappingURL=handlers-publish.js.map