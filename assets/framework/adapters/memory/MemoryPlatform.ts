import type { IApplicationVisibility } from "../../contracts/interfaces/IApplicationVisibility";
import type { IDeviceInfo } from "../../contracts/interfaces/IDeviceInfo";
import type { IPlatformStorage } from "../../contracts/interfaces/IPlatformStorage";
import { EnumApplicationVisibilityState } from "../../contracts/enums/EnumApplicationVisibilityState";
import type { ITimeSource } from "../../contracts/interfaces/ITimeSource";

export interface MemoryPlatformOptions {
    readonly initialVisibility?: EnumApplicationVisibilityState;
    readonly deviceInfo?: IDeviceInfo;
    readonly initialEntries?: Readonly<Record<string, string>>;
    readonly now?: () => number;
}

/**
 * 内存平台适配器：供测试与非 Cocos 环境使用的 IApplicationVisibility、
 * IPlatformStorage、IDeviceInfo 与 ITimeSource 实现。
 */
export class MemoryPlatform implements IApplicationVisibility, IPlatformStorage, IDeviceInfo {
    private currentVisibility: EnumApplicationVisibilityState;
    private readonly visibilityListeners = new Set<(state: EnumApplicationVisibilityState) => void>();
    private readonly entries = new Map<string, string>();
    private readonly timeNow: () => number;

    public readonly platform: string;
    public readonly model: string;
    public readonly language: string;

    public readonly timeSource: ITimeSource;

    constructor(options: MemoryPlatformOptions = {}) {
        this.currentVisibility = options.initialVisibility ?? EnumApplicationVisibilityState.Foreground;
        this.platform = options.deviceInfo?.platform ?? "memory";
        this.model = options.deviceInfo?.model ?? "memory-test";
        this.language = options.deviceInfo?.language ?? "en-US";
        this.timeNow = options.now ?? (() => Date.now());
        this.timeSource = { now: () => this.timeNow() };

        if (options.initialEntries !== undefined) {
            for (const key of Object.keys(options.initialEntries)) {
                this.entries.set(key, options.initialEntries[key]);
            }
        }
    }

    get state(): EnumApplicationVisibilityState {
        return this.currentVisibility;
    }

    setVisibility(state: EnumApplicationVisibilityState): void {
        if (state === this.currentVisibility) {
            return;
        }

        this.currentVisibility = state;
        const listenerErrors: unknown[] = [];

        // 一个监听器抛错不中断其他监听器；错误聚合后抛出第一个。
        // Array.from 而非展开运算符：Creator 构建会把 `[...set]` 转译成
        // `[].concat(set)`，concat 不展开 Set 导致遍历得到 Set 对象本身，
        // listener(state) 报 "listener is not a function"（同 LoadCoordinator 修复）
        for (const listener of Array.from(this.visibilityListeners)) {
            try {
                listener(state);
            } catch (error) {
                listenerErrors.push(error);
            }
        }

        if (listenerErrors.length > 0) {
            throw listenerErrors[0];
        }
    }

    onVisibilityChange(listener: (state: EnumApplicationVisibilityState) => void): () => void {
        this.visibilityListeners.add(listener);

        return () => {
            this.visibilityListeners.delete(listener);
        };
    }

    async get(key: string): Promise<string | null> {
        return this.entries.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        this.entries.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.entries.delete(key);
    }
}
