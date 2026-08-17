/**
 * assetgen —— 外部生成器产物接入管线（staging → 契约校验 → ingest 登记）。
 *
 * 子命令：
 *   generate <generator> [--k v ...]  生成产物到 temp/assetgen/staging/<run>/ 并写 .assetgen.json 契约
 *   validate <staging-dir>            校验 staging 产物契约（存在/签名/尺寸/时长/命名），error 非零退出
 *   ingest <staging-dir> --target assets/<sub> [--id <id>] [--keep]
 *                                    校验通过后复制进 assets/、更新登记表、清 staging
 *
 * 登记表：assets/game-content/generated-assets.json（id → file/kind/generator/paramsHash/尺寸/时长）。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flagBool, flagString, parseArgs } from "../lib/args";
import { validateArtifacts } from "../lib/artifact-validation";
import { getGenerator, listGenerators, registerGenerator, type GeneratedArtifact, type GeneratorParams } from "../lib/generator";
import { repoRoot } from "../lib/project";
import { createPythonWaveGenerator } from "../generators/python-wave";
import { createPythonVfxGenerator } from "../generators/python-vfx";
import { createComfyUiGenerator } from "../generators/comfyui";
import { createFguiSpriteGenerator } from "../generators/fgui-sprite";

/** 内置生成器注册（命令入口统一注入；测试可自建注册表）。 */
export function registerBuiltinGenerators(): void {
    registerGenerator(createPythonWaveGenerator());
    registerGenerator(createPythonVfxGenerator());
    registerGenerator(createComfyUiGenerator());
    registerGenerator(createFguiSpriteGenerator());
}

export const STAGING_ROOT = "temp/assetgen/staging";
export const REGISTRY_FILE = "assets/game-content/generated-assets.json";
const MANIFEST_NAME = ".assetgen.json";

interface StageManifest {
    readonly generator: string;
    readonly params: GeneratorParams;
    readonly artifacts: readonly GeneratedArtifact[];
}

interface AssetRegistryEntry {
    readonly file: string;
    readonly kind: string;
    readonly generator: string;
    readonly paramsHash: string;
    readonly width?: number;
    readonly height?: number;
    readonly durationSec?: number;
}

type AssetRegistry = Record<string, AssetRegistryEntry>;

export const help = "assetgen —— 外部生成器产物接入：generate/validate/ingest（staging → 契约校验 → 登记）";

export async function run(argv: readonly string[]): Promise<number> {
    // 手拆子命令（不在此层 parseArgs，避免吞掉子命令参数）
    if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
        console.log(help);
        return 0;
    }
    const [subcommand, ...rest] = argv;
    switch (subcommand) {
        case "generate":
            return runGenerate(rest);
        case "validate":
            return runValidate(rest);
        case "ingest":
            return runIngest(rest);
        default:
            console.error(`[content:assetgen] 未知子命令: ${subcommand}`);
            return 2;
    }
}

function runGenerate(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    const generatorId = parsed.positionals[0];
    if (generatorId === undefined) {
        console.error(
            "[content:assetgen] generate 需要生成器 id（可用: " +
                listGenerators()
                    .map((g) => g.id)
                    .join(", ") +
                "）",
        );
        return Promise.resolve(2);
    }
    const adapter = getGenerator(generatorId);
    if (adapter === undefined) {
        console.error(
            `[content:assetgen] 未知生成器: ${generatorId}（已注册: ${listGenerators()
                .map((g) => g.id)
                .join(", ")}）`,
        );
        return Promise.resolve(2);
    }
    const params: Record<string, string | number | boolean> = {};
    for (const [key, value] of parsed.flags) {
        if (key === "help") continue;
        params[key] = value === true ? true : value;
    }

    const runId = `${generatorId}-${Date.now()}`;
    const stagingDir = join(repoRoot(), STAGING_ROOT, runId);
    mkdirSync(stagingDir, { recursive: true });
    return Promise.resolve(adapter.generate(stagingDir, params))
        .then((generateResult) => {
            const manifest: StageManifest = { generator: generatorId, params, artifacts: generateResult.artifacts };
            writeFileSync(join(stagingDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
            console.log(`[content:assetgen] 生成完成: ${generatorId} → ${stagingDir}`);
            for (const artifact of generateResult.artifacts) {
                console.log(
                    `  - ${artifact.relPath} (${artifact.kind}${artifact.width !== undefined ? ` ${artifact.width}x${artifact.height}` : ""}${artifact.durationSec !== undefined ? ` ${artifact.durationSec}s` : ""})`,
                );
            }
            console.log(`[content:assetgen] 下一步: assetgen validate "${stagingDir}"`);
            return 0;
        })
        .catch((error: unknown) => {
            rmSync(stagingDir, { recursive: true, force: true });
            console.error(`[content:assetgen] 生成失败: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        });
}

function runValidate(argv: readonly string[]): number {
    const parsed = parseArgs(argv);
    const dir = parsed.positionals[0];
    if (dir === undefined) {
        console.error("[content:assetgen] validate 需要 staging 目录");
        return 2;
    }
    const manifest = readManifest(dir);
    if (manifest === null) {
        console.error(`[content:assetgen] staging 缺少 ${MANIFEST_NAME}（先运行 generate）: ${dir}`);
        return 2;
    }
    const issues = validateArtifacts(dir, manifest.artifacts);
    for (const issue of issues) {
        console.error(`[${issue.severity === "error" ? "error" : "warning"}] ${issue.message}`);
    }
    if (issues.some((i) => i.severity === "error")) {
        console.error(`[content:assetgen] 契约校验失败（${issues.filter((i) => i.severity === "error").length} error），ingest 拒绝`);
        return 1;
    }
    console.log(`[content:assetgen] 契约校验通过（${manifest.artifacts.length} 个产物）`);
    return 0;
}

function runIngest(argv: readonly string[]): number {
    const parsed = parseArgs(argv);
    const dir = parsed.positionals[0];
    const target = flagString(parsed, "target");
    const id = flagString(parsed, "id");
    const keep = flagBool(parsed, "keep", false);
    if (dir === undefined || target === undefined) {
        console.error("[content:assetgen] ingest 需要 staging 目录与 --target assets/<子目录>");
        return 2;
    }
    if (!/^assets\/[a-zA-Z0-9_/-]+$/.test(target) || target.includes("..")) {
        console.error(`[content:assetgen] --target 非法（必须为 assets/ 内相对路径）: ${target}`);
        return 2;
    }
    if (id === undefined) {
        console.error("[content:assetgen] ingest 需要 --id <登记 id>");
        return 2;
    }
    const manifest = readManifest(dir);
    if (manifest === null) {
        console.error(`[content:assetgen] staging 缺少 ${MANIFEST_NAME}（先运行 generate）: ${dir}`);
        return 2;
    }
    const issues = validateArtifacts(dir, manifest.artifacts);
    if (issues.some((i) => i.severity === "error")) {
        for (const issue of issues) console.error(`[error] ${issue.message}`);
        console.error("[content:assetgen] 契约校验未通过，ingest 拒绝");
        return 1;
    }

    const project = repoRoot();
    const targetDir = join(project, target);
    mkdirSync(targetDir, { recursive: true });
    const registry = loadRegistry(project);
    const paramsHash = hashParams(manifest.params);
    const existing = registry[id];
    if (existing !== undefined && existing.paramsHash !== paramsHash) {
        console.error(`[content:assetgen] 登记冲突 warning: ${id} 已存在且参数哈希不一致（${existing.paramsHash} vs ${paramsHash}）`);
    }

    for (const artifact of manifest.artifacts) {
        cpSync(join(dir, artifact.relPath), join(targetDir, artifact.relPath));
        const entry: AssetRegistryEntry = {
            file: `${target}/${artifact.relPath}`,
            kind: artifact.kind,
            generator: manifest.generator,
            paramsHash,
            ...(artifact.width !== undefined ? { width: artifact.width, height: artifact.height } : {}),
            ...(artifact.durationSec !== undefined ? { durationSec: artifact.durationSec } : {}),
        };
        registry[id] = entry;
        console.log(`[content:assetgen] 登记 ${id} → ${entry.file}（${manifest.generator}）`);
    }
    writeFileSync(join(project, REGISTRY_FILE), JSON.stringify(registry, null, 4) + "\n", "utf8");
    if (!keep) {
        rmSync(dir, { recursive: true, force: true });
        console.log("[content:assetgen] staging 已清理（--keep 可保留）");
    }
    console.log(`[content:assetgen] ingest 完成: ${id}`);
    return 0;
}

function readManifest(stagingDir: string): StageManifest | null {
    const file = join(stagingDir, MANIFEST_NAME);
    if (!existsSync(file)) return null;
    try {
        return JSON.parse(readFileSync(file, "utf8")) as StageManifest;
    } catch {
        return null;
    }
}

function loadRegistry(project: string): AssetRegistry {
    const file = join(project, REGISTRY_FILE);
    if (!existsSync(file)) return {};
    try {
        return JSON.parse(readFileSync(file, "utf8")) as AssetRegistry;
    } catch {
        return {};
    }
}

/** djb2 字符串哈希（参数哈希：同参数重复 ingest 检测）。 */
export function hashParams(params: GeneratorParams): string {
    const text = JSON.stringify(params);
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
}
