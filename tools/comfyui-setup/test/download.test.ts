import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadFile, probeSize } from "../lib/download";

/** 构造随机内容假文件（256KB，8 分片测试块），支持 Range 请求。 */
function startFakeStatic(): Promise<{ server: Server; port: number; payload: Buffer }> {
    const payload = Buffer.alloc(256 * 1024);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 31) % 256;
    const server = createServer((req, res) => {
        const range = req.headers.range;
        if (range === undefined) {
            res.writeHead(200, { "Content-Length": payload.length });
            res.end(payload);
            return;
        }
        const match = /^bytes=(\d+)-(\d+)$/.exec(range);
        if (match === null) {
            res.writeHead(416);
            res.end();
            return;
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${payload.length}`,
            "Content-Length": end - start + 1,
        });
        res.end(payload.subarray(start, end + 1));
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address() as { port: number };
            resolve({ server, port: address.port, payload });
        });
    });
}

describe("多线程分片下载", () => {
    let server: Server | undefined;
    let dir: string;
    let payload: Buffer;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "comfyui-dl-"));
    });
    afterEach(() => {
        server?.close();
        server = undefined;
        rmSync(dir, { recursive: true, force: true });
    });

    it("probeSize 解析 Content-Range 总大小", async () => {
        const s = await startFakeStatic();
        server = s.server;
        payload = s.payload;
        const size = await probeSize(`http://127.0.0.1:${s.port}/file.bin`);
        expect(size).toBe(payload.length);
    });

    it("并发分片下载产物字节一致（内容校验）", async () => {
        const s = await startFakeStatic();
        server = s.server;
        payload = s.payload;
        const out = join(dir, "out.bin");
        const result = await downloadFile(`http://127.0.0.1:${s.port}/file.bin`, out, { threads: 4 });
        expect(result.skipped).toBe(false);
        expect(result.totalBytes).toBe(payload.length);
        expect(statSync(out).size).toBe(payload.length);
        expect(readFileSync(out)).toEqual(payload);
    });

    it("已存在且大小一致时跳过下载", async () => {
        const s = await startFakeStatic();
        server = s.server;
        payload = s.payload;
        const out = join(dir, "out.bin");
        await downloadFile(`http://127.0.0.1:${s.port}/file.bin`, out, { threads: 4 });
        const result = await downloadFile(`http://127.0.0.1:${s.port}/file.bin`, out, { threads: 4 });
        expect(result.skipped).toBe(true);
    });
});
