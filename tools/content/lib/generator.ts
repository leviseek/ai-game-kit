/**
 * 生成器接口抽象：外部生成器（ComfyUI/Python/既有 CLI）以统一契约接入内容管线。
 * 生成器负责把产物写到 staging 目录并声明契约（kind/尺寸/时长）；管线侧
 * （commands/assetgen）承担产物契约校验与 ingest 登记，生成器可替换。
 */
import type { ContentIssue } from "./schemas";

/** 产物类型（契约校验按 kind 分支）。 */
export type ArtifactKind = "png" | "wav";

/** 生成器声明的产物契约（校验闸门比对用）。 */
export interface GeneratedArtifact {
    /** staging 内相对路径 */
    readonly relPath: string;
    readonly kind: ArtifactKind;
    readonly width?: number;
    readonly height?: number;
    readonly durationSec?: number;
}

export interface GeneratorParams {
    readonly [key: string]: string | number | boolean | undefined;
}

export interface GeneratorResult {
    readonly artifacts: readonly GeneratedArtifact[];
}

export interface GeneratorAdapter {
    readonly id: string;
    readonly describe: string;
    /** 生成产物到 staging 目录（staging 由管线创建，生成器只写文件并返回契约）。 */
    generate(stagingDir: string, params: GeneratorParams): Promise<GeneratorResult>;
    /** 生成器自有校验（可选）；管线契约校验在 ingest 前独立执行。 */
    validate?(stagingDir: string, artifacts: readonly GeneratedArtifact[]): ContentIssue[];
}

const registry = new Map<string, GeneratorAdapter>();

export function registerGenerator(adapter: GeneratorAdapter): void {
    registry.set(adapter.id, adapter);
}

export function listGenerators(): readonly GeneratorAdapter[] {
    return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getGenerator(id: string): GeneratorAdapter | undefined {
    return registry.get(id);
}
