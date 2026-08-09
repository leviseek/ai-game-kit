"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInsertObjectProbe = runInsertObjectProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runInsertObjectProbe() {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        result_1.ProbeResultWriter.record("insert-object", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const pkg = project.GetPackageByName("Demo");
    if (!pkg) {
        result_1.ProbeResultWriter.record("insert-object", { status: "blocked", reason: "Demo 包不存在" });
        return;
    }
    const pathCandidates = ["/DemoView.xml", "DemoView.xml", "/DemoView", "DemoView"];
    const pathResults = {};
    for (const cand of pathCandidates) {
        try {
            pathResults[cand] = pkg.GetItemByPath(cand) != null;
        }
        catch (e) {
            pathResults[cand] = false;
        }
    }
    const targetItem = pkg.FindItemByName("DemoView.xml") || pkg.FindItemByName("DemoView");
    const insertItem = pkg.FindItemByName("StartButton.xml") || pkg.FindItemByName("StartButton");
    if (!targetItem || !insertItem) {
        result_1.ProbeResultWriter.record("insert-object", {
            status: "blocked",
            reason: "FindItemByName 找不到 DemoView/StartButton",
            pathResults,
        });
        return;
    }
    const targetUrl = targetItem.GetURL();
    const insertUrl = insertItem.GetURL();
    const beforeAppActive = App.activeDoc;
    const beforeDocViewActive = App.docView.activeDoc;
    const doc = App.docView.OpenDocument(targetUrl, true);
    if (!doc) {
        result_1.ProbeResultWriter.record("insert-object", { status: "blocked", reason: "OpenDocument 返回空", targetUrl, pathResults });
        return;
    }
    const syncAppActive = App.activeDoc;
    const syncDocViewActive = App.docView.activeDoc;
    const docMatchesTarget = doc.docURL === targetUrl;
    const appActiveSame = syncAppActive === doc;
    const docViewActiveSame = syncDocViewActive === doc;
    const appActiveChanged = syncAppActive !== beforeAppActive;
    const docViewActiveChanged = syncDocViewActive !== beforeDocViewActive;
    let forcedActive = false;
    if (!docViewActiveSame) {
        try {
            App.docView.activeDoc = doc;
            forcedActive = App.docView.activeDoc === doc;
        }
        catch (e) {
            (0, result_1.probeLog)(`docView.activeDoc setter 异常: ${e}`);
        }
    }
    const opDoc = App.activeDoc || doc;
    let beforeChildren = -1;
    try {
        beforeChildren = opDoc.content ? opDoc.content.children.Count : -1;
    }
    catch {
    }
    let inserted = null;
    let insertError = null;
    try {
        opDoc.UnselectAll();
        inserted = opDoc.InsertObject(insertUrl, null, 0);
    }
    catch (e) {
        insertError = String(e && e.message ? e.message : e);
    }
    let afterChildren = -1;
    let tailUrl = "";
    let serializeHasInsert = false;
    try {
        const ch = opDoc.content ? opDoc.content.children : null;
        afterChildren = ch ? ch.Count : -1;
        if (ch && ch.Count > 0) {
            const tail = ch.get_Item(ch.Count - 1);
            tailUrl = tail ? String(tail.url || tail.src || tail.name || "") : "";
        }
        const xml = opDoc.Serialize();
        if (xml && xml.elements) {
            const items = xml.elements;
            for (let i = 0; i < items.Count; i++) {
                const el = items.get_Item(i);
                if (el && el.name === "displayListItem" && el.GetAttribute("src") === insertUrl) {
                    serializeHasInsert = true;
                }
            }
        }
    }
    catch (e) {
        (0, result_1.probeLog)(`取证异常: ${e}`);
    }
    const isModified = opDoc.isModified;
    const opDocIsAppActive = App.activeDoc === opDoc;
    const opDocIsDocViewActive = App.docView.activeDoc === opDoc;
    (0, result_1.probeLog)(`InsertObject 返回=${inserted != null} isModified=${isModified} ` +
        `docURL匹配=${docMatchesTarget} appActiveSame=${appActiveSame} docViewActiveSame=${docViewActiveSame} ` +
        `forcedActive=${forcedActive} children=${beforeChildren}->${afterChildren} serializeHasInsert=${serializeHasInsert}`);
    result_1.ProbeResultWriter.record("insert-object", {
        status: insertError ? "error" : inserted ? "pass" : "fail",
        targetUrl,
        insertUrl,
        returnedObject: inserted != null,
        isModified,
        activeDocChanged: appActiveChanged,
        docViewActiveChanged,
        docMatchesTarget,
        appActiveSame,
        docViewActiveSame,
        forcedActive,
        opDocIsAppActive,
        opDocIsDocViewActive,
        beforeChildren,
        afterChildren,
        tailUrl,
        serializeHasInsert,
        insertError,
        pathResults,
    });
    const restore = () => {
        try {
            opDoc.DiscardChanges();
            opDoc.SetModified(false);
        }
        catch (e) {
            (0, result_1.probeLog)(`恢复异常（不影响源文件）: ${e}`);
        }
    };
    try {
        CS.FairyGUI.Timers.inst.Add(3, 1, restore);
        (0, result_1.probeLog)("已延迟 3 秒恢复文档——请在编辑区确认 StartButton 是否可见");
    }
    catch {
        restore();
    }
}
//# sourceMappingURL=insert-object.js.map