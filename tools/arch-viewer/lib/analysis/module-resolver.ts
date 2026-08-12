import { existsSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const sourceExtensions = [".ts", ".tsx", ".mts", ".cts"] as const;
const declarationExtensions = [".d.ts", ".d.mts", ".d.cts"] as const;

export function normalizeProjectPath(path: string): string {
    return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isScannableSource(projectRoot: string, file: string): boolean {
    const absolutePath = isAbsolute(file) ? resolve(file) : resolve(projectRoot, file);
    const filePath = normalizeProjectPath(relative(projectRoot, absolutePath));
    const segments = filePath.split("/");
    const extensionMatch = sourceExtensions.some((extension) => filePath.endsWith(extension));

    return extensionMatch
        && !declarationExtensions.some((extension) => filePath.endsWith(extension))
        && !filePath.endsWith(".meta")
        && !filePath.startsWith("../")
        && !segments.includes("node_modules")
        && !segments.includes("third-party")
        && !filePath.startsWith("assets/framework/libs/fairygui/");
}

export interface ResolvedModule {
    readonly toFile?: string;
    readonly external: boolean;
}

/** 解析器只确认仓库内静态目标；包名依赖保留原 specifier 交给上层展示。 */
export function resolveModule(
    projectRoot: string,
    fromFile: string,
    specifier: string,
): ResolvedModule {
    if (!specifier.startsWith(".")) return { external: true };

    const basePath = resolve(projectRoot, dirname(fromFile), specifier);
    const hasSourceExtension = sourceExtensions.some((extension) => basePath.endsWith(extension));
    const candidates = hasSourceExtension
        ? [basePath]
        : sourceExtensions.flatMap((extension) => [
            `${basePath}${extension}`,
            resolve(basePath, `index${extension}`),
        ]);
    const target = candidates.find((candidate) =>
        existsSync(candidate) && isScannableSource(projectRoot, candidate));

    return target === undefined
        ? { external: false }
        : { toFile: normalizeProjectPath(relative(projectRoot, target)), external: false };
}
