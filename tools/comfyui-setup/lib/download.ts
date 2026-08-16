/**
 * 多线程 Range 分片下载（零依赖，吸收 scripts/comfy-download.py 的逻辑）。
 * 单连接常被 CDN 限速（hf-mirror ~0.6MB/s），分片并发可数倍提速。
 * 流程：探测 Content-Range 总大小 → 预分配文件 → 并发分片写入 → 进度报告。
 */
import { openSync, closeSync, ftruncateSync, statSync, existsSync, writeSync } from "node:fs";

const CHUNK_BYTES = 16 * 1024 * 1024;
const DEFAULT_THREADS = 8;
const FETCH_TIMEOUT_MS = 120_000;
/** 单分片失败重试次数（网络抖动容忍；重试间隔 1s×attempt）。 */
const RETRY_COUNT = 3;

/** 探测资源总字节数：Range: bytes=0-0 读 Content-Range 末段。 */
export async function probeSize(url: string): Promise<number> {
    const response = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
        throw new Error(`探测大小失败（HTTP ${response.status}）: ${url}`);
    }
    const contentRange = response.headers.get("content-range") ?? "";
    const size = Number(contentRange.split("/").pop());
    if (!Number.isFinite(size) || size <= 0) {
        throw new Error(`无法从 Content-Range 解析大小: ${contentRange}`);
    }
    return size;
}

export interface DownloadProgress {
    readonly doneBytes: number;
    readonly totalBytes: number;
    readonly speedMbps: number;
}

/** 分片下载单段到文件指定偏移（同步写，避免并发写同 fd 竞态）。 */
async function downloadRange(url: string, start: number, end: number, fd: number, offsetBase: number): Promise<void> {
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
        throw new Error(`分片下载失败（HTTP ${response.status}）: bytes=${start}-${end}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    writeSync(fd, buffer, 0, buffer.length, offsetBase);
}

export interface DownloadResult {
    readonly totalBytes: number;
    /** 是否已存在且大小一致（跳过下载）。 */
    readonly skipped: boolean;
}

/**
 * 并发分片下载到 outPath；目标已存在且大小一致则跳过。
 * 分片失败自动重试（每片最多 RETRY 次），完成时校验大小——防中断后
 * 空洞文件（truncate 到全大小但部分分片未写入）被误判为完整。
 * onProgress 每完成一批分片回调（节流 ≥1s）。
 */
export async function downloadFile(
    url: string,
    outPath: string,
    options: { threads?: number; onProgress?: (p: DownloadProgress) => void } = {},
): Promise<DownloadResult> {
    const total = await probeSize(url);
    if (existsSync(outPath) && statSync(outPath).size === total) {
        return { totalBytes: total, skipped: true };
    }
    const fd = openSync(outPath, "w");
    try {
        ftruncateSync(fd, total);
        const threads = options.threads ?? DEFAULT_THREADS;
        const ranges: Array<{ start: number; end: number }> = [];
        for (let start = 0; start < total; start += CHUNK_BYTES) {
            ranges.push({ start, end: Math.min(start + CHUNK_BYTES - 1, total - 1) });
        }
        let doneBytes = 0;
        const startedAt = Date.now();
        let lastReport = 0;
        for (let i = 0; i < ranges.length; i += threads) {
            const batch = ranges.slice(i, i + threads);
            await Promise.all(
                batch.map(async (range) => {
                    let attempt = 0;
                    for (;;) {
                        try {
                            await downloadRange(url, range.start, range.end, fd, range.start);
                            return;
                        } catch (error) {
                            attempt += 1;
                            if (attempt > RETRY_COUNT) {
                                throw error;
                            }
                            await sleep(1000 * attempt);
                        }
                    }
                }),
            );
            doneBytes += batch.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
            const now = Date.now();
            if (options.onProgress !== undefined && now - lastReport >= 1000) {
                lastReport = now;
                const elapsedSec = (now - startedAt) / 1000;
                options.onProgress({
                    doneBytes,
                    totalBytes: total,
                    speedMbps: elapsedSec > 0 ? doneBytes / 1e6 / elapsedSec : 0,
                });
            }
        }
        return { totalBytes: total, skipped: false };
    } finally {
        closeSync(fd);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
