import * as cc from "cc";

/**
 * cc 视口信息接缝：只依赖本适配器用到的能力，便于测试注入 mock。
 * getSafeAreaRect 位于 cc.sys（返回设计分辨率/rootSize 坐标系的 safe area
 * 矩形，非异形屏为全屏）；getVisibleSizeInPixel 位于 cc.view（物理像素）；
 * devicePixelRatio 位于 cc.screen（物理/CSS 像素比）。
 */
export interface CocosViewportLike {
    getVisibleSizeInPixel(): { readonly width: number; readonly height: number };
}

export interface CocosSysLike {
    getSafeAreaRect(symmetric?: boolean): {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
}

export interface CocosScreenLike {
    readonly devicePixelRatio: number;
}

export interface CocosViewportInfoOptions {
    /** 视口尺寸读取器；缺省读 cc.view。测试可注入 mock。 */
    readonly view?: CocosViewportLike;
    /** 系统信息读取器；缺省读 cc.sys。测试可注入 mock。 */
    readonly sys?: CocosSysLike;
    /** 屏幕信息读取器；缺省读 cc.screen。测试可注入 mock。 */
    readonly screen?: CocosScreenLike;
}

/**
 * Cocos 视口信息适配器：实时读取物理/逻辑像素分辨率与安全区 inset。
 * 引擎访问走惰性接缝（仅未注入时读 cc.view/cc.sys/cc.screen，同 CocosDeviceInfo
 * 模式），不进 framework 白名单，由 dev 层经注入接缝消费（design D3）。
 * 返回结构兼容对象，不反向依赖 boot 层类型。
 */
export interface CocosViewportInfo {
    /** 实际分辨率快照（物理 + 逻辑/CSS 像素），实时读取。 */
    sample(): {
        readonly physical: { readonly width: number; readonly height: number };
        readonly logical: { readonly width: number; readonly height: number };
    };
    /**
     * 安全区 inset（相对指定容器尺寸的设计分辨率坐标系）：safe area 矩形
     * 四边到容器边界的距离；矩形为全屏或读取失败时全 0。实时读取。
     */
    readSafeAreaInset(bounds: { readonly width: number; readonly height: number }): {
        readonly left: number;
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
    };
}

export function createCocosViewportInfo(options: CocosViewportInfoOptions = {}): CocosViewportInfo {
    const view = options.view ?? (cc.view as unknown as CocosViewportLike);
    const sys = options.sys ?? (cc.sys as unknown as CocosSysLike);
    const screen = options.screen ?? (cc.screen as unknown as CocosScreenLike);

    const toPair = (size: {
        readonly width: number;
        readonly height: number;
    }): {
        readonly width: number;
        readonly height: number;
    } => ({ width: size.width, height: size.height });

    return {
        sample() {
            // 逻辑/CSS 像素 = 物理像素 ÷ DPR（cc.view 无直接 CSS 尺寸 API，
            // windowSize 为物理像素；screen.devicePixelRatio 提供换算比）
            const physical = view.getVisibleSizeInPixel();
            const dpr = screen.devicePixelRatio > 0 ? screen.devicePixelRatio : 1;
            return {
                physical: toPair(physical),
                logical: {
                    width: physical.width / dpr,
                    height: physical.height / dpr,
                },
            };
        },
        readSafeAreaInset(bounds) {
            // getSafeAreaRect 在设计分辨率坐标系（非异形屏返回全屏 Rect）
            const rect = sys.getSafeAreaRect();
            // safe area 矩形四边到容器边界的距离；全屏矩形或无 safe area 时 inset 为 0
            const left = Math.max(0, rect.x);
            const top = Math.max(0, rect.y);
            const right = Math.max(0, bounds.width - rect.x - rect.width);
            const bottom = Math.max(0, bounds.height - rect.y - rect.height);
            return { left, top, right, bottom };
        },
    };
}
