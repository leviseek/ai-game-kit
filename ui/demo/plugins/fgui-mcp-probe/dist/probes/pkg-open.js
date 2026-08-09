"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPkgOpenProbe = runPkgOpenProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runPkgOpenProbe() {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        result_1.ProbeResultWriter.record("pkg-open", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const all = project.allPackages;
    const rows = [];
    const t0 = Date.now();
    let totalOpenMs = 0;
    let errorCount = 0;
    for (let i = 0; i < all.Count; i++) {
        const pkg = all.get_Item(i);
        const openedBefore = pkg.opened;
        const t1 = Date.now();
        try {
            pkg.Open();
        }
        catch (e) {
            errorCount++;
            rows.push({ name: pkg.name, error: String(e && e.message ? e.message : e) });
            continue;
        }
        const dt = Date.now() - t1;
        totalOpenMs += dt;
        rows.push({ name: pkg.name, openedBefore, openedAfter: pkg.opened, openMs: dt });
    }
    const totalMs = Date.now() - t0;
    result_1.ProbeResultWriter.record("pkg-open", {
        status: errorCount ? "warn" : "pass",
        packageCount: all.Count,
        totalMs,
        totalOpenMs,
        errorCount,
        rows,
        note: "编辑区闪烁副作用需人工观察确认",
    });
    (0, result_1.probeLog)(`pkg.Open() 遍历 ${all.Count} 包完成 总耗时 ${totalMs}ms 错误 ${errorCount}`);
}
//# sourceMappingURL=pkg-open.js.map