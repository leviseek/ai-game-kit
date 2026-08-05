/**
 * 极简命令行参数解析（零依赖）：
 * --key value / --key=value / 布尔 --flag；-h/--help 视为 help 标记。
 * 位置参数（不含 -- 前缀）收集到 positionals。
 */
export interface ParsedArgs {
  readonly flags: ReadonlyMap<string, string | true>;
  readonly positionals: readonly string[];
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      flags.set("help", true);
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq >= 0) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags.set(name, next);
        i++;
      } else {
        flags.set(name, true);
      }
      continue;
    }
    positionals.push(arg);
  }

  return { flags, positionals };
}

export function flagString(
  parsed: ParsedArgs,
  name: string,
  fallback?: string,
): string | undefined {
  const value = parsed.flags.get(name);
  if (value === true || value === undefined) {
    return fallback;
  }
  return value;
}

export function flagBool(parsed: ParsedArgs, name: string, fallback: boolean): boolean {
  const value = parsed.flags.get(name);
  if (value === undefined) {
    return fallback;
  }
  return value !== "false";
}

export function flagNumber(
  parsed: ParsedArgs,
  name: string,
  fallback: number,
): number {
  const value = parsed.flags.get(name);
  if (value === true || value === undefined) {
    return fallback;
  }
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function hasHelp(parsed: ParsedArgs): boolean {
  return parsed.flags.has("help");
}
