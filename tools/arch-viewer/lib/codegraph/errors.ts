export class CodeGraphCommandError extends Error {
    public constructor(
        public readonly args: readonly string[],
        public readonly stderr: string,
        public readonly exitCode: number,
    ) {
        super(`CodeGraph command failed (${exitCode}): ${stderr}`);
        this.name = "CodeGraphCommandError";
    }
}

export class CodeGraphTimeoutError extends Error {
    public constructor(
        public readonly args: readonly string[],
        public readonly timeoutMs: number,
        options?: ErrorOptions,
    ) {
        super(`CodeGraph command timed out after ${timeoutMs}ms`, options);
        this.name = "CodeGraphTimeoutError";
    }
}

export class CodeGraphJsonError extends Error {
    public constructor(
        public readonly args: readonly string[],
        options?: ErrorOptions,
    ) {
        super("CodeGraph returned invalid JSON", options);
        this.name = "CodeGraphJsonError";
    }
}
