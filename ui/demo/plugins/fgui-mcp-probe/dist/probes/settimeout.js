"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSetTimeoutProbe = runSetTimeoutProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runSetTimeoutProbe() {
    const hits = [];
    const startedAt = Date.now();
    const TOTAL = 12;
    (0, result_1.probeLog)(`setTimeout 探针开始：调度 ${TOTAL} 次，每次 500ms。请立即切到其它窗口约 6 秒再回来。`);
    const schedule = (index) => {
        if (index >= TOTAL) {
            const elapsed = Date.now() - startedAt;
            const gaps = [];
            for (let i = 1; i < hits.length; i++)
                gaps.push(hits[i] - hits[i - 1]);
            const maxGap = gaps.length ? Math.max(...gaps) : 0;
            const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
            let apiRead = "";
            try {
                const name = FairyEditor.App.project?.name;
                apiRead = `ok:${name}`;
            }
            catch (e) {
                apiRead = `error:${e && e.message ? e.message : e}`;
            }
            result_1.ProbeResultWriter.record("settimeout", {
                status: maxGap <= 2000 ? "pass" : "stalled",
                totalScheduled: TOTAL,
                totalFired: hits.length,
                elapsedMs: elapsed,
                maxGapMs: Math.round(maxGap),
                avgGapMs: Math.round(avgGap),
                gaps: gaps.map((g) => Math.round(g)),
                apiRead,
                note: "maxGapMs<=2000 说明 setTimeout 不依赖主循环（后台也连续触发）→ 可驱动邮箱轮询根治聚焦依赖；" +
                    "maxGapMs 明显大于 2000 说明 setTimeout 随主循环停摆 → 需退回后台线程方案",
            });
            (0, result_1.probeLog)(`setTimeout 探针完成：触发 ${hits.length}/${TOTAL}，最大间隔 ${Math.round(maxGap)}ms（${maxGap <= 2000 ? "不依赖主循环" : "随主循环停摆"}）`);
            return;
        }
        const cb = () => {
            hits.push(Date.now());
            schedule(index + 1);
        };
        globalThis.setTimeout(cb, 500);
    };
    schedule(0);
}
//# sourceMappingURL=settimeout.js.map