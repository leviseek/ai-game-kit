import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

/**
 * 最小静态文件服务（Node 内置 http），替代对 python 的依赖。
 * 用于向 headless Chrome 提供构建产物。
 */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
};

export interface StaticServer {
  readonly port: number;
  close(): Promise<void>;
}

export async function serveDir(root: string, port = 0): Promise<StaticServer> {
  const server: Server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      let filePath = normalize(join(root, urlPath === "/" ? "index.html" : urlPath));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, "index.html");
      }
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const actualPort = (server.address() as { port: number }).port;
  return {
    port: actualPort,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
