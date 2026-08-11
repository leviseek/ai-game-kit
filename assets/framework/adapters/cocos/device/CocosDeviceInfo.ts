import * as cc from "cc";
import type { DeviceInfo } from "../../../contracts/platform/Platform";

/**
 * cc.sys 系统信息接缝：只依赖本适配器用到的能力，便于测试注入 mock。
 * 引擎枚举字段（platform/language/os）在类型上为私有枚举，统一按字符串读取。
 */
export interface CocosSysLike {
    readonly os: unknown;
    readonly platform: unknown;
    readonly language: unknown;
}

export interface CocosDeviceInfoOptions {
    /** 系统信息读取器；缺省读 cc.sys。测试可注入 mock。 */
    readonly sys?: CocosSysLike;
}

/**
 * Cocos 设备信息适配器：实现 DeviceInfo 契约（platform/model/language）。
 * 读 cc.sys 的系统信息并归一化为可展示字符串；缺失字段降级为 "unknown"。
 * 引擎访问走惰性接缝（仅未注入时读 cc.sys，同 CocosStorageAdapter 模式），
 * 不进 framework 白名单，由 dev 层直接 import 使用（design D3）。
 */
export function createCocosDeviceInfo(
    options: CocosDeviceInfoOptions = {},
): DeviceInfo {
    const sys = options.sys ?? (cc.sys as unknown as CocosSysLike);
    const label = (value: unknown): string => {
        const text = String(value ?? "");
        return text.length > 0 ? text : "unknown";
    };
    return {
        // platform=平台标识（sys.platform 枚举，如 WINDOWS/MOBILE_BROWSER）；
        // model=OS 描述（sys.os，如 "Windows"/"iOS"）。避免把同一来源两义展示。
        platform: label(sys.platform),
        model: label(sys.os),
        language: label(sys.language),
    };
}
