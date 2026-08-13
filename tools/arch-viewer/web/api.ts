import type { GraphNode, GraphView, ViewType } from "../lib/graph/types.js";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ArchApiClientOptions {
    readonly baseUrl?: string;
    readonly fetch?: FetchLike;
}

export class ArchApiError extends Error {
    public constructor(
        public readonly status: number,
        public readonly path: string,
        message = `Arch API request failed: ${status} ${path}`,
    ) {
        super(message);
        this.name = "ArchApiError";
    }
}

export class ArchApiClient {
    private readonly baseUrl: string;
    private readonly fetchImpl: FetchLike;

    public constructor(options: ArchApiClientOptions = {}) {
        this.baseUrl = options.baseUrl ?? "";
        this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    }

    public project(): Promise<Readonly<Record<string, unknown>>> {
        return this.get("/api/project");
    }

    public view(type: ViewType): Promise<GraphView> {
        return this.get(`/api/views/${encodeURIComponent(type)}`);
    }

    public group(id: string): Promise<GraphView> {
        return this.get(`/api/groups/${encodeURIComponent(id)}`);
    }

    public search(query: string): Promise<readonly GraphNode[]> {
        return this.get(`/api/symbols/search?q=${encodeURIComponent(query)}`);
    }

    public neighborhood(id: string): Promise<GraphView> {
        return this.get(`/api/nodes/${encodeURIComponent(id)}/neighborhood`);
    }

    public async get<T>(path: string): Promise<T> {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`);
        if (!response.ok) throw new ArchApiError(response.status, path);
        return response.json() as Promise<T>;
    }
}
