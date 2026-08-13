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

export function matchProjectGlob(path: string, pattern: string): boolean {
    const normalizedPath = normalizePath(path);
    return expandBraces(normalizePath(pattern)).some((item) =>
        patternRegex(item).test(normalizedPath),
    );
}
