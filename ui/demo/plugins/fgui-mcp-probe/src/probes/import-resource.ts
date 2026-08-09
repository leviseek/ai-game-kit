import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/**
 * 探针 D1：FPackage.ImportResource + ResourceImportQueue 实机行为。
 * 目标：验证外部 PNG（如 sprite CLI 产物）能否程序化导入包内并登记为 image 资源。
 * 源文件：直接用项目已有真实 PNG（Demo/img/background.png），避免 WriteAllBytes 的 byte[] 互操作问题。
 * 安全约束：导入 Demo 包后立即删除导入项并清理，不残留脏资源（恢复包到导入前状态）。
 * 记录项：ImportResource 返回的 Task 形态、ResourceImportQueue.Process 回调能否拿到 FPackageItem、导入项 id/name/path。
 */
export function runImportResourceProbe(): void {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        ProbeResultWriter.record("import-resource", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const pkg = project.GetPackageByName("Demo");
    if (!pkg) {
        ProbeResultWriter.record("import-resource", { status: "blocked", reason: "Demo 包不存在" });
        return;
    }

    // 源文件：项目已有真实 PNG（绝对路径，确保存在）
    const srcPng = `${project.assetsPath}/Demo/img/background.png`;
    if (!CS.System.IO.File.Exists(srcPng)) {
        ProbeResultWriter.record("import-resource", { status: "blocked", reason: `源 PNG 不存在: ${srcPng}` });
        return;
    }
    const beforeIds = snapshotPkgItems(pkg).map((i) => i.id);

    // 路径 A：FPackage.ImportResource（返回 Task，Puerts 下读 IsCompleted/IsFaulted 或轮询）
    const pathAResult: Record<string, unknown> = {};
    try {
        const task: any = pkg.ImportResource(srcPng, "/", "ProbeImportA");
        pathAResult["taskReturned"] = task != null;
        try {
            pathAResult["taskIsCompleted"] = task.IsCompleted;
            pathAResult["taskIsFaulted"] = task.IsFaulted;
        } catch (e: any) {
            pathAResult["taskStatusReadError"] = String(e && e.message ? e.message : e);
        }
    } catch (e: any) {
        pathAResult["error"] = String(e && e.message ? e.message : e);
    }
    // 记录导入后的包清单（含 type 字段，供清理与确认导入项类型）
    const afterA = snapshotPkgItems(pkg);

    // 路径 B：ResourceImportQueue（Create → Add → Process，callback 拿结果）
    const pathBResult: Record<string, unknown> = {};
    try {
        const queue = FairyEditor.ResourceImportQueue.Create(pkg);
        queue.Add(srcPng, "/", "ProbeImportB");
        let cbFired = false;
        queue.Process((items: any) => {
            cbFired = true;
            const rows: unknown[] = [];
            if (items) {
                for (let i = 0; i < items.Count; i++) {
                    const item = items.get_Item(i) as FairyEditor.FPackageItem;
                    rows.push({ id: item.id, name: item.name, path: item.path });
                }
            }
            pathBResult["callbackFired"] = true;
            pathBResult["importedItems"] = rows;
            ProbeResultWriter.record("import-resource", {
                status: rows.length ? "pass" : "empty-callback",
                pathA: pathAResult,
                pathB: pathBResult,
                srcPng,
                importedItemTypes: afterA.filter((i) => i.name.startsWith("ProbeImport")).map((i) => ({ name: i.name, type: i.type })),
                cleanupNote: "异步导入占用文件锁，物理文件延迟清理（Timers 2s 后删除 ProbeImport*）",
            });
            probeLog(`ResourceImportQueue 回调 items=${rows.length}，延迟清理 ProbeImport* 物理文件`);
            // 异步导入（ImportResourceDialog 后台任务）持有文件锁，等 2s 后再删物理文件与登记项
            const doCleanup = (): void => {
                const cleaned: string[] = [];
                const cleanFailed: string[] = [];
                const current = snapshotPkgItems(pkg);
                for (const it of current) {
                    if (it.name.startsWith("ProbeImport")) {
                        const pi = pkg.FindItemByName(it.name);
                        if (pi) {
                            try {
                                pkg.DeleteItem(pi);
                                cleaned.push(it.name);
                            } catch (e: any) {
                                cleanFailed.push(`${it.name}(${e && e.message ? e.message : e})`);
                            }
                        }
                    }
                }
                try {
                    pkg.Save();
                } catch {
                    /* 保存失败不影响结论 */
                }
                if (cleanFailed.length) {
                    probeLog(`ProbeImport 延迟清理部分失败: ${cleanFailed.join("; ")}（需人工清理 Demo/ProbeImport* 文件）`);
                } else {
                    probeLog(`ProbeImport 延迟清理完成: ${cleaned.join(",") || "无残留"}`);
                }
            };
            try {
                CS.FairyGUI.Timers.inst.Add(2, 1, doCleanup);
            } catch {
                doCleanup();
            }
        });
        if (!cbFired) {
            pathBResult["callbackFired"] = cbFired;
            probeLog("ResourceImportQueue.Process 未同步触发回调（可能异步，等待 onComplete 后回填）");
        }
    } catch (e: any) {
        pathBResult["error"] = String(e && e.message ? e.message : e);
        ProbeResultWriter.record("import-resource", { status: "error", pathA: pathAResult, pathB: pathBResult });
    }
}

/** 快照包内资源（id/name/path/type），用于导入前后对比与清理。 */
function snapshotPkgItems(pkg: FairyEditor.FPackage): Array<{ id: string; name: string; path: string; type: string }> {
    const rows: Array<{ id: string; name: string; path: string; type: string }> = [];
    const items = pkg.items;
    if (!items) return rows;
    for (let i = 0; i < items.Count; i++) {
        const item = items.get_Item(i) as FairyEditor.FPackageItem;
        rows.push({ id: item.id, name: item.name, path: item.path, type: item.type });
    }
    return rows;
}
