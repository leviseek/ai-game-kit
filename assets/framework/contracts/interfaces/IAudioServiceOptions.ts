import type { IAudioBackend } from "./IAudioBackend";
import type { IAudioBackgroundPolicy } from "./IAudioBackgroundPolicy";
import type { IApplicationVisibility } from "./IApplicationVisibility";
import type { ILogger } from "./ILogger";

export interface IAudioServiceOptions {
    /** 真实音频后端；`available` 为 false 时服务整体降级为 no-op。 */
    readonly backend: IAudioBackend;
    /** 可选的应用可见性源；与 backgroundPolicy 一同提供时订阅前后台切换。 */
    readonly visibility?: IApplicationVisibility;
    /** 前后台切换策略；缺省不响应可见性变化。 */
    readonly backgroundPolicy?: IAudioBackgroundPolicy;
    /** 结构化诊断日志器；切换处理失败时记录，缺省静默。 */
    readonly logger?: ILogger;
}
