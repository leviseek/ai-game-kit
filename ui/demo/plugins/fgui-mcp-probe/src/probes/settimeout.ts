import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/**
 * 探针 F：Puerts 全局 setTimeout 的后台可用性。
 * 目的：验证 setTimeout 是否由 Unity 主循环驱动——
 *   - 若 setTimeout 在主循环暂停（编辑器窗口后台）时仍触发，则可用它驱动邮箱轮询，根治"聚焦依赖"。
 *   - 若它随主循环停摆，则需退回后台线程方案（HttpListener 回调）。
 *
 * 用法：在编辑器点「setTimeout 探针」后，立即把鼠标焦点切到其它窗口 10 秒，再切回查看结果。
 * 判定：schedule 阶段在后台期间，若回调仍在触发（记录 ts 间隔 ~500ms 连续），则 setTimeout 不依赖主循环。
 */
export function runSetTimeoutProbe(): void {
    const hits: number[] = [];
    const startedAt = Date.now();
    const TOTAL = 12; // 约 6 秒的调度窗口

    probeLog(`setTimeout 探针开始：调度 ${TOTAL} 次，每次 500ms。请立即切到其它窗口约 6 秒再回来。`);

    const schedule = (index: number): void => {
        if (index >= TOTAL) {
            // 全部完成：记录
            const elapsed = Date.now() - startedAt;
            const gaps: number[] = [];
            for (let i = 1; i < hits.length; i++) gaps.push(hits[i]! - hits[i - 1]!);
            const maxGap = gaps.length ? Math.max(...gaps) : 0;
            const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

            // 尝试在回调里读编辑器 API（验证后台执行安全）
            let apiRead = "";
            try {
                const name = FairyEditor.App.project?.name;
                apiRead = `ok:${name}`;
            } catch (e: any) {
                apiRead = `error:${e && e.message ? e.message : e}`;
            }

            ProbeResultWriter.record("settimeout", {
                status: maxGap <= 2000 ? "pass" : "stalled",
                totalScheduled: TOTAL,
                totalFired: hits.length,
                elapsedMs: elapsed,
                maxGapMs: Math.round(maxGap),
                avgGapMs: Math.round(avgGap),
                gaps: gaps.map((g) => Math.round(g)),
                apiRead,
                note:
                    "maxGapMs<=2000 说明 setTimeout 不依赖主循环（后台也连续触发）→ 可驱动邮箱轮询根治聚焦依赖；" +
                    "maxGapMs 明显大于 2000 说明 setTimeout 随主循环停摆 → 需退回后台线程方案",
            });
            probeLog(`setTimeout 探针完成：触发 ${hits.length}/${TOTAL}，最大间隔 ${Math.round(maxGap)}ms（${maxGap <= 2000 ? "不依赖主循环" : "随主循环停摆"}）`);
            return;
        }
        const cb = (): void => {
            hits.push(Date.now());
            schedule(index + 1);
        };
        (globalThis as any).setTimeout(cb, 500);
    };

    schedule(0);
}
