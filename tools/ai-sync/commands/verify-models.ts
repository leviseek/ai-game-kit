import { parseArgs } from "../lib/args";
import { hasStructuralErrors, loadManifest } from "../lib/manifest";
import { loadModels } from "../lib/models";
import { aiSyncRoot } from "../lib/project";
import { probeModels, realProbeDeps, type RoleProbe } from "../lib/probe";
import { validateAll } from "../lib/validate";

export const help = "verify-models —— 探测模型注册表可用性（分层：模型列表通道 → 环境变量配置检查 → 未配置）";

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (parsed.flags.has("help")) {
        console.log(help);
        return 0;
    }
    const sync = aiSyncRoot();
    const manifest = loadManifest(sync);
    const models = loadModels(sync);
    const issues = validateAll(sync, manifest);

    if (hasStructuralErrors(issues)) {
        for (const issue of issues) console.error(`[error] ${issue.message}`);
        console.error(`[ai-sync:verify-models] 结构错误（registry/models.json/模板），无法探测`);
        return 1;
    }

    const report = await probeModels(models, realProbeDeps);
    console.log(`[ai-sync:verify-models] 探测通道: ${report.channel}（${report.channelNote}）`);
    for (const role of report.roles) {
        printRole(role);
    }
    return 0;
}

function printRole(role: RoleProbe): void {
    const fallback = role.fallback === null ? "（未配置）" : role.fallback;
    console.log(`  ${role.role.padEnd(20)} primary=${role.primary} fallback=${fallback}`);
    console.log(`    primary=${statusLabel(role.primaryStatus)}  fallback=${statusLabel(role.fallbackStatus)}`);
}

function statusLabel(status: RoleProbe["primaryStatus"] | RoleProbe["fallbackStatus"]): string {
    switch (status) {
        case "available":
            return "可用";
        case "unavailable":
            return "不可用";
        case "not-probed":
            return "未探测（仅配置检查）";
        case "not-configured":
            return "未配置探测通道";
        case "none":
            return "无";
    }
}
