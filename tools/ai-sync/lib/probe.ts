import { spawn } from "node:child_process";
import type { Models } from "./models";

/** 探测通道：cli = 真实模型列表；env = 环境变量配置检查；none = 未配置探测通道。 */
export type ProbeChannel = "cli" | "env" | "none";

/** 探测状态：available/unavailable 仅 cli 通道可判定；not-probed 为 env 通道（仅配置检查）；not-configured 为 none 通道。 */
export type ProbeStatus = "available" | "unavailable" | "not-probed" | "not-configured";

export interface RoleProbe {
    readonly role: string;
    readonly primary: string;
    readonly fallback: string | null;
    readonly primaryStatus: ProbeStatus;
    readonly fallbackStatus: ProbeStatus | "none";
}

export interface ProbeReport {
    readonly channel: ProbeChannel;
    readonly channelNote: string;
    readonly roles: readonly RoleProbe[];
}

/** 探测依赖（可注入便于测试）：CLI 模型列表与当前环境变量键。 */
export interface ProbeDeps {
    readonly listModelsFromCli: () => Promise<string[] | null>;
    readonly envKeys: () => readonly string[];
}

/**
 * 解析 opencode models 输出为模型名列表，容错 JSON 与纯文本两种形态：
 * JSON 数组 → 直接取；JSON 对象含 models 数组 → 取之；其余按行 trim 非空解析。
 */
export function parseModelListOutput(output: string): string[] {
    const trimmed = output.trim();
    if (trimmed.length === 0) return [];
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
        }
        if (parsed !== null && typeof parsed === "object" && Array.isArray((parsed as { models?: unknown }).models)) {
            return (parsed as { models: unknown[] }).models.filter((x): x is string => typeof x === "string" && x.length > 0);
        }
    } catch {
        // 非 JSON：按行解析
    }
    return trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** 真实依赖：spawn opencode models list；环境变量键取 codex/openai 凭据。 */
export const realProbeDeps: ProbeDeps = {
    listModelsFromCli: async () => {
        const out = await runCli(["models", "list"], 10_000);
        if (out === null) return null;
        const parsed = parseModelListOutput(out);
        return parsed.length > 0 ? parsed : null;
    },
    envKeys: () => ["CODEX_API_KEY", "OPENAI_API_KEY"].filter((key) => process.env[key] !== undefined && process.env[key] !== ""),
};

function runCli(args: readonly string[], timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn("opencode", [...args], { stdio: ["ignore", "pipe", "pipe"] });
        } catch {
            resolve(null);
            return;
        }
        let out = "";
        const timer = setTimeout(() => {
            child.kill();
            resolve(null);
        }, timeoutMs);
        child.stdout?.on("data", (chunk: Buffer) => {
            out += chunk.toString("utf8");
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve(null);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve(code === 0 ? out : null);
        });
    });
}

/** 分层探测：cli 通道优先；不可用时降级环境变量配置检查；再不可用为未配置。 */
export async function probeModels(models: Models, deps: ProbeDeps): Promise<ProbeReport> {
    const cliModels = await deps.listModelsFromCli();
    const envPresent = deps.envKeys();

    let channel: ProbeChannel;
    let channelNote: string;
    if (cliModels !== null) {
        channel = "cli";
        channelNote = `模型列表通道（opencode models list，${cliModels.length} 个模型）`;
    } else if (envPresent.length > 0) {
        channel = "env";
        channelNote = `配置检查通道（CLI 不可达，仅探测环境变量: ${envPresent.join(", ")}）`;
    } else {
        channel = "none";
        channelNote = "未配置探测通道（opencode CLI 不可达且无凭据环境变量）";
    }

    const roles: RoleProbe[] = Object.entries(models)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([role, entry]) => {
            const fallbackStatus: RoleProbe["fallbackStatus"] =
                entry.fallback === null ? "none" : statusOf(entry.fallback, channel, cliModels);
            return {
                role,
                primary: entry.primary,
                fallback: entry.fallback,
                primaryStatus: statusOf(entry.primary, channel, cliModels),
                fallbackStatus,
            };
        });

    return { channel, channelNote, roles };
}

function statusOf(model: string, channel: ProbeChannel, cliModels: string[] | null): ProbeStatus {
    if (channel === "cli") {
        return cliModels?.includes(model) === true ? "available" : "unavailable";
    }
    if (channel === "env") return "not-probed";
    return "not-configured";
}
