import type { DeviceInfo, TimeSource } from "../../framework";
import type { PerfSampler } from "../../game/fixture/perf";

/** Web 网络状态接缝：与 navigator 形状同构，测试可注入 mock。 */
export interface NetworkLike {
    readonly onLine: boolean;
    readonly connection?: {
        readonly effectiveType?: string;
    } | null;
}

/** 屏幕 viewport 快照：物理像素与逻辑/CSS 像素（物理 ÷ DPR）尺寸。 */
export interface ViewportInfo {
    readonly physical: { readonly width: number; readonly height: number };
    readonly logical: { readonly width: number; readonly height: number };
}

/** 适配后 UI 根容器（GRoot）尺寸快照。 */
export interface UiSizeInfo {
    readonly width: number;
    readonly height: number;
}

export interface DevInfoSamplerOptions {
    /** 墙钟：运行时间 = now() - 起点差值（表现时钟 GameClock 不可用，见 design D3）。 */
    readonly clock: TimeSource;
    /** 设备信息（平台/型号/语言），经 CocosDeviceInfo 适配器提供。 */
    readonly device: DeviceInfo;
    /** 网络状态读取器；缺省读全局 navigator（非浏览器环境视为离线 unknown）。 */
    readonly navigator?: NetworkLike;
    /** 性能采样器（FPS/纹理/缓冲内存，复用 game/fixture/perf 的 PerfSampler）。 */
    readonly perf?: PerfSampler;
    /** 屏幕 viewport 读取器（物理/逻辑像素）；缺省为 null（采样跳过）。 */
    readonly readViewport?: () => ViewportInfo;
    /** 适配后 UI 根容器（GRoot）尺寸读取器；缺省为 null（采样跳过）。 */
    readonly readUiSize?: () => UiSizeInfo;
}

/** 一次 dev overlay 信息快照：运行时间格式化 mm:ss，数值项采样不可用时为 null。 */
export interface DevInfo {
    readonly uptime: string;
    readonly platform: string;
    readonly model: string;
    readonly language: string;
    readonly online: boolean;
    readonly networkType: string;
    readonly fps: number | null;
    readonly textureMemoryMB: number | null;
    readonly bufferMemoryMB: number | null;
    /** 实际分辨率（物理像素 + 逻辑像素）；读取器缺省时为 null。 */
    readonly viewport: ViewportInfo | null;
    /** 适配后分辨率（GRoot 尺寸）；读取器缺省时为 null。 */
    readonly uiSize: UiSizeInfo | null;
}

export interface DevInfoSampler {
    /** 返回当前信息快照（运行时间相对创建起点）。 */
    sample(): DevInfo;
}

/** 网络连接类型：connection 缺失或 effectiveType 为空时降级 "unknown"。 */
export function effectiveType(
    connection: NetworkLike["connection"],
): string {
    const type = connection?.effectiveType;
    return type === undefined || type.length === 0 ? "unknown" : type;
}

/** 运行时间格式化：毫秒 → mm:ss，不足补零；负数钳制为 0。 */
export function formatUptime(milliseconds: number): string {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
    return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 信息采样器：聚合运行时间（墙钟差值）、设备信息、网络状态与性能采样为
 * 一次快照。起点在创建时记录；性能采样器不可用时对应字段为 null（采样跳过）。
 * viewport/uiSize 读取器缺省时对应字段为 null（采样跳过）。
 */
export function createDevInfoSampler(
    options: DevInfoSamplerOptions,
): DevInfoSampler {
    const startedAt = options.clock.now();
    const nav =
        options.navigator ??
        (typeof navigator === "undefined"
            ? undefined
            : (navigator as unknown as NetworkLike));

    return {
        sample(): DevInfo {
            const elapsed = Math.max(0, options.clock.now() - startedAt);
            const perf = options.perf?.() ?? null;
            return {
                uptime: formatUptime(elapsed),
                platform: options.device.platform,
                model: options.device.model,
                language: options.device.language,
                online: nav?.onLine ?? false,
                networkType: effectiveType(nav?.connection),
                fps: perf?.fps ?? null,
                textureMemoryMB: perf?.textureMemoryMB ?? null,
                bufferMemoryMB: perf?.bufferMemoryMB ?? null,
                viewport: options.readViewport?.() ?? null,
                uiSize: options.readUiSize?.() ?? null,
            };
        },
    };
}
