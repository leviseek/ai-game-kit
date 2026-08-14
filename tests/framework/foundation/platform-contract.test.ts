import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const projectRoot = resolve(import.meta.dir, "../../..");
const frameworkRoot = resolve(projectRoot, "assets/framework");
const contractsInterfacesRoot = resolve(frameworkRoot, "contracts/interfaces");
const visibilityContractFile = resolve(contractsInterfacesRoot, "IApplicationVisibility.ts");
const platformStorageContractFile = resolve(contractsInterfacesRoot, "IPlatformStorage.ts");
const deviceInfoContractFile = resolve(contractsInterfacesRoot, "IDeviceInfo.ts");
const timeContractFile = resolve(contractsInterfacesRoot, "ITimeSource.ts");

function readContract(path: string): string {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("Platform contracts", () => {
    test("defines replaceable application visibility, storage, and device contracts", () => {
        expect(existsSync(visibilityContractFile)).toBe(true);
        expect(existsSync(platformStorageContractFile)).toBe(true);
        expect(existsSync(deviceInfoContractFile)).toBe(true);

        const visibilitySource = readContract(visibilityContractFile);
        const storageSource = readContract(platformStorageContractFile);
        const deviceSource = readContract(deviceInfoContractFile);
        expect(visibilitySource).toMatch(/export\s+interface\s+IApplicationVisibility/);
        expect(storageSource).toMatch(/export\s+interface\s+IPlatformStorage/);
        expect(storageSource).toMatch(/get\s*\(/);
        expect(storageSource).toMatch(/set\s*\(/);
        expect(storageSource).toMatch(/delete\s*\(/);
        expect(deviceSource).toMatch(/export\s+interface\s+IDeviceInfo/);
    });

    test("defines a replaceable read-only time source contract", () => {
        expect(existsSync(timeContractFile)).toBe(true);

        const source = readContract(timeContractFile);
        expect(source).toMatch(/export\s+interface\s+ITimeSource/);
        expect(source).toMatch(/now\s*\(\s*\)\s*:\s*number/);
    });

    test("keeps platform contracts independent from runtime and application layers", () => {
        const source = `${readContract(visibilityContractFile)}\n${readContract(platformStorageContractFile)}\n${readContract(deviceInfoContractFile)}\n${readContract(timeContractFile)}`;

        expect(source).not.toMatch(/from\s+["']cc["']/);
        expect(source).not.toMatch(/from\s+["'][^"']*IApplicationContext[^"']*["']/);
        expect(source).not.toMatch(/from\s+["'][^"']*assets\/game[^"']*["']/);
        expect(source).not.toMatch(/\b(?:globalThis|window|singleton|getInstance)\b/);
    });
});
