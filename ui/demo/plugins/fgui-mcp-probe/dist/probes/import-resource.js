"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runImportResourceProbe = runImportResourceProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runImportResourceProbe() {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        result_1.ProbeResultWriter.record("import-resource", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const pkg = project.GetPackageByName("Demo");
    if (!pkg) {
        result_1.ProbeResultWriter.record("import-resource", { status: "blocked", reason: "Demo 包不存在" });
        return;
    }
    const srcPng = `${project.assetsPath}/Demo/img/background.png`;
    if (!CS.System.IO.File.Exists(srcPng)) {
        result_1.ProbeResultWriter.record("import-resource", { status: "blocked", reason: `源 PNG 不存在: ${srcPng}` });
        return;
    }
    const beforeIds = snapshotPkgItems(pkg).map((i) => i.id);
    const pathAResult = {};
    try {
        const task = pkg.ImportResource(srcPng, "/", "ProbeImportA");
        pathAResult["taskReturned"] = task != null;
        try {
            pathAResult["taskIsCompleted"] = task.IsCompleted;
            pathAResult["taskIsFaulted"] = task.IsFaulted;
        }
        catch (e) {
            pathAResult["taskStatusReadError"] = String(e && e.message ? e.message : e);
        }
    }
    catch (e) {
        pathAResult["error"] = String(e && e.message ? e.message : e);
    }
    const afterA = snapshotPkgItems(pkg);
    const pathBResult = {};
    try {
        const queue = FairyEditor.ResourceImportQueue.Create(pkg);
        queue.Add(srcPng, "/", "ProbeImportB");
        let cbFired = false;
        queue.Process((items) => {
            cbFired = true;
            const rows = [];
            if (items) {
                for (let i = 0; i < items.Count; i++) {
                    const item = items.get_Item(i);
                    rows.push({ id: item.id, name: item.name, path: item.path });
                }
            }
            pathBResult["callbackFired"] = true;
            pathBResult["importedItems"] = rows;
            result_1.ProbeResultWriter.record("import-resource", {
                status: rows.length ? "pass" : "empty-callback",
                pathA: pathAResult,
                pathB: pathBResult,
                srcPng,
                importedItemTypes: afterA.filter((i) => i.name.startsWith("ProbeImport")).map((i) => ({ name: i.name, type: i.type })),
                cleanupNote: "异步导入占用文件锁，物理文件延迟清理（Timers 2s 后删除 ProbeImport*）",
            });
            (0, result_1.probeLog)(`ResourceImportQueue 回调 items=${rows.length}，延迟清理 ProbeImport* 物理文件`);
            const doCleanup = () => {
                const cleaned = [];
                const cleanFailed = [];
                const current = snapshotPkgItems(pkg);
                for (const it of current) {
                    if (it.name.startsWith("ProbeImport")) {
                        const pi = pkg.FindItemByName(it.name);
                        if (pi) {
                            try {
                                pkg.DeleteItem(pi);
                                cleaned.push(it.name);
                            }
                            catch (e) {
                                cleanFailed.push(`${it.name}(${e && e.message ? e.message : e})`);
                            }
                        }
                    }
                }
                try {
                    pkg.Save();
                }
                catch {
                }
                if (cleanFailed.length) {
                    (0, result_1.probeLog)(`ProbeImport 延迟清理部分失败: ${cleanFailed.join("; ")}（需人工清理 Demo/ProbeImport* 文件）`);
                }
                else {
                    (0, result_1.probeLog)(`ProbeImport 延迟清理完成: ${cleaned.join(",") || "无残留"}`);
                }
            };
            try {
                CS.FairyGUI.Timers.inst.Add(2, 1, doCleanup);
            }
            catch {
                doCleanup();
            }
        });
        if (!cbFired) {
            pathBResult["callbackFired"] = cbFired;
            (0, result_1.probeLog)("ResourceImportQueue.Process 未同步触发回调（可能异步，等待 onComplete 后回填）");
        }
    }
    catch (e) {
        pathBResult["error"] = String(e && e.message ? e.message : e);
        result_1.ProbeResultWriter.record("import-resource", { status: "error", pathA: pathAResult, pathB: pathBResult });
    }
}
function snapshotPkgItems(pkg) {
    const rows = [];
    const items = pkg.items;
    if (!items)
        return rows;
    for (let i = 0; i < items.Count; i++) {
        const item = items.get_Item(i);
        rows.push({ id: item.id, name: item.name, path: item.path, type: item.type });
    }
    return rows;
}
//# sourceMappingURL=import-resource.js.map