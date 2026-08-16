import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:net";
import { findFreePort, waitForPageTarget } from "../lib/cdp";

describe("findFreePort", () => {
    it("返回可用的空闲端口（数字且在合法范围）", async () => {
        const port = await findFreePort();
        expect(typeof port).toBe("number");
        expect(port).toBeGreaterThan(0);
        expect(port).toBeLessThan(65536);
    });
});

describe("waitForPageTarget（假 CDP server，不启动 Chrome）", () => {
    let server: Server | undefined;

    afterEach(() => {
        server?.close();
        server = undefined;
    });

    /** 启动一个返回指定 /json 响应的假 CDP server，返回其端口。 */
    async function startFakeCdp(targets: unknown[]): Promise<number> {
        server = createServer((socket) => {
            let buffer = "";
            socket.on("data", (chunk) => {
                buffer += chunk.toString();
                const end = buffer.indexOf("\r\n\r\n");
                if (end < 0) return;
                const head = buffer.slice(0, end);
                const firstLine = head.split("\r\n")[0];
                const url = firstLine.split(" ")[1] ?? "/";
                const body = JSON.stringify(url === "/json" ? targets : {});
                socket.write(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
                socket.end();
                buffer = "";
            });
        });
        await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
        const address = server.address() as { port: number };
        return address.port;
    }

    it("命中 page 目标返回其 WebSocket URL", async () => {
        const port = await startFakeCdp([
            { type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:9999/devtools/page/fake" },
            { type: "service_worker", webSocketDebuggerUrl: "ws://ignored" },
        ]);
        const wsUrl = await waitForPageTarget(port, 2000);
        expect(wsUrl).toBe("ws://127.0.0.1:9999/devtools/page/fake");
    });

    it("无 page 目标时超时抛错", async () => {
        const port = await startFakeCdp([]);
        await expect(waitForPageTarget(port, 300)).rejects.toThrow("Chrome CDP 目标超时");
    });

    it("端口未监听时超时抛错", async () => {
        await expect(waitForPageTarget(1, 300)).rejects.toThrow("Chrome CDP 目标超时");
    });
});
