import type { ServerResponse } from "node:http";

import type { GraphSnapshotStore, SnapshotEvent } from "./snapshot-store";

export function attachSse(response: ServerResponse, store: GraphSnapshotStore): () => void {
    response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    });
    response.write(": keep-alive\n\n");

    const unsubscribe = store.subscribe((event) => writeEvent(response, event));
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        response.end();
    };
    response.on("close", close);
    response.on("error", close);
    return close;
}

function writeEvent(response: ServerResponse, event: SnapshotEvent): void {
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
}
