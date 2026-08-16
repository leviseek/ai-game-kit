import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createComfyUiGenerator } from "../generators/comfyui";
import { validateArtifacts } from "../lib/artifact-validation";

/** 构造最小合法 PNG（1x1，真实魔数 + IHDR）。 */
function pngBytes(): Buffer {
    const png = Buffer.alloc(8 + 25 + 12 + 12);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1, 16);
    png.writeUInt32BE(1, 20);
    png.writeUInt32BE(8, 24);
    png.writeUInt32BE(6, 28);
    png.writeUInt32BE(0, 37);
    png.write("IEND", 41, "ascii");
    return png;
}

/** 假 ComfyUI 服务器：/prompt → prompt_id；/history 首次空、随后返回图片；/view 返回 PNG。 */
function startFakeComfyUi(): Promise<{ server: Server; port: number }> {
    const png = pngBytes();
    let historyCalls = 0;
    const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const path = url.pathname;
        if (req.method === "POST" && path === "/prompt") {
            let body = "";
            req.on("data", (chunk) => (body += chunk.toString()));
            req.on("end", () => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ prompt_id: "test-prompt-1" }));
            });
            return;
        }
        if (req.method === "GET" && path === "/history/test-prompt-1") {
            historyCalls++;
            const outputs =
                historyCalls >= 2
                    ? { "9": { images: [{ filename: "out_a.png", subfolder: "", type: "output" }] } }
                    : {};
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ "test-prompt-1": { outputs } }));
            return;
        }
        if (req.method === "GET" && path === "/view") {
            res.writeHead(200, { "Content-Type": "image/png" });
            res.end(png);
            return;
        }
        res.writeHead(404);
        res.end("not found");
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address() as { port: number };
            resolve({ server, port: address.port });
        });
    });
}

describe("comfyui 适配器（假服务器协议验证）", () => {
    let server: Server | undefined;
    let staging: string;

    beforeEach(() => {
        staging = mkdtempSync(join(tmpdir(), "comfyui-test-"));
    });
    afterEach(() => {
        server?.close();
        server = undefined;
        rmSync(staging, { recursive: true, force: true });
    });

    it("全协议交互：POST /prompt → 轮询 /history → GET /view 下载 → 契约校验通过", async () => {
        const { server: srv, port } = await startFakeComfyUi();
        server = srv;
        const generator = createComfyUiGenerator({ endpoint: `http://127.0.0.1:${port}`, pollIntervalMs: 10, timeoutMs: 5000 });
        const result = await generator.generate(staging, { workflow: '{"3":{"class_type":"KSampler"}}', id: "img_hero" });
        expect(result.artifacts).toHaveLength(1);
        const file = join(staging, "img_hero_0.png");
        expect(existsSync(file)).toBe(true);
        expect(readFileSync(file).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        expect(validateArtifacts(staging, result.artifacts)).toHaveLength(0);
    });

    it("workflow-file 读取", async () => {
        const { server: srv, port } = await startFakeComfyUi();
        server = srv;
        const workflowFile = join(staging, "wf.json");
        const { writeFileSync } = await import("node:fs");
        writeFileSync(workflowFile, '{"3":{"class_type":"KSampler"}}');
        const generator = createComfyUiGenerator({ endpoint: `http://127.0.0.1:${port}`, pollIntervalMs: 10, timeoutMs: 5000 });
        const result = await generator.generate(staging, { "workflow-file": workflowFile });
        expect(result.artifacts).toHaveLength(1);
    });

    it("--name 单产物定名（序列帧首帧命名约定）", async () => {
        const { server: srv, port } = await startFakeComfyUi();
        server = srv;
        const generator = createComfyUiGenerator({ endpoint: `http://127.0.0.1:${port}`, pollIntervalMs: 10, timeoutMs: 5000 });
        const result = await generator.generate(staging, { workflow: '{"3":{"class_type":"KSampler"}}', id: "warrior_ai_idle", name: "warrior_ai_idle_00" });
        expect(result.artifacts).toHaveLength(1);
        expect(result.artifacts[0]!.relPath).toBe("warrior_ai_idle_00.png");
        expect(existsSync(join(staging, "warrior_ai_idle_00.png"))).toBe(true);
    });

    it("未配置端点抛明确错误", async () => {
        const generator = createComfyUiGenerator({ endpoint: undefined });
        delete process.env.COMFYUI_ENDPOINT;
        await expect(generator.generate(staging, { workflow: "{}" })).rejects.toThrow(/未配置端点/);
    });
});
