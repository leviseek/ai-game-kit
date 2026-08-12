import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface SourceLine {
    readonly number: number;
    readonly text: string;
}

export interface SourceExcerpt {
    readonly location: {
        readonly filePath: string;
        readonly line: number;
    };
    readonly startLine: number;
    readonly endLine: number;
    readonly lines: readonly SourceLine[];
}

export class SourceReadError extends Error {
    public constructor(public readonly code: "forbidden" | "not_found", message: string) {
        super(message);
    }
}

const MAX_SOURCE_LINES = 80;

export async function readSourceExcerpt(root: string, file: string, line: number, radius = 20): Promise<SourceExcerpt> {
    const projectRoot = resolve(root);
    const absolute = resolve(projectRoot, file);
    const safeFile = toSafeRelativePath(projectRoot, absolute);
    const source = await readSafeSource(absolute);
    const allLines = source.split(/\r?\n/);
    const targetLine = normalizeLine(line, allLines.length);
    const normalizedRadius = Math.max(0, Math.floor(radius));
    const desiredStart = Math.max(1, targetLine - normalizedRadius);
    const desiredEnd = Math.min(allLines.length, targetLine + normalizedRadius);
    const windowSize = Math.min(MAX_SOURCE_LINES, desiredEnd - desiredStart + 1);
    const halfBefore = Math.floor(windowSize / 2);
    const centeredStart = targetLine - halfBefore;
    const startLine = Math.max(1, Math.min(centeredStart, allLines.length - windowSize + 1));
    const endLine = startLine + windowSize - 1;

    return {
        location: { filePath: safeFile, line: targetLine },
        startLine,
        endLine,
        lines: allLines.slice(startLine - 1, endLine).map((text, index) => ({ number: startLine + index, text })),
    };
}

function toSafeRelativePath(projectRoot: string, absolute: string): string {
    const rel = relative(projectRoot, absolute);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
        throw new SourceReadError("forbidden", "forbidden");
    }
    return rel.split(sep).join("/");
}

async function readSafeSource(absolute: string): Promise<string> {
    try {
        return await readFile(absolute, "utf8");
    } catch {
        throw new SourceReadError("not_found", "not found");
    }
}

function normalizeLine(line: number, totalLines: number): number {
    if (!Number.isFinite(line)) return 1;
    return Math.max(1, Math.min(Math.floor(line), Math.max(totalLines, 1)));
}
