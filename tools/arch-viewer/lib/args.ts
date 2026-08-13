export interface ArchCliOptions {
    readonly port: number | undefined;
    readonly open: boolean;
    readonly once: boolean;
    readonly help: boolean;
}

export type ParseArchArgsResult = Readonly<{ ok: true; options: ArchCliOptions }> | Readonly<{ ok: false; message: string }>;

export function parseArchArgs(argv: readonly string[]): ParseArchArgsResult {
    let port: number | undefined;
    let open = true;
    let once = false;
    let help = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help") {
            help = true;
        } else if (arg === "--no-open") {
            open = false;
        } else if (arg === "--once") {
            once = true;
        } else if (arg === "--port") {
            const value = argv[index + 1];
            if (value === undefined) return { ok: false, message: "invalid port" };
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
                return { ok: false, message: "invalid port" };
            }
            port = parsed;
            index += 1;
        } else {
            return { ok: false, message: `unknown option: ${arg ?? ""}` };
        }
    }

    return { ok: true, options: { port, open, once, help } };
}

export function archUsage(): string {
    return "arch [--port <number>] [--no-open] [--once]";
}
