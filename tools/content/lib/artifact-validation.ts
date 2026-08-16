/**
 * 产物契约校验：管线级、生成器无关的确定性闸门（ingest 前强制）。
 * - 存在性：声明的每个产物文件在 staging 存在；
 * - 格式签名：PNG 魔数 `89 50 4E 47 0D 0A 1A 0A`、WAV `RIFF....WAVE`；
 * - 尺寸：PNG 读 IHDR 宽高与声明一致；
 * - 时长：WAV 由 data chunk 长度 + 采样率/声道/位深推算，与声明一致（±10ms 容差）；
 * - 命名：basename 语义化（小写字母/数字/下划线/连字符，首段非数字）。
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { ContentIssue } from "./schemas";
import type { GeneratedArtifact } from "./generator";

export interface ArtifactDeps {
    readonly exists: (file: string) => boolean;
    readonly readBytes: (file: string) => Buffer;
}

export const realArtifactDeps: ArtifactDeps = {
    exists: (file) => existsSync(file),
    readBytes: (file) => readFileSync(file),
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WAV_RIFF = Buffer.from("RIFF", "ascii");
const WAV_WAVE = Buffer.from("WAVE", "ascii");
/** 时长容差（秒）：生成器与推算值允许的偏差。 */
const DURATION_TOLERANCE_SEC = 0.01;

const NAME_RE = /^[a-z][a-z0-9_]*$/;

/** 语义化命名：小写字母开头，仅小写字母/数字/下划线（如 sfx_hit、fx_boom）。 */
export function isValidArtifactName(name: string): boolean {
    return NAME_RE.test(name);
}

/** 校验 staging 产物契约；全部通过才允许 ingest。 */
export function validateArtifacts(stagingDir: string, artifacts: readonly GeneratedArtifact[], deps: ArtifactDeps = realArtifactDeps): ContentIssue[] {
    const issues: ContentIssue[] = [];
    for (const artifact of artifacts) {
        const full = join(stagingDir, artifact.relPath);
        const base = basename(artifact.relPath);
        if (!deps.exists(full)) {
            issues.push({ severity: "error", code: "artifact-missing", message: `产物缺失: ${artifact.relPath}` });
            continue;
        }
        const name = base.replace(/\.[^.]+$/, "");
        if (!isValidArtifactName(name)) {
            issues.push({ severity: "error", code: "artifact-name", message: `产物命名非法: ${base}（应小写字母开头、仅小写字母/数字/下划线）` });
        }
        const bytes = deps.readBytes(full);
        if (artifact.kind === "png") {
            issues.push(...validatePng(bytes, artifact, full));
        } else if (artifact.kind === "wav") {
            issues.push(...validateWav(bytes, artifact, full));
        }
    }
    return issues;
}

function validatePng(bytes: Buffer, artifact: GeneratedArtifact, label: string): ContentIssue[] {
    const issues: ContentIssue[] = [];
    if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) {
        issues.push({ severity: "error", code: "artifact-signature", message: `${label} 非 PNG 签名` });
        return issues;
    }
    if (artifact.width !== undefined || artifact.height !== undefined) {
        // IHDR：偏移 16 起 4 字节宽、4 字节高（大端）
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        if (artifact.width !== undefined && width !== artifact.width) {
            issues.push({ severity: "error", code: "artifact-size", message: `${label} 宽度 ${width} ≠ 声明 ${artifact.width}` });
        }
        if (artifact.height !== undefined && height !== artifact.height) {
            issues.push({ severity: "error", code: "artifact-size", message: `${label} 高度 ${height} ≠ 声明 ${artifact.height}` });
        }
    }
    return issues;
}

function validateWav(bytes: Buffer, artifact: GeneratedArtifact, label: string): ContentIssue[] {
    const issues: ContentIssue[] = [];
    if (!bytes.subarray(0, 4).equals(WAV_RIFF) || !bytes.subarray(8, 12).equals(WAV_WAVE)) {
        issues.push({ severity: "error", code: "artifact-signature", message: `${label} 非 WAV 签名（RIFF/WAVE 魔数缺失）` });
        return issues;
    }
    if (artifact.durationSec === undefined) return issues;
    const duration = wavDurationSec(bytes);
    if (duration === null) {
        issues.push({ severity: "error", code: "artifact-parse", message: `${label} 无法解析 WAV 时长（缺少 fmt/data chunk）` });
        return issues;
    }
    if (Math.abs(duration - artifact.durationSec) > DURATION_TOLERANCE_SEC) {
        issues.push({ severity: "error", code: "artifact-duration", message: `${label} 时长 ${duration.toFixed(3)}s ≠ 声明 ${artifact.durationSec}s` });
    }
    return issues;
}

/** 解析 WAV 时长：扫 chunk 找 fmt（采样率/声道/位深）与 data（字节数）。 */
export function wavDurationSec(bytes: Buffer): number | null {
    let offset = 12;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let dataBytes = 0;
    while (offset + 8 <= bytes.length) {
        const id = bytes.subarray(offset, offset + 4).toString("ascii");
        const size = bytes.readUInt32LE(offset + 4);
        const body = offset + 8;
        if (id === "fmt " && size >= 16) {
            channels = bytes.readUInt16LE(body + 2);
            sampleRate = bytes.readUInt32LE(body + 4);
            bitsPerSample = bytes.readUInt16LE(body + 14);
        } else if (id === "data") {
            dataBytes = size;
        }
        offset = body + size + (size % 2); // chunk 对齐
    }
    if (sampleRate <= 0 || channels <= 0 || bitsPerSample <= 0) return null;
    const bytesPerSecond = (sampleRate * channels * bitsPerSample) / 8;
    if (bytesPerSecond <= 0) return null;
    return dataBytes / bytesPerSecond;
}
