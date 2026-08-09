import FairyEditor = CS.FairyEditor;
import { isDeferredResult, type DeferredResponse } from "./protocol";

/**
 * 邮箱请求分发：MCP server 侧发起的读/写请求。
 * 对应 MCP server 的 lib/bridge.ts 协议：{ id, method, params } → { id, ok, result | error }。
 */
export interface MailboxHandlerRequest {
    readonly id: string;
    readonly method: string;
    readonly params: Record<string, unknown>;
}

export interface MailboxHandlerResponse {
    readonly id: string;
    readonly ok: boolean;
    readonly result?: unknown;
    readonly error?: string;
}

export type MailboxHandler = (params: Record<string, unknown>) => unknown;

export { isDeferredResult };
export type { DeferredResponse };

/** 邮箱服务器：每帧轮询 requests 目录，把请求交给注册的 handler 处理，结果写回 responses 目录。 */
export class MailboxServer {
    private readonly requestsDir: string;
    private readonly responsesDir: string;
    private readonly handlers = new Map<string, MailboxHandler>();
    /** 轮询间隔（ms）。编辑器空闲时 add_onUpdate 帧率可低至 4-5 fps，按帧计数会饿死请求，改用时间制。 */
    private readonly pollIntervalMs: number;
    private lastPollTime = 0;
    private lastHeartbeatTime = 0;

    constructor(mailboxDir: string, pollIntervalMs = 300) {
        // 路径归一化：用 Path.Combine 消除 Windows 下 / 与 \ 混用隐患
        this.requestsDir = CS.System.IO.Path.Combine(mailboxDir, "requests");
        this.responsesDir = CS.System.IO.Path.Combine(mailboxDir, "responses");
        this.pollIntervalMs = pollIntervalMs;
    }

    /** 注册请求方法处理器；重复注册覆盖。 */
    register(method: string, handler: MailboxHandler): void {
        this.handlers.set(method, handler);
    }

    /** 异步请求的响应写入（deferred handler 在操作完成后调用）。 */
    writeResponse(id: string, resp: Omit<MailboxHandlerResponse, "id">): void {
        const File = CS.System.IO.File;
        try {
            CS.System.IO.Directory.CreateDirectory(this.responsesDir);
            const full: MailboxHandlerResponse = { id, ...resp };
            const tmp = CS.System.IO.Path.Combine(this.responsesDir, `${id}.json.tmp`);
            const target = CS.System.IO.Path.Combine(this.responsesDir, `${id}.json`);
            File.WriteAllText(tmp, JSON.stringify(full));
            if (File.Exists(target)) File.Delete(target);
            File.Move(tmp, target);
        } catch (e: any) {
            console.log(`[fgui-mcp-probe] 写异步响应 ${id} 异常: ${e}`);
        }
    }

    /** 每帧驱动（配合 App.add_onUpdate 调用）。按时间间隔轮询，不依赖帧率。 */
    tick(): void {
        const now = Date.now();
        if (now - this.lastPollTime < this.pollIntervalMs) return;
        this.lastPollTime = now;
        // 心跳可见性：约每 30 秒一次，证明 tick 循环确实在跑（排查"服务器未运行/tick 未触发"）
        if (now - this.lastHeartbeatTime >= 30000) {
            this.lastHeartbeatTime = now;
            console.log(`[fgui-mcp-probe] tick alive t=${now}`);
        }
        this.processPending();
    }

    private processPending(): void {
        const Directory = CS.System.IO.Directory;
        // 目录自愈：不依赖 MCP 侧先创建，插件侧幂等补齐，避免"目录不存在 → 静默 return"
        try {
            Directory.CreateDirectory(this.requestsDir);
            Directory.CreateDirectory(this.responsesDir);
        } catch {
            return;
        }

        let files: CS.System.Array$1<string>;
        try {
            files = Directory.GetFiles(this.requestsDir, "*.json");
        } catch {
            return;
        }
        for (let i = 0; i < files.Length; i++) {
            this.processFile(files.get_Item(i));
        }
    }

    private processFile(path: string): void {
        const File = CS.System.IO.File;
        try {
            const raw = File.ReadAllText(path);
            const req = JSON.parse(raw) as MailboxHandlerRequest;
            const handler = this.handlers.get(req.method);
            let resp: MailboxHandlerResponse;
            if (!handler) {
                resp = { id: req.id, ok: false, error: `未注册的方法: ${req.method}` };
            } else {
                try {
                    // 注入请求 id，供异步（deferred）handler 回写响应时定位
                    const params = Object.assign({}, req.params ?? {}, { __requestId: req.id });
                    const result = handler(params);
                    if (isDeferredResult(result)) {
                        // 异步请求：响应由 handler 稍后经 writeResponse 写入；请求文件已读完，无需在此写
                        return;
                    }
                    resp = { id: req.id, ok: true, result };
                } catch (e: any) {
                    resp = { id: req.id, ok: false, error: String(e && e.message ? e.message : e) };
                }
            }
            // 先写 tmp 再改名，避免 MCP 侧读到半写文件
            const tmpPath = path + ".tmp";
            File.WriteAllText(tmpPath, JSON.stringify(resp));
            const respPath = CS.System.IO.Path.Combine(this.responsesDir, `${req.id}.json`);
            if (File.Exists(respPath)) File.Delete(respPath);
            File.Move(tmpPath, respPath);
        } catch (e: any) {
            console.log(`[fgui-mcp-probe] 处理请求 ${path} 异常: ${e}`);
        } finally {
            try {
                File.Delete(path);
            } catch {
                /* 清理失败忽略 */
            }
        }
    }
}

/** 遍历 List$1<T> 到数组（Puerts 集合访问形态统一封装）。 */
export function listToArray<T>(list: { Count: number; get_Item(i: number): T } | null): T[] {
    const out: T[] = [];
    if (!list) return out;
    for (let i = 0; i < list.Count; i++) out.push(list.get_Item(i));
    return out;
}
