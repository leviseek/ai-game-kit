"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runControllerProbe = runControllerProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runControllerProbe() {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        result_1.ProbeResultWriter.record("controller", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const pkg = project.GetPackageByName("Demo");
    if (!pkg) {
        result_1.ProbeResultWriter.record("controller", { status: "blocked", reason: "Demo 包不存在" });
        return;
    }
    const targetItem = pkg.FindItemByName("DemoView.xml") || pkg.FindItemByName("DemoView");
    if (!targetItem) {
        result_1.ProbeResultWriter.record("controller", { status: "blocked", reason: "DemoView 组件不存在" });
        return;
    }
    const doc = App.docView.OpenDocument(targetItem.GetURL(), true);
    if (!doc) {
        result_1.ProbeResultWriter.record("controller", { status: "blocked", reason: "OpenDocument 返回空" });
        return;
    }
    try {
        const name = `ProbeCtrl_${Date.now()}`;
        const addResult = {};
        try {
            const xml = CS.FairyGUI.Utils.XML.Create("controller");
            xml.SetAttribute("name", name);
            xml.SetAttribute("pages", "0,probeA,1,probeB,2,probeC");
            xml.SetAttribute("selected", "0");
            doc.AddController(xml);
            addResult["added"] = true;
        }
        catch (e) {
            addResult["error"] = String(e && e.message ? e.message : e);
            addResult["added"] = false;
        }
        let ctrl = null;
        try {
            ctrl = doc.content ? doc.content.GetController(name) : null;
        }
        catch (e) {
            addResult["getControllerError"] = String(e && e.message ? e.message : e);
        }
        let pages = [];
        try {
            if (ctrl) {
                const list = ctrl.GetPages();
                for (let i = 0; i < list.Count; i++) {
                    const p = list.get_Item(i);
                    pages.push(`${p.id}:${p.name}`);
                }
            }
        }
        catch (e) {
            addResult["listPagesError"] = String(e && e.message ? e.message : e);
        }
        let switchedIndex = null;
        try {
            if (ctrl)
                switchedIndex = doc.SwitchPage(name, 1);
        }
        catch (e) {
            addResult["switchError"] = String(e && e.message ? e.message : e);
        }
        let removed = false;
        try {
            doc.RemoveController(name);
            removed = !(doc.content && doc.content.GetController(name));
        }
        catch (e) {
            addResult["removeError"] = String(e && e.message ? e.message : e);
        }
        const status = addResult["added"] && ctrl && removed ? "pass" : "fail";
        result_1.ProbeResultWriter.record("controller", {
            status,
            addResult,
            controllerFound: ctrl != null,
            pages,
            switchedIndex,
            removed,
            docURL: doc.docURL,
        });
        (0, result_1.probeLog)(`控制器探针 ${status}: added=${addResult["added"]} pages=${pages.length} switched=${switchedIndex} removed=${removed}`);
    }
    catch (e) {
        result_1.ProbeResultWriter.record("controller", {
            status: "error",
            error: String(e && e.message ? e.message : e),
        });
    }
    finally {
        try {
            doc.DiscardChanges();
            doc.SetModified(false);
        }
        catch {
        }
    }
}
//# sourceMappingURL=controller.js.map