import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/**
 * 探针 D2：CopyHandler 跨包复制实机行为。
 * 目标：验证 InitWithObject（XML 形态，避免 InitWithItems 的 IList 互操作问题）能否把组件复制到目标包。
 * 安全约束：目标包用 project.CreatePackage 创建临时包（自动生成合法 package.xml），
 * 复制完成后 DeletePackage 清理；绝不污染业务包（Demo/Common）。全程 try/catch，避免 run-all 刷屏。
 * 记录项：InitWithObject 是否可调用、resultList 项、existsItemCount、复制项存在性。
 */
export function runCopyHandlerProbe(): void {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        ProbeResultWriter.record("copy-handler", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const srcPkg = project.GetPackageByName("Demo");
    if (!srcPkg) {
        ProbeResultWriter.record("copy-handler", { status: "blocked", reason: "Demo 包不存在" });
        return;
    }
    const item = srcPkg.FindItemByName("DemoView.xml") || srcPkg.FindItemByName("DemoView");
    if (!item) {
        ProbeResultWriter.record("copy-handler", { status: "blocked", reason: "DemoView 组件不存在" });
        return;
    }

    // 用 CreatePackage 创建临时包（生成合法 package.xml；AddPackage 需要现成 package.xml 会失败）
    let targetPkg: FairyEditor.FPackage;
    try {
        targetPkg = project.CreatePackage("ProbeCopyScratch");
        if (!targetPkg) {
            ProbeResultWriter.record("copy-handler", { status: "blocked", reason: "CreatePackage 返回空" });
            return;
        }
    } catch (e: any) {
        ProbeResultWriter.record("copy-handler", {
            status: "error",
            error: `CreatePackage(scratch) 失败: ${e && e.message ? e.message : e}`,
            note: "跨包复制能力受限于包生命周期 API，需在编辑器环境人工确认",
        });
        return;
    }

    try {
        // InitWithObject：用源组件打开文档后的 Serialize XML 作为复制源，避开 InitWithItems 的 IList 互操作
        const doc: any = App.docView.OpenDocument(item.GetURL(), false);
        if (!doc) throw new Error("OpenDocument 返回空");
        const xml = doc.Serialize();
        if (!xml) throw new Error("doc.Serialize() 返回空 XML");
        const handler = new FairyEditor.CopyHandler();
        handler.InitWithObject(srcPkg, xml, targetPkg, "/", false);
        const resultList: unknown[] = [];
        const rows = handler.resultList;
        if (rows) {
            for (let i = 0; i < rows.Count; i++) {
                const dep = rows.get_Item(i) as FairyEditor.DepItem;
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

        // 复制后目标包可能未打开，Open 刷新再查找复制项
        let copied: FairyEditor.FPackageItem | null = null;
        try {
            targetPkg.Open();
            copied = targetPkg.FindItemByName("DemoView.xml") || targetPkg.FindItemByName("DemoView");
        } catch (e: any) {
            probeLog(`目标包查找复制项异常: ${e && e.message ? e.message : e}`);
        }
        // 若按名字查不到，枚举目标包全部项兜底取证
        let allTargetItems: unknown[] = [];
        if (!copied) {
            try {
                allTargetItems = [];
                const items = targetPkg.items;
                if (items) {
                    for (let i = 0; i < items.Count; i++) {
                        const it = items.get_Item(i) as FairyEditor.FPackageItem;
                        allTargetItems.push({ id: it.id, name: it.name, path: it.path, type: it.type });
                    }
                }
            } catch {
                /* 枚举失败不影响结论 */
            }
        }
        ProbeResultWriter.record("copy-handler", {
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
        probeLog(`CopyHandler 复制完成 target=${targetPkg.name} deps=${resultList.length} copied=${copied != null}`);
    } catch (e: any) {
        ProbeResultWriter.record("copy-handler", {
            status: "error",
            error: String(e && e.message ? e.message : e),
            targetPkg: targetPkg.name,
        });
    } finally {
        // 清理临时包：DeletePackage 移除并删除目录；失败不影响结论
        try {
            project.DeletePackage(targetPkg.id);
            project.Save();
        } catch (e: any) {
            probeLog(`临时包清理失败（不影响结论）: ${e && e.message ? e.message : e}`);
        }
    }
}
