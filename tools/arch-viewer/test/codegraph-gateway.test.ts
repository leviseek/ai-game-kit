import { describe, expect, test } from "bun:test";

import type { SymbolRef } from "../lib/config/types";
import {
    createCodeGraphGateway,
    type CodeGraphGateway,
} from "../lib/codegraph/gateway";
import {
    CodeGraphCommandError,
    CodeGraphJsonError,
    CodeGraphTimeoutError,
} from "../lib/codegraph/errors";
import type {
    CommandResult,
    CommandRunner,
} from "../lib/codegraph/process";

const projectRoot = "D:/repo";

const launchNode = {
    id: "function:launch",
    kind: "function",
    name: "launch",
    qualifiedName: "createBootFlow::launch",
    filePath: "assets/boot/flow/BootFlow.ts",
    language: "typescript",
    startLine: 173,
    endLine: 192,
    startColumn: 4,
    endColumn: 5,
    signature: "(): Promise<void>",
    visibility: null,
    isExported: true,
    isAsync: true,
    isStatic: false,
    isAbstract: false,
    updatedAt: 1786272393087,
} as const;

const duplicateLaunchResults = [
    { node: launchNode, score: 109.4 },
    {
        node: {
            ...launchNode,
            id: "method:launch",
            qualifiedName: "TestHarness::launch",
            filePath: "tests/boot/BootFlow.test.ts",
        },
        score: 92.1,
    },
];

function success(stdout: unknown): CommandResult {
    return {
        exitCode: 0,
        stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
        stderr: "",
    };
}

function fakeRunner(
    responses: Readonly<Record<string, CommandResult | Error>>,
): CommandRunner {
    return async (args) => {
        const response = responses[args[0] ?? ""];
        if (response instanceof Error) throw response;
        if (!response) throw new Error(`Unexpected command: ${args.join(" ")}`);
        return response;
    };
}

function gatewayWith(
    responses: Readonly<Record<string, CommandResult | Error>>,
): CodeGraphGateway {
    return createCodeGraphGateway({
        projectRoot,
        runner: fakeRunner(responses),
    });
}

describe("CodeGraphGateway", () => {
    test("resolveSymbol 用 file 消歧 qualifiedName", async () => {
        const gateway = gatewayWith({ query: success(duplicateLaunchResults) });

        const result = await gateway.resolveSymbol({
            name: "launch",
            file: "assets/boot/flow/BootFlow.ts",
        });

        expect("qualifiedName" in result && result.qualifiedName).toBe(
            "createBootFlow::launch",
        );
    });

    test("resolveSymbol 优先精确匹配 qualifiedName", async () => {
        const gateway = gatewayWith({ query: success(duplicateLaunchResults) });

        const result = await gateway.resolveSymbol({
            name: "TestHarness::launch",
        });

        expect("filePath" in result && result.filePath).toBe(
            "tests/boot/BootFlow.test.ts",
        );
    });

    test("resolveSymbol 无 file 且名称多义时返回诊断", async () => {
        const gateway = gatewayWith({ query: success(duplicateLaunchResults) });

        const result = await gateway.resolveSymbol({ name: "launch" });

        expect(result).toEqual({
            severity: "error",
            source: "codegraph",
            message: 'Symbol "launch" is ambiguous (2 matches)',
        });
    });

    test("非零退出保留 stderr", async () => {
        const gateway = gatewayWith({
            status: {
                exitCode: 2,
                stdout: "",
                stderr: "index is locked",
            },
        });

        const error = await gateway.status().catch((value: unknown) => value);

        expect(error).toBeInstanceOf(CodeGraphCommandError);
        expect((error as CodeGraphCommandError).stderr).toBe("index is locked");
    });

    test("runner 超时归类为 CodeGraphTimeoutError", async () => {
        const timeout = Object.assign(new Error("killed"), {
            code: "ETIMEDOUT",
            killed: true,
        });
        const gateway = gatewayWith({ status: timeout });

        const error = await gateway.status().catch((value: unknown) => value);

        expect(error).toBeInstanceOf(CodeGraphTimeoutError);
    });

    test("非法 JSON 归类为 CodeGraphJsonError", async () => {
        const gateway = gatewayWith({ status: success("not-json") });

        const error = await gateway.status().catch((value: unknown) => value);

        expect(error).toBeInstanceOf(CodeGraphJsonError);
    });

    test("合法 JSON 但 DTO shape 非法也归类为 CodeGraphJsonError", async () => {
        const gateway = gatewayWith({
            query: success([{ node: { ...launchNode, startLine: "173" }, score: 1 }]),
        });

        const error = await gateway.search("launch").catch((value: unknown) => value);

        expect(error).toBeInstanceOf(CodeGraphJsonError);
    });

    test("status 的可选嵌套 DTO 仍严格校验", async () => {
        const gateway = gatewayWith({
            status: success({
                initialized: true,
                version: "1.5.0",
                projectPath: projectRoot,
                indexPath: `${projectRoot}/.codegraph`,
                lastIndexed: "2026-08-12T00:00:00.000Z",
                pendingChanges: { added: 0, modified: "1", removed: 0 },
            }),
        });

        const error = await gateway.status().catch((value: unknown) => value);

        expect(error).toBeInstanceOf(CodeGraphJsonError);
    });

    test("callers、callees 与 impact 返回严格校验后的关系节点", async () => {
        const relation = {
            name: "start",
            kind: "method",
            filePath: "assets/boot/AppRoot.ts",
            startLine: 135,
        };
        const gateway = gatewayWith({
            callers: success({ symbol: "launch", callers: [relation] }),
            callees: success({ symbol: "launch", callees: [relation] }),
            impact: success({
                symbol: "launch",
                depth: 2,
                nodeCount: 1,
                edgeCount: 0,
                affected: [relation],
            }),
        });

        expect(await gateway.callers("launch")).toEqual([relation]);
        expect(await gateway.callees("launch")).toEqual([relation]);
        expect(await gateway.impact("launch")).toEqual([relation]);
    });

    test("callers 不接受只有 callees 键的 DTO", async () => {
        const gateway = gatewayWith({
            callers: success({ symbol: "launch", callees: [] }),
        });

        const error = await gateway.callers("launch").catch((value: unknown) => value);

        expect(error).toBeInstanceOf(CodeGraphJsonError);
    });

    test("status 拒绝非法 worktreeMismatch DTO", async () => {
        const gateway = gatewayWith({
            status: success({
                initialized: true,
                version: "1.5.0",
                projectPath: projectRoot,
                indexPath: `${projectRoot}/.codegraph`,
                lastIndexed: null,
                worktreeMismatch: { worktreeRoot: 1, indexRoot: projectRoot },
            }),
        });

        const error = await gateway.status().catch((value: unknown) => value);

        expect(error).toBeInstanceOf(CodeGraphJsonError);
    });

    test("公共命令使用参数数组，sync 不追加 --json", async () => {
        const calls: readonly string[][] = [];
        const recorded: string[][] = calls as string[][];
        const runner: CommandRunner = async (args, options) => {
            recorded.push([...args]);
            expect(options).toEqual({ timeoutMs: 15_000, maxBuffer: 16 * 1024 * 1024 });
            if (args[0] === "sync") return success("");
            if (args[0] === "files") return success([]);
            throw new Error(`Unexpected command: ${args.join(" ")}`);
        };
        const gateway = createCodeGraphGateway({ projectRoot, runner });

        await gateway.sync();
        await gateway.files();

        expect(calls).toEqual([
            ["sync", "--quiet", projectRoot],
            ["files", "--path", projectRoot, "--format", "flat", "--json"],
        ]);
    });

    test("resolveSymbol 无结果时返回诊断", async () => {
        const gateway = gatewayWith({ query: success([]) });
        const ref: SymbolRef = { name: "missing" };

        expect(await gateway.resolveSymbol(ref)).toEqual({
            severity: "error",
            source: "codegraph",
            message: 'Symbol "missing" was not found',
        });
    });
});
