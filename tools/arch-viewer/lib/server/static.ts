import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import path from "node:path";

export interface StaticAssetOptions {
    readonly webRoot: string;
    readonly compiledRoot: string;
}

export interface StaticAssetFileSystem {
    readonly realpath: (path: string) => Promise<string>;
}

const nodeStaticFileSystem: StaticAssetFileSystem = { realpath };

interface StaticPathApi {
    readonly relative: (from: string, to: string) => string;
    readonly sep: string;
    readonly isAbsolute: (path: string) => boolean;
}

const MIME: Readonly<Record<string, string>> = Object.freeze({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
});

export async function serveStaticAsset(
    request: IncomingMessage,
    response: ServerResponse,
    options: StaticAssetOptions,
): Promise<boolean> {
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let pathname: string;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("bad request");
        return true;
    }
    if (pathname.startsWith("/api/")) return false;

    const route = pathname === "/" ? "/index.html" : pathname;
    const root = route.endsWith(".js") || route.endsWith(".mjs") || route.endsWith(".map")
        ? resolve(options.compiledRoot)
        : resolve(options.webRoot);
    const filePath = resolve(root, route.replace(/^\/+/, ""));
    if (!isInsideStaticRoot(root, filePath)) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("forbidden");
        return true;
    }

    try {
        let target = filePath;
        const info = await stat(target);
        if (info.isDirectory()) target = join(target, "index.html");
        if (!await isRealPathInsideStaticRoot(root, target)) {
            response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("forbidden");
            return true;
        }
        const data = await readFile(target);
        response.writeHead(200, { "Content-Type": MIME[extname(target)] ?? "application/octet-stream" });
        if (request.method === "HEAD") response.end();
        else response.end(data);
    } catch {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("not found");
    }
    return true;
}

export function isInsideStaticRoot(root: string, target: string, pathApi: StaticPathApi = path): boolean {
    const rel = pathApi.relative(root, target);
    return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${pathApi.sep}`) && !pathApi.isAbsolute(rel));
}

export async function isRealPathInsideStaticRoot(
    root: string,
    target: string,
    fileSystem: StaticAssetFileSystem = nodeStaticFileSystem,
): Promise<boolean> {
    const realRoot = await fileSystem.realpath(root);
    const realTarget = await fileSystem.realpath(target);
    return isInsideStaticRoot(realRoot, realTarget);
}
