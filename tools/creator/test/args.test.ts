import { describe, expect, it } from "bun:test";
import { flagBool, flagNumber, flagString, hasHelp, parseArgs } from "../lib/args";

describe("parseArgs", () => {
    it("--key value 形式", () => {
        const parsed = parseArgs(["--package", "Demo"]);
        expect(parsed.flags.get("package")).toBe("Demo");
        expect(parsed.positionals).toHaveLength(0);
    });

    it("--key=value 形式", () => {
        const parsed = parseArgs(["--name=abc"]);
        expect(parsed.flags.get("name")).toBe("abc");
    });

    it("布尔 --flag（无值）", () => {
        const parsed = parseArgs(["--apply"]);
        expect(parsed.flags.get("apply")).toBe(true);
    });

    it("--flag 后跟另一个 --flag 视为布尔", () => {
        const parsed = parseArgs(["--strict", "--verbose"]);
        expect(parsed.flags.get("strict")).toBe(true);
        expect(parsed.flags.get("verbose")).toBe(true);
    });

    it("-h / --help 标记", () => {
        expect(hasHelp(parseArgs(["-h"]))).toBe(true);
        expect(hasHelp(parseArgs(["--help"]))).toBe(true);
        expect(hasHelp(parseArgs(["--package", "Demo"]))).toBe(false);
    });

    it("位置参数收集", () => {
        const parsed = parseArgs(["open", "--timeout", "30", "extra"]);
        expect(parsed.positionals).toEqual(["open", "extra"]);
    });
});

describe("flagString / flagBool / flagNumber", () => {
    it("flagString 取值与 fallback", () => {
        expect(flagString(parseArgs(["--a", "1"]), "a")).toBe("1");
        expect(flagString(parseArgs(["--a"]), "a", "fb")).toBe("fb"); // 布尔 → fallback
        expect(flagString(parseArgs([]), "a", "fb")).toBe("fb");
    });

    it("flagBool 语义（false 字符串才算 false）", () => {
        expect(flagBool(parseArgs(["--debug", "false"]), "debug", true)).toBe(false);
        expect(flagBool(parseArgs(["--debug", "true"]), "debug", true)).toBe(true);
        expect(flagBool(parseArgs(["--debug"]), "debug", true)).toBe(true);
        expect(flagBool(parseArgs([]), "debug", false)).toBe(false);
    });

    it("flagNumber 解析与 fallback", () => {
        expect(flagNumber(parseArgs(["--n", "42"]), "n", 0)).toBe(42);
        expect(flagNumber(parseArgs(["--n", "abc"]), "n", 7)).toBe(7);
        expect(flagNumber(parseArgs(["--n"]), "n", 7)).toBe(7);
    });
});
