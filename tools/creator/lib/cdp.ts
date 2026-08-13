import { spawn } from "node:child_process";
import { createServer, type Server } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome } from "./env";
import { killChromeByProfile } from "./proc";
import { sleep } from "./log";

/**
 * headless Chrome + CDP 冒烟：加载页面并收集 console 日志与页面错误。
 * 只清理自己启动的实例（按 user-data-dir 过滤），不杀用户浏览器。
 */
export interface CdpResult {
    readonly consoleLogs: readonly string[];
    readonly errors: readonly string[];
}

/** CDP 会话：交互回调内可注入真实输入、求值页面状态。 */
export interface CdpSession {
    /** 发送任意 CDP 命令并等待结果。 */
    send(method: string, params?: unknown): Promise<unknown>;
    /** 在页面上下文求值表达式并返回结果值（returnByValue）。 */
    evaluate(expression: string): Promise<unknown>;
    /** 在视口坐标注入一次真实鼠标左键点击（按下 + 抬起）。 */
    click(x: number, y: number): Promise<void>;
}

async function findFreePort(): Promise<number> {
    const server: Server = createServer();
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as { port: number }).port;
    server.close();
    return port;
}

async function waitForPageTarget(port: number, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json`);
            const targets = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
            const page = targets.find((target) => target.type === "page");
            if (page !== undefined) {
                return page.webSocketDebuggerUrl;
            }
        } catch {
            // Chrome 尚未就绪
        }
        await sleep(300);
    }
    throw new Error("Chrome CDP 目标超时");
}

export async function runCdpProbe(url: string, timeoutMs: number, interact?: (session: CdpSession) => Promise<void>): Promise<CdpResult> {
    const chromePath = findChrome();
    const profileDir = mkdtempSync(join(tmpdir(), "creator-cdp-"));
    const port = await findFreePort();
    const consoleLogs: string[] = [];
    const errors: string[] = [];

    const chrome = spawn(chromePath, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=1280,720", url], {
        stdio: "ignore",
    });

    try {
        const wsUrl = await waitForPageTarget(port, 15000);
        const ws = new WebSocket(wsUrl);
        await new Promise<void>((resolve, reject) => {
            ws.onopen = () => resolve();
            ws.onerror = () => reject(new Error("CDP WebSocket 连接失败"));
        });

        let id = 0;
        const pending = new Map<number, { resolve: (value: unknown) => void }>();
        const send = (method: string, params: unknown = {}) =>
            new Promise<unknown>((resolve) => {
                const msgId = ++id;
                pending.set(msgId, { resolve });
                ws.send(JSON.stringify({ id: msgId, method, params }));
            });

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data as string) as {
                id?: number;
                method?: string;
                result?: unknown;
                params?: {
                    args?: Array<{ value?: unknown; description?: string }>;
                    exceptionDetails?: unknown;
                    entry?: { level?: string; text?: string };
                };
            };
            if (msg.id !== undefined && pending.has(msg.id)) {
                pending.get(msg.id)?.resolve(msg.result);
                pending.delete(msg.id);
                return;
            }
            if (msg.method === "Runtime.consoleAPICalled") {
                const text = (msg.params?.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
                consoleLogs.push(text);
            }
            if (msg.method === "Runtime.exceptionThrown") {
                errors.push(JSON.stringify(msg.params?.exceptionDetails));
            }
            if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error" && msg.params.entry.text !== undefined) {
                errors.push(msg.params.entry.text);
            }
        };

        await send("Runtime.enable");
        await send("Log.enable");
        await send("Page.enable");
        if (interact !== undefined) {
            try {
                const session: CdpSession = {
                    send,
                    async evaluate(expression) {
                        const response = (await send("Runtime.evaluate", {
                            expression,
                            returnByValue: true,
                        })) as {
                            result?: { value?: unknown };
                            exceptionDetails?: {
                                text?: string;
                                exception?: { description?: string };
                            };
                        };
                        // 页面内求值异常必须上报，否则吞错会让交互断言建立在假阳性上
                        if (response?.exceptionDetails !== undefined && response?.exceptionDetails !== null) {
                            const detail = response.exceptionDetails;
                            const message = detail.exception?.description ?? detail.text ?? "未知求值异常";
                            throw new Error(`页面求值失败: ${message}`);
                        }
                        return response?.result?.value;
                    },
                    async click(x, y) {
                        const base = { x, y, button: "left" as const, clickCount: 1 };
                        await send("Input.dispatchMouseEvent", {
                            type: "mousePressed",
                            ...base,
                        });
                        await send("Input.dispatchMouseEvent", {
                            type: "mouseReleased",
                            ...base,
                        });
                    },
                };
                await interact(session);
            } catch (error) {
                // 交互断言失败（如遮罩未阻断、下层未恢复）记录到 errors，不中断清理
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }
        await sleep(timeoutMs);
        ws.close();
    } finally {
        chrome.kill();
        killChromeByProfile(profileDir);
        rmSync(profileDir, { recursive: true, force: true });
    }

    return { consoleLogs, errors };
}
