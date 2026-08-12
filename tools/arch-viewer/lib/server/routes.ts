import type { IncomingMessage, ServerResponse } from "node:http";

import { createArchitectureQueryService } from "../analysis/query-service";
import type { GraphSnapshot, ViewType } from "../graph/types";
import { readSourceExcerpt, SourceReadError } from "./source";
import type { GraphSnapshotStore } from "./snapshot-store";

export interface RouteApiOptions {
    readonly projectRoot: string;
    readonly store: GraphSnapshotStore;
}

const viewTypes = new Set<ViewType>(["hierarchy", "startup", "dependencies", "data-flow", "calls", "resources"]);

export async function routeApi(request: IncomingMessage, response: ServerResponse, options: RouteApiOptions): Promise<void> {
    if (request.method !== "GET") {
        writeJson(response, 405, { error: "method_not_allowed" });
        return;
    }
    try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const snapshot = options.store.current().snapshot;
        if (url.pathname === "/api/source") {
            await handleSource(response, options.projectRoot, url);
            return;
        }
        if (snapshot === undefined) {
            writeJson(response, 503, { error: "snapshot_unavailable" });
            return;
        }
        routeSnapshotRequest(response, segments, url, snapshot);
    } catch (error) {
        handleRouteError(response, error);
    }
}

export function writeJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
}

function routeSnapshotRequest(response: ServerResponse, segments: readonly string[], url: URL, snapshot: GraphSnapshot): void {
    const service = createArchitectureQueryService(snapshot);
    if (segments.length === 2 && segments[0] === "api" && segments[1] === "project") {
        writeJson(response, 200, service.project());
        return;
    }
    if (segments.length === 3 && segments[0] === "api" && segments[1] === "views" && isViewType(segments[2])) {
        writeJson(response, 200, service.view(segments[2]));
        return;
    }
    if (segments.length === 3 && segments[0] === "api" && segments[1] === "groups") {
        const group = service.group(segments[2]!);
        writeJson(response, group === undefined ? 404 : 200, group ?? { error: "not_found" });
        return;
    }
    if (segments.length === 3 && segments[0] === "api" && segments[1] === "symbols" && segments[2] === "search") {
        writeJson(response, 200, service.search(url.searchParams.get("q") ?? ""));
        return;
    }
    if (segments.length === 4 && segments[0] === "api" && segments[1] === "nodes" && segments[3] === "neighborhood") {
        const neighborhood = service.neighborhood(segments[2]!);
        writeJson(response, neighborhood === undefined ? 404 : 200, neighborhood ?? { error: "not_found" });
        return;
    }
    writeJson(response, 404, { error: "not_found" });
}

async function handleSource(response: ServerResponse, projectRoot: string, url: URL): Promise<void> {
    const file = url.searchParams.get("file");
    if (file === null || file.trim() === "") {
        writeJson(response, 400, { error: "bad_request" });
        return;
    }
    const line = Number(url.searchParams.get("line") ?? "1");
    const radius = Number(url.searchParams.get("radius") ?? "20");
    writeJson(response, 200, await readSourceExcerpt(projectRoot, file, line, radius));
}

function handleRouteError(response: ServerResponse, error: unknown): void {
    if (error instanceof URIError) {
        writeJson(response, 400, { error: "bad_request" });
        return;
    }
    if (error instanceof SourceReadError) {
        writeJson(response, error.code === "forbidden" ? 403 : 404, { error: error.code });
        return;
    }
    writeJson(response, 500, { error: "internal_error" });
}

function isViewType(value: string | undefined): value is ViewType {
    return value !== undefined && viewTypes.has(value as ViewType);
}
