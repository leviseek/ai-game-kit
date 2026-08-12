import type { SymbolRef } from "../config/types";
import type { Diagnostic } from "../graph/types";
import {
    CodeGraphCommandError,
    CodeGraphJsonError,
    CodeGraphTimeoutError,
} from "./errors";
import {
    runCodeGraphCommand,
    type CommandRunner,
} from "./process";
import type {
    CodeGraphFile,
    CodeGraphNode,
    CodeGraphRelationNode,
    CodeGraphStatus,
} from "./types";

const limits = { timeoutMs: 15_000, maxBuffer: 16 * 1024 * 1024 } as const;

interface QueryResult {
    readonly node: CodeGraphNode;
    readonly score: number;
}

interface ImpactResult {
    readonly symbol: string;
    readonly depth: number;
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly affected: readonly CodeGraphRelationNode[];
}

export interface CodeGraphGateway {
    status(): Promise<CodeGraphStatus>;
    sync(): Promise<void>;
    files(): Promise<readonly CodeGraphFile[]>;
    search(search: string, limit?: number): Promise<readonly CodeGraphNode[]>;
    callers(symbol: string): Promise<readonly CodeGraphRelationNode[]>;
    callees(symbol: string): Promise<readonly CodeGraphRelationNode[]>;
    impact(symbol: string): Promise<readonly CodeGraphRelationNode[]>;
    resolveSymbol(ref: SymbolRef): Promise<CodeGraphNode | Diagnostic>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
    return typeof value[key] === "string";
}

function hasNumber(value: Record<string, unknown>, key: string): boolean {
    return typeof value[key] === "number" && Number.isFinite(value[key]);
}

function hasBoolean(value: Record<string, unknown>, key: string): boolean {
    return typeof value[key] === "boolean";
}

function isOptionalString(value: Record<string, unknown>, key: string): boolean {
    return value[key] === undefined || typeof value[key] === "string";
}

function isOptionalBoolean(value: Record<string, unknown>, key: string): boolean {
    return value[key] === undefined || typeof value[key] === "boolean";
}

function isCodeGraphNode(value: unknown): value is CodeGraphNode {
    if (!isRecord(value)) return false;
    const strings = ["id", "kind", "name", "qualifiedName", "filePath", "language"];
    const numbers = ["startLine", "endLine", "startColumn", "endColumn", "updatedAt"];
    const booleans = ["isExported", "isAsync", "isStatic", "isAbstract"];
    return strings.every((key) => hasString(value, key))
        && numbers.every((key) => hasNumber(value, key))
        && booleans.every((key) => isOptionalBoolean(value, key))
        && (value.visibility === undefined || value.visibility === null || typeof value.visibility === "string")
        && isOptionalString(value, "docstring")
        && isOptionalString(value, "signature");
}

function isRelationNode(value: unknown): value is CodeGraphRelationNode {
    return isRecord(value)
        && ["name", "kind", "filePath"].every((key) => hasString(value, key))
        && hasNumber(value, "startLine");
}

function isFile(value: unknown): value is CodeGraphFile {
    return isRecord(value)
        && hasString(value, "path")
        && hasString(value, "language")
        && hasNumber(value, "nodeCount")
        && hasNumber(value, "size");
}

function isStatus(value: unknown): value is CodeGraphStatus {
    if (!isRecord(value)
        || !hasBoolean(value, "initialized")
        || !hasString(value, "version")
        || !hasString(value, "projectPath")
        || !hasString(value, "indexPath")
        || !(value.lastIndexed === null || typeof value.lastIndexed === "string")) return false;
    const optionalNumbers = ["fileCount", "nodeCount", "edgeCount", "dbSizeBytes"];
    const optionalStrings = ["backend", "journalMode"];
    return optionalNumbers.every((key) => value[key] === undefined || hasNumber(value, key))
        && optionalStrings.every((key) => isOptionalString(value, key))
        && isNumberRecord(value.nodesByKind)
        && isStringArray(value.languages)
        && isPendingChanges(value.pendingChanges)
        && isWorktreeMismatch(value.worktreeMismatch)
        && isIndexStatus(value.index);
}

function isNumberRecord(value: unknown): boolean {
    return value === undefined || (isRecord(value)
        && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item)));
}

function isStringArray(value: unknown): boolean {
    return value === undefined || (Array.isArray(value)
        && value.every((item) => typeof item === "string"));
}

function isPendingChanges(value: unknown): boolean {
    return value === undefined || (isRecord(value)
        && ["added", "modified", "removed"].every((key) => hasNumber(value, key)));
}

function isIndexStatus(value: unknown): boolean {
    return value === undefined || (isRecord(value)
        && hasString(value, "builtWithVersion")
        && hasNumber(value, "builtWithExtractionVersion")
        && hasNumber(value, "currentExtractionVersion")
        && hasBoolean(value, "reindexRecommended")
        && hasString(value, "state")
        && hasNumber(value, "pendingRefs"));
}

function isWorktreeMismatch(value: unknown): boolean {
    return value === undefined || value === null || (isRecord(value)
        && hasString(value, "worktreeRoot")
        && hasString(value, "indexRoot"));
}

function isQueryResults(value: unknown): value is readonly QueryResult[] {
    return Array.isArray(value) && value.every((item) => isRecord(item)
        && isCodeGraphNode(item.node) && hasNumber(item, "score"));
}

function isFiles(value: unknown): value is readonly CodeGraphFile[] {
    return Array.isArray(value) && value.every(isFile);
}

function isRelationResult(
    value: unknown,
    key: "callers" | "callees",
): value is Record<"symbol", string> & Record<typeof key, readonly CodeGraphRelationNode[]> {
    return isRecord(value)
        && hasString(value, "symbol")
        && Array.isArray(value[key])
        && value[key].every(isRelationNode);
}

function isImpactResult(value: unknown): value is ImpactResult {
    return isRecord(value)
        && hasString(value, "symbol")
        && hasNumber(value, "depth")
        && hasNumber(value, "nodeCount")
        && hasNumber(value, "edgeCount")
        && Array.isArray(value.affected)
        && value.affected.every(isRelationNode);
}

function isTimeout(error: unknown): boolean {
    return isRecord(error) && (error.code === "ETIMEDOUT" || error.killed === true);
}

export function createCodeGraphGateway(options?: {
    readonly projectRoot?: string;
    readonly runner?: CommandRunner;
}): CodeGraphGateway {
    const projectRoot = options?.projectRoot ?? process.cwd();
    const runner = options?.runner ?? runCodeGraphCommand;

    async function run(args: readonly string[]) {
        try {
            return await runner(args, limits);
        } catch (error) {
            if (isTimeout(error)) throw new CodeGraphTimeoutError(args, limits.timeoutMs, { cause: error });
            throw error;
        }
    }

    async function runJson<T>(args: readonly string[], guard: (value: unknown) => value is T): Promise<T> {
        const commandArgs = [...args, "--json"];
        const result = await run(commandArgs);
        if (result.exitCode !== 0) {
            throw new CodeGraphCommandError(args, result.stderr, result.exitCode);
        }
        try {
            const value: unknown = JSON.parse(result.stdout);
            if (!guard(value)) throw new CodeGraphJsonError(args);
            return value;
        } catch (error) {
            if (error instanceof CodeGraphJsonError) throw error;
            throw new CodeGraphJsonError(args, { cause: error });
        }
    }

    async function search(search: string, limit?: number): Promise<readonly CodeGraphNode[]> {
        const limitArgs = limit === undefined ? [] : ["--limit", String(limit)];
        const results = await runJson(
            ["query", search, "--path", projectRoot, ...limitArgs],
            isQueryResults,
        );
        return results.map((result) => result.node);
    }

    return {
        status: () => runJson(["status", projectRoot], isStatus),
        async sync() {
            const args = ["sync", "--quiet", projectRoot] as const;
            const result = await run(args);
            if (result.exitCode !== 0) {
                throw new CodeGraphCommandError(args, result.stderr, result.exitCode);
            }
        },
        files: () => runJson(
            ["files", "--path", projectRoot, "--format", "flat"],
            isFiles,
        ),
        search,
        async callers(symbol) {
            const result = await runJson(
                ["callers", symbol, "--path", projectRoot],
                (value): value is { readonly symbol: string; readonly callers: readonly CodeGraphRelationNode[] } =>
                    isRelationResult(value, "callers"),
            );
            return result.callers;
        },
        async callees(symbol) {
            const result = await runJson(
                ["callees", symbol, "--path", projectRoot],
                (value): value is { readonly symbol: string; readonly callees: readonly CodeGraphRelationNode[] } =>
                    isRelationResult(value, "callees"),
            );
            return result.callees;
        },
        async impact(symbol) {
            const result = await runJson(
                ["impact", symbol, "--path", projectRoot],
                isImpactResult,
            );
            return result.affected;
        },
        async resolveSymbol(ref) {
            const matches = await search(ref.name, 100);
            const qualified = matches.filter((node) => node.qualifiedName === ref.name);
            if (qualified.length === 1) return qualified[0];

            const exact = qualified.length > 0
                ? qualified
                : matches.filter((node) => node.name === ref.name);
            const candidates = ref.file
                ? exact.filter((node) => node.filePath === ref.file)
                : exact;
            if (candidates.length === 1) return candidates[0];

            const suffix = candidates.length === 0
                ? "was not found"
                : `is ambiguous (${candidates.length} matches)`;
            return {
                severity: "error",
                source: "codegraph",
                message: `Symbol "${ref.name}" ${suffix}`,
            };
        },
    };
}

export type {
    CodeGraphFile,
    CodeGraphNode,
    CodeGraphRelationNode,
    CodeGraphStatus,
};
