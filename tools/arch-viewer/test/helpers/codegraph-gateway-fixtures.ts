import { createCodeGraphGateway, type CodeGraphGateway } from "../../lib/codegraph/gateway";
import type { CommandResult, CommandRunner } from "../../lib/codegraph/process";

export const projectRoot = "D:/repo";

export const launchNode = {
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

export const duplicateLaunchResults = [
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

export function success(stdout: unknown): CommandResult {
    return {
        exitCode: 0,
        stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
        stderr: "",
    };
}

export function fakeRunner(responses: Readonly<Record<string, CommandResult | Error>>): CommandRunner {
    return async (args) => {
        const response = responses[args[0] ?? ""];
        if (response instanceof Error) throw response;
        if (!response) throw new Error(`Unexpected command: ${args.join(" ")}`);
        return response;
    };
}

export function gatewayWith(responses: Readonly<Record<string, CommandResult | Error>>): CodeGraphGateway {
    return createCodeGraphGateway({ projectRoot, runner: fakeRunner(responses) });
}

export const errorDiagnostic = (message: string) => ({
    severity: "error" as const,
    source: "codegraph",
    message,
});
