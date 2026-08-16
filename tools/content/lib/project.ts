import { resolve } from "node:path";

/** tools/content 根。 */
export function contentRoot(): string {
    return resolve(import.meta.dirname, "..");
}

/** 仓库根（lib → content → tools → 仓库根，三级上溯）。 */
export function repoRoot(): string {
    return resolve(import.meta.dirname, "..", "..", "..");
}
