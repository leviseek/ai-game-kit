import type { SourceLocation } from "../lib/graph/types.js";

export function createVsCodeUrl(location: SourceLocation): string {
    const suffix = [location.line, location.column]
        .filter((value): value is number => value !== undefined)
        .map((value) => `:${value}`)
        .join("");
    return `vscode://file/${encodeURIComponent(location.filePath)}${suffix}`;
}
