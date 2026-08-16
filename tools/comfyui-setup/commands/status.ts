/**
 * status —— 查询 ComfyUI 运行状态（/system_stats + PID 记录）。
 */
import { join } from "node:path";
import { readPid } from "../lib/exec";
import type { ComfyUiConfig } from "../config";
import { repoRoot } from "./paths";
import { healthOk } from "./start";

interface SystemStats {
    readonly system?: { readonly comfyui_version?: string };
    readonly devices?: ReadonlyArray<{ readonly name?: string; readonly type?: string }>;
}

export async function statusComfyUi(config: ComfyUiConfig): Promise<number> {
    const pidFile = join(repoRoot(), "temp", "comfyui", "comfyui.pid");
    const pid = readPid(pidFile);
    if (!(await healthOk(config.port))) {
        console.log(`[comfyui-setup] 未运行（http://127.0.0.1:${config.port} 不可达${pid !== null ? `，PID 记录 ${pid} 已失效` : ""}）`);
        return 1;
    }
    try {
        const response = await fetch(`http://127.0.0.1:${config.port}/system_stats`, { signal: AbortSignal.timeout(5_000) });
        const stats = (await response.json()) as SystemStats;
        const device = stats.devices?.[0];
        console.log(`[comfyui-setup] 运行中: http://127.0.0.1:${config.port}${pid !== null ? `（pid=${pid}）` : ""}`);
        console.log(`  comfyui=${stats.system?.comfyui_version ?? "?"}  device=${device?.name ?? "?"}（${device?.type ?? "?"}）`);
        return 0;
    } catch {
        console.log(`[comfyui-setup] 端口可达但 /system_stats 异常`);
        return 1;
    }
}
