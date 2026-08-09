import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/**
 * 探针 D3：Document.AddController / FController 内存态控制器操作实机行为。
 * 目标：验证"加控制器（含页面）→ 切页 → 列页面 → 删控制器"全链路在已打开文档上可程序化完成。
 * 安全约束：操作对象是临时打开的文档副本，探测后 DiscardChanges 恢复，绝不落盘脏修改。
 * 记录项：AddController(xml) 返回、FController.AddPage/RemovePageAt/GetPages 形态、
 * SwitchPage 返回的索引、RemoveController 后 GetController 为 null。
 */
export function runControllerProbe(): void {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        ProbeResultWriter.record("controller", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const pkg = project.GetPackageByName("Demo");
    if (!pkg) {
        ProbeResultWriter.record("controller", { status: "blocked", reason: "Demo 包不存在" });
        return;
    }
    const targetItem = pkg.FindItemByName("DemoView.xml") || pkg.FindItemByName("DemoView");
    if (!targetItem) {
        ProbeResultWriter.record("controller", { status: "blocked", reason: "DemoView 组件不存在" });
        return;
    }

    const doc: any = App.docView.OpenDocument(targetItem.GetURL(), true);
    if (!doc) {
        ProbeResultWriter.record("controller", { status: "blocked", reason: "OpenDocument 返回空" });
        return;
    }
    try {
        const name = `ProbeCtrl_${Date.now()}`;
        const addResult: Record<string, unknown> = {};
        try {
            // 构造控制器 XML：name + pages（索引,名称 扁平串）
            const xml = CS.FairyGUI.Utils.XML.Create("controller");
            xml.SetAttribute("name", name);
            xml.SetAttribute("pages", "0,probeA,1,probeB,2,probeC");
            xml.SetAttribute("selected", "0");
            doc.AddController(xml);
            addResult["added"] = true;
        } catch (e: any) {
            addResult["error"] = String(e && e.message ? e.message : e);
            addResult["added"] = false;
        }

        let ctrl: any = null;
        try {
            ctrl = doc.content ? doc.content.GetController(name) : null;
        } catch (e: any) {
            addResult["getControllerError"] = String(e && e.message ? e.message : e);
        }

        // 列页面
        let pages: string[] = [];
        try {
            if (ctrl) {
                const list = ctrl.GetPages();
                for (let i = 0; i < list.Count; i++) {
                    const p = list.get_Item(i) as any;
                    pages.push(`${p.id}:${p.name}`);
                }
            }
        } catch (e: any) {
            addResult["listPagesError"] = String(e && e.message ? e.message : e);
        }

        // 切页：SwitchPage 返回新索引
        let switchedIndex: number | null = null;
        try {
            if (ctrl) switchedIndex = doc.SwitchPage(name, 1);
        } catch (e: any) {
            addResult["switchError"] = String(e && e.message ? e.message : e);
        }

        // 删除控制器
        let removed = false;
        try {
            doc.RemoveController(name);
            removed = !(doc.content && doc.content.GetController(name));
        } catch (e: any) {
            addResult["removeError"] = String(e && e.message ? e.message : e);
        }

        const status = addResult["added"] && ctrl && removed ? "pass" : "fail";
        ProbeResultWriter.record("controller", {
            status,
            addResult,
            controllerFound: ctrl != null,
            pages,
            switchedIndex,
            removed,
            docURL: doc.docURL,
        });
        probeLog(`控制器探针 ${status}: added=${addResult["added"]} pages=${pages.length} switched=${switchedIndex} removed=${removed}`);
    } catch (e: any) {
        ProbeResultWriter.record("controller", {
            status: "error",
            error: String(e && e.message ? e.message : e),
        });
    } finally {
        try {
            doc.DiscardChanges();
            doc.SetModified(false);
        } catch {
            /* 恢复失败不影响源文件 */
        }
    }
}
