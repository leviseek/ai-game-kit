import { watch as fsWatch } from "node:fs";
import { join, normalize } from "node:path";

export interface WatchHandle {
    dispose(): void;
}

export interface WatchBackend {
    watch(path: string, listener: (event: string, filename: string | Buffer | null) => void): WatchHandle;
}

export interface WatchProjectOptions {
    readonly backend?: WatchBackend;
}

const watchedRelativeDirs = ["assets", "tools", join("doc", "architecture"), join("doc", "decisions")] as const;

const ignoredSegments = new Set(["temp", ".codegraph", "node_modules", "third-party", ".superpowers"]);

export function watchProject(root: string, onChange: (path: string) => void, options?: WatchProjectOptions): WatchHandle {
    const backend = options?.backend ?? nodeWatchBackend;
    let disposed = false;
    const handles = watchedRelativeDirs.map((relativeDir) => {
        const watchedDir = join(root, relativeDir);
        return backend.watch(watchedDir, (_event, filename) => {
            if (disposed || filename === null) return;
            const relativePath = filename.toString();
            if (shouldIgnore(relativePath)) return;
            onChange(join(watchedDir, relativePath));
        });
    });

    return {
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const handle of handles) handle.dispose();
        },
    };
}

function shouldIgnore(path: string): boolean {
    const normalized = normalize(path);
    if (normalized.endsWith(".meta")) return true;
    return normalized.split(/[\\/]+/).some((segment) => ignoredSegments.has(segment));
}

const nodeWatchBackend: WatchBackend = {
    watch(path, listener) {
        const watcher = fsWatch(path, { recursive: true }, listener);
        return { dispose: () => watcher.close() };
    },
};
