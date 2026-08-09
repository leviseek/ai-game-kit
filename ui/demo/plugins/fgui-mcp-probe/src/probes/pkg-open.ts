import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/**
 * 探针 E：pkg.Open() 刷新包设置的即时性与副作用。
 * 背景：MenuMain_Publish 注释称"包设置一开始就设置好，只有 Open 才能刷新，Open 刷新时编辑区会闪一下"。
 * 本探针在真实工程上验证该行为，并测量耗时。
 */
export function runPkgOpenProbe(): void {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        ProbeResultWriter.record("pkg-open", { status: "blocked", reason: "无打开工程" });
        return;
    }

    const all = project.allPackages;
    const rows: unknown[] = [];
    const t0 = Date.now();
    let totalOpenMs = 0;
    let errorCount = 0;

    for (let i = 0; i < all.Count; i++) {
        const pkg = all.get_Item(i);
        const openedBefore = pkg.opened;
        const t1 = Date.now();
        try {
            pkg.Open();
        } catch (e: any) {
            errorCount++;
            rows.push({ name: pkg.name, error: String(e && e.message ? e.message : e) });
            continue;
        }
        const dt = Date.now() - t1;
        totalOpenMs += dt;
        rows.push({ name: pkg.name, openedBefore, openedAfter: pkg.opened, openMs: dt });
    }

    const totalMs = Date.now() - t0;
    ProbeResultWriter.record("pkg-open", {
        status: errorCount ? "warn" : "pass",
        packageCount: all.Count,
        totalMs,
        totalOpenMs,
        errorCount,
        rows,
        note: "编辑区闪烁副作用需人工观察确认",
    });
    probeLog(`pkg.Open() 遍历 ${all.Count} 包完成 总耗时 ${totalMs}ms 错误 ${errorCount}`);
}
