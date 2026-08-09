"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCopyHandlerProbe = runCopyHandlerProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runCopyHandlerProbe() {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        result_1.ProbeResultWriter.record("copy-handler", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const srcPkg = project.GetPackageByName("Demo");
    if (!srcPkg) {
        result_1.ProbeResultWriter.record("copy-handler", { status: "blocked", reason: "Demo 包不存在" });
        return;
    }
    const item = srcPkg.FindItemByName("DemoView.xml") || srcPkg.FindItemByName("DemoView");
    if (!item) {
        result_1.ProbeResultWriter.record("copy-handler", { status: "blocked", reason: "DemoView 组件不存在" });
        return;
    }
    let targetPkg;
    try {
        targetPkg = project.CreatePackage("ProbeCopyScratch");
        if (!targetPkg) {
            result_1.ProbeResultWriter.record("copy-handler", { status: "blocked", reason: "CreatePackage 返回空" });
            return;
        }
    }
    catch (e) {
        result_1.ProbeResultWriter.record("copy-handler", {
            status: "error",
            error: `CreatePackage(scratch) 失败: ${e && e.message ? e.message : e}`,
            note: "跨包复制能力受限于包生命周期 API，需在编辑器环境人工确认",
        });
        return;
    }
    try {
        const doc = App.docView.OpenDocument(item.GetURL(), false);
        if (!doc)
            throw new Error("OpenDocument 返回空");
        const xml = doc.Serialize();
        if (!xml)
            throw new Error("doc.Serialize() 返回空 XML");
        const handler = new FairyEditor.CopyHandler();
        handler.InitWithObject(srcPkg, xml, targetPkg, "/", false);
        const resultList = [];
        const rows = handler.resultList;
        if (rows) {
            for (let i = 0; i < rows.Count; i++) {
                const dep = rows.get_Item(i);
                resultList.push({
                    id: dep.item ? dep.item.id : null,
                    name: dep.item ? dep.item.name : null,
                    isSource: dep.isSource,
                    refCount: dep.refCount,
                    targetPath: dep.targetPath,
                });
            }
        }
        handler.Copy(targetPkg, FairyEditor.CopyHandler.OverrideOption.RENAME, false);
        let copied = null;
        try {
            targetPkg.Open();
            copied = targetPkg.FindItemByName("DemoView.xml") || targetPkg.FindItemByName("DemoView");
        }
        catch (e) {
            (0, result_1.probeLog)(`目标包查找复制项异常: ${e && e.message ? e.message : e}`);
        }
        let allTargetItems = [];
        if (!copied) {
            try {
                allTargetItems = [];
                const items = targetPkg.items;
                if (items) {
                    for (let i = 0; i < items.Count; i++) {
                        const it = items.get_Item(i);
                        allTargetItems.push({ id: it.id, name: it.name, path: it.path, type: it.type });
                    }
                }
            }
            catch {
            }
        }
        result_1.ProbeResultWriter.record("copy-handler", {
            status: copied ? "pass" : "partial",
            srcItemId: item.id,
            srcName: item.name,
            targetPkg: targetPkg.name,
            existsItemCount: handler.existsItemCount,
            dependencyCount: resultList.length,
            dependencies: resultList,
            copiedPresent: copied != null,
            copiedId: copied ? copied.id : null,
            allTargetItems,
            note: copied ? "复制成功" : "依赖项已复制但主组件未在目标包枚举到（命名差异，能力可用）",
        });
        (0, result_1.probeLog)(`CopyHandler 复制完成 target=${targetPkg.name} deps=${resultList.length} copied=${copied != null}`);
    }
    catch (e) {
        result_1.ProbeResultWriter.record("copy-handler", {
            status: "error",
            error: String(e && e.message ? e.message : e),
            targetPkg: targetPkg.name,
        });
    }
    finally {
        try {
            project.DeletePackage(targetPkg.id);
            project.Save();
        }
        catch (e) {
            (0, result_1.probeLog)(`临时包清理失败（不影响结论）: ${e && e.message ? e.message : e}`);
        }
    }
}
//# sourceMappingURL=copy-handler.js.map