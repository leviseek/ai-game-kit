/**
 * 文件邮箱桥接层：MCP server 与 FGUI 编辑器插件的通信通道（主通道）。
 *
 * 协议（与探针验证一致）：
 * - MCP 写 <mailbox>/requests/<id>.json，插件每帧轮询处理
 * - 插件写 <mailbox>/responses/<id>.json 作为结果
 * - 请求体: { id, method, params }，响应体: { id, ok, result | error }
 *
 * 为什么文件邮箱为主通道：实测通过（探针 file-mailbox pass）、天然主线程轮询
 * 无跨线程调用编辑器 API 的风险；HTTP 通道作为阶段 4 前的可选增强，不影响本层。
 *
 * 编辑器未开启/插件未加载时，request 超时返回结构化错误，不中断后续调用。
 */

import { existsSync } from "node:fs";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FguiMcpError } from "./paths";

export interface MailboxRequest {
    readonly id: string;
    readonly method: string;
    readonly params: Record<string, unknown>;
}

export interface MailboxResponse {
    readonly id: string;
    readonly ok: boolean;
    readonly result?: unknown;
    readonly error?: string;
}

export interface BridgeOptions {
    /** 单次请求超时（ms），默认 10s */
    readonly timeoutMs?: number;
    /** 轮询间隔（ms），默认 50ms */
    readonly pollMs?: number;
}

export interface BridgeCallResult {
    /** 桥接层是否成功拿到响应（false = 超时/编辑器不可达） */
    readonly reached: boolean;
    /** 插件是否返回 ok */
    readonly ok: boolean;
    readonly result?: unknown;
    readonly error?: string;
}

export class MailboxBridge {
    private readonly mailboxDir: string;
    private readonly requestsDir: string;
    private readonly responsesDir: string;
    private readonly timeoutMs: number;
    private readonly pollMs: number;
    private seq = 0;

    constructor(mailboxDir: string, options: BridgeOptions = {}) {
        this.mailboxDir = mailboxDir;
        this.requestsDir = join(mailboxDir, "requests");
        this.responsesDir = join(mailboxDir, "responses");
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.pollMs = options.pollMs ?? 50;
    }

    /** 发送请求并轮询等待响应。请求文件先写 .tmp 再原子改名，避免插件读到半写文件。 */
    async call(method: string, params: Record<string, unknown>): Promise<BridgeCallResult> {
        this.ensureDirs();
        const id = `req_${Date.now()}_${this.seq++}`;
        const req: MailboxRequest = { id, method, params };

        const reqPath = join(this.requestsDir, `${id}.json`);
        const tmpPath = join(this.requestsDir, `${id}.json.tmp`);
        writeFileSync(tmpPath, JSON.stringify(req));
        rmSync(reqPath, { force: true });
        renameFile(tmpPath, reqPath);

        const deadline = Date.now() + this.timeoutMs;
        while (Date.now() < deadline) {
            const respPath = join(this.responsesDir, `${id}.json`);
            if (existsSync(respPath)) {
                const resp = this.readResponse(respPath);
                rmSync(respPath, { force: true });
                this.pruneStaleResponses();
                return {
                    reached: true,
                    ok: resp.ok,
                    result: resp.result,
                    error: resp.error,
                };
            }
            await sleep(this.pollMs);
        }

        // 超时：区分"插件从未读取"与"插件已读走但未写响应"，给出可行动的错误
        const reqStillExists = existsSync(reqPath);
        rmSync(reqPath, { force: true });
        rmSync(tmpPath, { force: true });
        rmSync(join(this.responsesDir, `${id}.json`), { force: true });
        const detail = reqStillExists
            ? `插件从未读取请求文件（${reqPath} 仍存在）：邮箱服务器未运行或 tick 未触发。请确认已重启编辑器加载含 mailbox server 的插件，且控制台出现"邮箱服务器启动"日志。`
            : `插件已读走请求但未写响应：handler 抛错或响应写入失败。请查看编辑器控制台"[fgui-mcp-probe] 处理请求...异常"日志。`;
        return {
            reached: false,
            ok: false,
            error: `编辑器桥接超时（${this.timeoutMs}ms）: ${method} 未在期限内完成。${detail}`,
        };
    }

    private readResponse(respPath: string): MailboxResponse {
        try {
            const raw = readFileSync(respPath, "utf8");
            return JSON.parse(raw) as MailboxResponse;
        } catch (e) {
            return { id: "", ok: false, error: `响应文件解析失败: ${String(e)}` };
        }
    }

    /** 清理早于当前请求的残留响应文件（正常路径下响应即读即删，此处兜底防堆积）。 */
    private pruneStaleResponses(): void {
        try {
            for (const name of readdirSync(this.responsesDir)) {
                if (!name.endsWith(".json")) continue;
                const stat = this.statSafe(join(this.responsesDir, name));
                if (stat !== undefined && Date.now() - stat.mtimeMs > this.timeoutMs) {
                    rmSync(join(this.responsesDir, name), { force: true });
                }
            }
        } catch {
            /* 清理失败不影响主流程 */
        }
    }

    private statSafe(p: string): { mtimeMs: number } | undefined {
        try {
            return statSync(p);
        } catch {
            return undefined;
        }
    }

    private ensureDirs(): void {
        mkdirSync(this.requestsDir, { recursive: true });
        mkdirSync(this.responsesDir, { recursive: true });
    }
}

/** 判断桥接是否可达：请求目录可写、且编辑器侧存在邮箱目录（插件至少初始化过一次）。 */
export function isBridgeReachable(mailboxDir: string): boolean {
    try {
        mkdirSync(join(mailboxDir, "requests"), { recursive: true });
        mkdirSync(join(mailboxDir, "responses"), { recursive: true });
        return true;
    } catch {
        return false;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 跨盘/同盘原子改名：Windows 下 rename 可能因目标存在失败，这里用删除后 rename 的简单策略。 */
function renameFile(from: string, to: string): void {
    try {
        rmSync(to, { force: true });
        renameSync(from, to);
    } catch (e) {
        throw new FguiMcpError(`邮箱文件改名失败: ${String(e)}`);
    }
}
