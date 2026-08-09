import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/**
 * 探针 A：activeDoc.InsertObject(url) 实机行为（v2，针对"插入成功但编辑区不可见"修复）。
 * 上一轮根因：插入发生在前台未激活的文档实例上，且探针 DiscardChanges 自我回滚，编辑区不可见。
 * v2 修复：
 *   1. 分别记录 App.activeDoc 与 App.docView.activeDoc 两个访问器的前后状态与引用相等性；
 *   2. 显式强制激活（App.docView.activeDoc = doc）并读回确认；
 *   3. 插入前后数据取证（content.children 增量、Serialize XML 是否含 insertUrl）区分"数据问题 vs 显示问题"；
 *   4. 延迟 3 秒恢复，留人工观察窗口；绝不让脏文档残留。
 * item 查找主路线用 FindItemByName；GetItemByPath 候选形态作附属探测。
 */
export function runInsertObjectProbe(): void {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        ProbeResultWriter.record("insert-object", { status: "blocked", reason: "无打开工程" });
        return;
    }

    const pkg = project.GetPackageByName("Demo");
    if (!pkg) {
        ProbeResultWriter.record("insert-object", { status: "blocked", reason: "Demo 包不存在" });
        return;
    }

    // 附属探测：GetItemByPath 各候选形态的真实语义（低证据 API 收敛）
    const pathCandidates = ["/DemoView.xml", "DemoView.xml", "/DemoView", "DemoView"];
    const pathResults: Record<string, boolean> = {};
    for (const cand of pathCandidates) {
        try {
            pathResults[cand] = pkg.GetItemByPath(cand) != null;
        } catch (e: any) {
            pathResults[cand] = false;
        }
    }

    const targetItem = pkg.FindItemByName("DemoView.xml") || pkg.FindItemByName("DemoView");
    const insertItem = pkg.FindItemByName("StartButton.xml") || pkg.FindItemByName("StartButton");
    if (!targetItem || !insertItem) {
        ProbeResultWriter.record("insert-object", {
            status: "blocked",
            reason: "FindItemByName 找不到 DemoView/StartButton",
            pathResults,
        });
        return;
    }
    const targetUrl = targetItem.GetURL();
    const insertUrl = insertItem.GetURL();

    // 缺口1：两个访问器分别取基线（含"是否原本就有前台文档"）
    const beforeAppActive = App.activeDoc as any;
    const beforeDocViewActive = App.docView.activeDoc as any;

    const doc: any = App.docView.OpenDocument(targetUrl, true);
    if (!doc) {
        ProbeResultWriter.record("insert-object", { status: "blocked", reason: "OpenDocument 返回空", targetUrl, pathResults });
        return;
    }

    // 缺口1 续：同步读取激活结果——引用相等性才是硬证据
    const syncAppActive = App.activeDoc as any;
    const syncDocViewActive = App.docView.activeDoc as any;
    const docMatchesTarget = doc.docURL === targetUrl;
    const appActiveSame = syncAppActive === doc;
    const docViewActiveSame = syncDocViewActive === doc;
    const appActiveChanged = syncAppActive !== beforeAppActive;
    const docViewActiveChanged = syncDocViewActive !== beforeDocViewActive;

    // 缺口2：显式强制激活（setter），读回确认
    let forcedActive = false;
    if (!docViewActiveSame) {
        try {
            App.docView.activeDoc = doc;
            forcedActive = (App.docView.activeDoc as any) === doc;
        } catch (e: any) {
            probeLog(`docView.activeDoc setter 异常: ${e}`);
        }
    }
    // 操作对象与 fguiPlugin 语义对齐：优先 App.activeDoc
    const opDoc: any = App.activeDoc || doc;

    // 缺口3 前基线
    let beforeChildren = -1;
    try {
        beforeChildren = opDoc.content ? opDoc.content.children.Count : -1;
    } catch {
        /* 无 content */
    }

    let inserted: any = null;
    let insertError: string | null = null;
    try {
        opDoc.UnselectAll();
        inserted = opDoc.InsertObject(insertUrl, null, 0); // 显式 index=0，便于观察
    } catch (e: any) {
        insertError = String(e && e.message ? e.message : e);
    }

    // 缺口3 取证（DiscardChanges 前）：children 增量 + 尾部对象 + XML 是否含 insertUrl
    let afterChildren = -1;
    let tailUrl = "";
    let serializeHasInsert = false;
    try {
        const ch = opDoc.content ? opDoc.content.children : null;
        afterChildren = ch ? ch.Count : -1;
        if (ch && ch.Count > 0) {
            const tail = ch.get_Item(ch.Count - 1) as any;
            tailUrl = tail ? String(tail.url || tail.src || tail.name || "") : "";
        }
        const xml = opDoc.Serialize() as any; // FairyGUI.Utils.XML
        if (xml && xml.elements) {
            const items = xml.elements; // XMLList
            for (let i = 0; i < items.Count; i++) {
                const el = items.get_Item(i) as any;
                if (el && el.name === "displayListItem" && el.GetAttribute("src") === insertUrl) {
                    serializeHasInsert = true;
                }
            }
        }
    } catch (e: any) {
        probeLog(`取证异常: ${e}`);
    }

    const isModified = opDoc.isModified;
    const opDocIsAppActive = (App.activeDoc as any) === opDoc;
    const opDocIsDocViewActive = (App.docView.activeDoc as any) === opDoc;

    probeLog(
        `InsertObject 返回=${inserted != null} isModified=${isModified} ` +
        `docURL匹配=${docMatchesTarget} appActiveSame=${appActiveSame} docViewActiveSame=${docViewActiveSame} ` +
        `forcedActive=${forcedActive} children=${beforeChildren}->${afterChildren} serializeHasInsert=${serializeHasInsert}`,
    );

    ProbeResultWriter.record("insert-object", {
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

    // 缺口4：延迟 3 秒恢复，留人工观察窗口（绝不让脏文档残留）
    const restore = (): void => {
        try {
            opDoc.DiscardChanges();
            opDoc.SetModified(false);
        } catch (e: any) {
            probeLog(`恢复异常（不影响源文件）: ${e}`);
        }
    };
    try {
        CS.FairyGUI.Timers.inst.Add(3, 1, restore);
        probeLog("已延迟 3 秒恢复文档——请在编辑区确认 StartButton 是否可见");
    } catch {
        restore(); // Timers 不可用时立即恢复
    }
}
