export type ApplicationVisibilityState = "foreground" | "background";

// 应用前后台可见性：状态查询、显式设置与变更订阅。
export interface ApplicationVisibility {
    readonly state: ApplicationVisibilityState;
    setVisibility(state: ApplicationVisibilityState): void;
    onVisibilityChange(listener: (state: ApplicationVisibilityState) => void): () => void;
}

// 最小异步键值存储；存档 DTO/迁移属后续能力，不使用本接口承载。
export interface PlatformStorage {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

// 只读设备信息。
export interface DeviceInfo {
    readonly platform: string;
    readonly model: string;
    readonly language: string;
}
