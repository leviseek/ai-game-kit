/**
 * 极简参数解析：`--flag`、`--flag value`、`--flag=value`、`-h/--help`，其余为位置参数。
 * 语义：遇到 `--name` 且下一个参数不以 `-` 开头时，按值参数消费；否则按布尔标志处理。
 */
export interface ParsedArgs {
    readonly positionals: readonly string[];
    readonly flags: ReadonlyMap<string, string | boolean>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
    const positionals: string[] = [];
    const flags = new Map<string, string | boolean>();
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            flags.set("help", true);
        } else if (arg.startsWith("--")) {
            const eq = arg.indexOf("=");
            if (eq >= 0) {
                flags.set(arg.slice(2, eq), arg.slice(eq + 1));
                continue;
            }
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith("-")) {
                flags.set(arg.slice(2), next);
                i++;
            } else {
                flags.set(arg.slice(2), true);
            }
        } else {
            positionals.push(arg);
        }
    }
    return { positionals, flags };
}
