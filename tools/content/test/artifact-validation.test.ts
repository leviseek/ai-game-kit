import { describe, expect, it } from "bun:test";
import { validateArtifacts, wavDurationSec, isValidArtifactName } from "../lib/artifact-validation";
import type { GeneratedArtifact } from "../lib/generator";

/** 构造最小合法 PNG（1x1，真实魔数 + IHDR 宽高）。 */
function pngBytes(width = 1, height = 1): Buffer {
    const png = Buffer.alloc(8 + 25 + 12 + 12);
    const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    magic.copy(png, 0);
    png.writeUInt32BE(13, 8); // IHDR length
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(width, 16);
    png.writeUInt32BE(height, 20);
    png.writeUInt32BE(8, 24); // bit depth
    png.writeUInt32BE(6, 28); // color type
    png.writeUInt32BE(0, 37); // IEND length
    png.write("IEND", 41, "ascii");
    return png;
}

/** 构造最小合法 WAV（单声道 16bit，sampleRate，N 秒静音）。 */
function wavBytes(sampleRate = 22050, seconds = 0.5): Buffer {
    const dataBytes = sampleRate * 2 * seconds;
    const total = 44 + dataBytes;
    const wav = Buffer.alloc(total);
    wav.write("RIFF", 0, "ascii");
    wav.writeUInt32LE(total - 8, 4);
    wav.write("WAVE", 8, "ascii");
    wav.write("fmt ", 12, "ascii");
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // PCM
    wav.writeUInt16LE(1, 22); // mono
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36, "ascii");
    wav.writeUInt32LE(dataBytes, 40);
    return wav;
}

function deps(files: Record<string, Buffer>) {
    // Windows 下 join 产生反斜杠，与测试 key（正斜杠）不一致：统一规范化
    const normalize = (file: string) => file.replace(/\\/g, "/");
    return {
        exists: (file: string) => normalize(file) in files,
        readBytes: (file: string) => files[normalize(file)] ?? Buffer.alloc(0),
    };
}

describe("isValidArtifactName", () => {
    it("合法命名", () => {
        expect(isValidArtifactName("sfx_hit")).toBe(true);
        expect(isValidArtifactName("fx_boom")).toBe(true);
    });
    it("非法命名", () => {
        expect(isValidArtifactName("1abc")).toBe(false);
        expect(isValidArtifactName("Hello")).toBe(false);
        expect(isValidArtifactName("a b")).toBe(false);
    });
});

describe("validateArtifacts：PNG 契约", () => {
    it("尺寸一致通过", () => {
        const files = { "img/a.png": pngBytes(64, 32) };
        const artifacts: GeneratedArtifact[] = [{ relPath: "img/a.png", kind: "png", width: 64, height: 32 }];
        expect(validateArtifacts(".", artifacts, deps(files))).toHaveLength(0);
    });

    it("尺寸不符报 artifact-size", () => {
        const files = { "img/a.png": pngBytes(64, 32) };
        const artifacts: GeneratedArtifact[] = [{ relPath: "img/a.png", kind: "png", width: 128, height: 32 }];
        const issues = validateArtifacts(".", artifacts, deps(files));
        expect(issues.some((i) => i.code === "artifact-size" && i.message.includes("128"))).toBe(true);
    });

    it("非 PNG 签名报 artifact-signature", () => {
        const files = { "img/a.png": Buffer.from("not a png at all") };
        const artifacts: GeneratedArtifact[] = [{ relPath: "img/a.png", kind: "png" }];
        expect(validateArtifacts(".", artifacts, deps(files)).some((i) => i.code === "artifact-signature")).toBe(true);
    });

    it("缺失文件报 artifact-missing", () => {
        const artifacts: GeneratedArtifact[] = [{ relPath: "img/ghost.png", kind: "png" }];
        expect(validateArtifacts(".", artifacts, deps({})).some((i) => i.code === "artifact-missing")).toBe(true);
    });
});

describe("validateArtifacts：WAV 契约", () => {
    it("时长一致通过", () => {
        const files = { "audio/h.wav": wavBytes(22050, 0.5) };
        const artifacts: GeneratedArtifact[] = [{ relPath: "audio/h.wav", kind: "wav", durationSec: 0.5 }];
        expect(validateArtifacts(".", artifacts, deps(files))).toHaveLength(0);
    });

    it("时长不符报 artifact-duration", () => {
        const files = { "audio/h.wav": wavBytes(22050, 0.5) };
        const artifacts: GeneratedArtifact[] = [{ relPath: "audio/h.wav", kind: "wav", durationSec: 1.0 }];
        const issues = validateArtifacts(".", artifacts, deps(files));
        expect(issues.some((i) => i.code === "artifact-duration")).toBe(true);
    });

    it("wavDurationSec 推算正确", () => {
        const wav = wavBytes(44100, 1.0);
        expect(wavDurationSec(wav)).toBeCloseTo(1.0, 2);
    });

    it("非 WAV 签名报错", () => {
        const files = { "audio/h.wav": Buffer.from("junk") };
        const artifacts: GeneratedArtifact[] = [{ relPath: "audio/h.wav", kind: "wav" }];
        expect(validateArtifacts(".", artifacts, deps(files)).some((i) => i.code === "artifact-signature")).toBe(true);
    });
});
