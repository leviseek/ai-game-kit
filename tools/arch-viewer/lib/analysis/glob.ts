/** 未来若配置需要更多 glob 语法，应在这里显式扩展并保持无依赖实现。 */
function normalizePath(value: string): string {
    return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function expandBraces(pattern: string): readonly string[] {
    const start = pattern.indexOf("{");
    if (start < 0) return [pattern];
    const end = pattern.indexOf("}", start + 1);
    if (end < 0) return [pattern];

    const choices = pattern.slice(start + 1, end).split(",");
    if (choices.length < 2 || choices.some((choice) => choice === "")) return [pattern];
    return choices.flatMap((choice) =>
        expandBraces(`${pattern.slice(0, start)}${choice}${pattern.slice(end + 1)}`),
    );
}

function escapeRegex(value: string): string {
    return value.replace(/[|\\{}()[\]^$+?.-]/g, "\\$&");
}

function patternRegex(pattern: string): RegExp {
    let source = "^";
    for (let index = 0; index < pattern.length;) {
        if (pattern.startsWith("**/", index)) {
            source += "(?:.*/)?";
            index += 3;
        } else if (pattern.startsWith("**", index)) {
            source += ".*";
            index += 2;
        } else if (pattern[index] === "*") {
            source += "[^/]*";
            index += 1;
        } else {
            source += escapeRegex(pattern[index]!);
            index += 1;
        }
    }
    return new RegExp(`${source}$`);
}

/** 仅实现架构配置约定的 glob 子集，避免引入运行时依赖和隐式语义。 */
export function matchProjectGlob(path: string, pattern: string): boolean {
    const normalizedPath = normalizePath(path);
    return expandBraces(normalizePath(pattern)).some((item) =>
        patternRegex(item).test(normalizedPath),
    );
}
