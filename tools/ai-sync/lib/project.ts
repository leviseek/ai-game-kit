import { resolve } from "node:path";

/** ai-sync 工具根（tools/ai-sync）。 */
export function aiSyncRoot(): string {
    return resolve(import.meta.dirname, "..");
}

/** 仓库根（lib → ai-sync → tools → 仓库根，共三级上溯）。 */
export function repoRoot(): string {
    return resolve(import.meta.dirname, "..", "..", "..");
}
