import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const projectRoot = resolve(import.meta.dir, "../../..");
const frameworkRoot = resolve(projectRoot, "assets/framework");
const platformContractFile = resolve(
    frameworkRoot,
    "contracts/platform/Platform.ts",
);
const timeContractFile = resolve(
    frameworkRoot,
    "contracts/time/TimeSource.ts",
);

function readContract(path: string): string {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("Platform contracts", () => {
    test("defines replaceable application visibility, storage, and device contracts", () => {
        expect(existsSync(platformContractFile)).toBe(true);

        const source = readContract(platformContractFile);
        expect(source).toMatch(/export\s+interface\s+ApplicationVisibility/);
        expect(source).toMatch(/export\s+interface\s+PlatformStorage/);
        expect(source).toMatch(/export\s+interface\s+DeviceInfo/);
        expect(source).toMatch(/get\s*\(/);
        expect(source).toMatch(/set\s*\(/);
        expect(source).toMatch(/delete\s*\(/);
    });

    test("defines a replaceable read-only time source contract", () => {
        expect(existsSync(timeContractFile)).toBe(true);

        const source = readContract(timeContractFile);
        expect(source).toMatch(/export\s+interface\s+TimeSource/);
        expect(source).toMatch(/now\s*\(\s*\)\s*:\s*number/);
    });

    test("keeps platform contracts independent from runtime and application layers", () => {
        const source = `${readContract(platformContractFile)}\n${readContract(timeContractFile)}`;

        expect(source).not.toMatch(/from\s+["']cc["']/);
        expect(source).not.toMatch(/from\s+["'][^"']*ApplicationContext[^"']*["']/);
        expect(source).not.toMatch(/from\s+["'][^"']*assets\/game[^"']*["']/);
        expect(source).not.toMatch(/\b(?:globalThis|window|singleton|getInstance)\b/);
    });
});
