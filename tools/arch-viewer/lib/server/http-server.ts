import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import { attachSse } from "./sse";
import type { GraphSnapshotStore } from "./snapshot-store";
import { serveStaticAsset, type StaticAssetOptions } from "./static";
import { routeApi, writeJson } from "./routes";

export interface ArchServerOptions {
    readonly projectRoot: string;
    readonly store: GraphSnapshotStore;
    readonly port?: number;
    readonly static?: StaticAssetOptions;
}

export interface ArchServerHandle {
    readonly port: number;
    readonly url: string;
    close(): Promise<void>;
}

export async function startArchServer(options: ArchServerOptions): Promise<ArchServerHandle> {
    const projectRoot = resolve(options.projectRoot);
    const sseConnections = new Set<() => void>();
    const server: Server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/favicon.ico") {
            response.writeHead(204);
            response.end();
            return;
        }
        if (url.pathname === "/api/events" && request.method === "GET") {
            const closeSse = attachSse(response, options.store);
            const dispose = () => {
                sseConnections.delete(dispose);
                closeSse();
            };
            sseConnections.add(dispose);
            response.on("close", () => sseConnections.delete(dispose));
            return;
        }
        if (url.pathname.startsWith("/api/")) {
            void routeApi(request, response, { projectRoot, store: options.store });
            return;
        }
        if (options.static !== undefined) {
            void serveStaticAsset(request, response, options.static).then((handled) => {
                if (!handled) writeJson(response, 404, { error: "not_found" });
            });
            return;
        }
        writeJson(response, 404, { error: "not_found" });
    });

    await new Promise<void>((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(options.port ?? 0, "127.0.0.1", resolveListen);
    });

    const address = server.address();
    if (typeof address === "string" || address === null) {
        await closeServer(server);
        throw new Error("server address unavailable");
    }
    const port = (address as AddressInfo).port;
    return {
        port,
        url: `http://127.0.0.1:${port}`,
        close: async () => {
            for (const closeSse of [...sseConnections]) closeSse();
            await closeServer(server);
        },
    };
}

function closeServer(server: Server): Promise<void> {
    return new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
            if (error !== undefined) rejectClose(error);
            else resolveClose();
        });
    });
}
