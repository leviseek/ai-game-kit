import { resolve } from "node:path";

/** tools/comfyui-setup 根。 */
export function toolRoot(): string {
    return resolve(import.meta.dirname, "..");
}

/** 仓库根（commands → comfyui-setup → tools → 仓库根，三级上溯）。 */
export function repoRoot(): string {
    return resolve(import.meta.dirname, "..", "..", "..");
}
