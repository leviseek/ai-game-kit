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

async function waitForPageTarget(
  port: number,
  timeoutMs: number,
): Promise<string> {
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

export async function runCdpProbe(
  url: string,
  timeoutMs: number,
): Promise<CdpResult> {
  const chromePath = findChrome();
  const profileDir = mkdtempSync(join(tmpdir(), "creator-cdp-"));
  const port = await findFreePort();
  const consoleLogs: string[] = [];
  const errors: string[] = [];

  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--window-size=1280,720",
      url,
    ],
    { stdio: "ignore" },
  );

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
        const text = (msg.params?.args ?? [])
          .map((arg) => arg.value ?? arg.description ?? "")
          .join(" ");
        consoleLogs.push(text);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        errors.push(JSON.stringify(msg.params?.exceptionDetails));
      }
      if (
        msg.method === "Log.entryAdded" &&
        msg.params?.entry?.level === "error"
      ) {
        errors.push(msg.params.entry.text);
      }
    };

    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await sleep(timeoutMs);
    ws.close();
  } finally {
    chrome.kill();
    killChromeByProfile(profileDir);
    rmSync(profileDir, { recursive: true, force: true });
  }

  return { consoleLogs, errors };
}
