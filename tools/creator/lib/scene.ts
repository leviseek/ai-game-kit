import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "./env";

/**
 * 场景 uuid 解析与构建参数聚合。
 * uuid 可从 <scene>.scene.meta 读取；构建参数用 Creator 的 platform=...;debug=...;scenes=... 形式。
 */

function collectSceneFiles(directory: string, out: string[]): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            collectSceneFiles(path, out);
        } else if (entry.isFile() && entry.name.endsWith(".scene")) {
            out.push(path);
        }
    }
}

export function resolveSceneUuid(nameOrUuid: string): string {
    if (/^[0-9a-fA-F-]{36}$/.test(nameOrUuid)) {
        return nameOrUuid.toLowerCase();
    }

    const scenes: string[] = [];
    collectSceneFiles(join(getProjectRoot(), "assets"), scenes);
    const wanted = nameOrUuid.endsWith(".scene") ? nameOrUuid : `${nameOrUuid}.scene`;
    const hit = scenes.find((path) => path.replaceAll("\\", "/").endsWith(`/${wanted}`));

    if (hit === undefined) {
        throw new Error(`未找到场景 ${nameOrUuid}（可用 uuid 或相对 assets 的 .scene 路径）`);
    }

    const metaPath = `${hit}.meta`;
    if (!existsSync(metaPath)) {
        throw new Error(`场景 meta 缺失（需 Creator 导入后生成）: ${metaPath}`);
    }

    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { uuid?: string };
    if (meta.uuid === undefined) {
        throw new Error(`场景 meta 无 uuid: ${metaPath}`);
    }
    return meta.uuid;
}

export function buildParams(platform: string, debug: boolean, scenes: readonly string[]): string {
    const parts = [`platform=${platform}`, `debug=${debug}`];
    if (scenes.length > 0) {
        parts.push(`scenes=${scenes.join(",")}`);
    }
    return parts.join(";");
}
