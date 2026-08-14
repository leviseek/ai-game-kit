import type { EnumApplicationVisibilityState } from "../enums/EnumApplicationVisibilityState";

// 应用前后台可见性：状态查询、显式设置与变更订阅。
export interface IApplicationVisibility {
    readonly state: EnumApplicationVisibilityState;
    setVisibility(state: EnumApplicationVisibilityState): void;
    onVisibilityChange(listener: (state: EnumApplicationVisibilityState) => void): () => void;
}
