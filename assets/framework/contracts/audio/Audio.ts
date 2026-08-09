import type { Logger } from "../logging/Logger";
import type { ApplicationVisibility } from "../platform/Platform";

/** 音频分组：每组独立管理音量、静音与当前播放。 */
export type AudioGroup = "music" | "sfx" | "ui";

/** 音频资源键：归属 Bundle 与路径，与资源层 `kind: "asset"` 加载对齐。 */
export interface AudioTrackRef {
    readonly bundle: string;
    readonly path: string;
}

/**
 * 音频后端契约（引擎接缝）：由 Cocos 适配器或测试替身实现。
 * `available` 表达后端可用性，服务构造时据此决定是否降级。
 * `dispose` 可选：适配器在服务销毁时释放引擎侧资源（如 AudioSource/Node）。
 */
export interface AudioBackend {
    readonly available: boolean;
    play(group: AudioGroup, track: AudioTrackRef): void;
    stop(group: AudioGroup): void;
    pause(group: AudioGroup): void;
    resume(group: AudioGroup): void;
    setVolume(group: AudioGroup, volume: number): void;
    dispose?(): void;
}

/** 分组可查询状态：音量与静音为独立维度，静音不覆盖音量设定。 */
export interface AudioGroupState {
    readonly group: AudioGroup;
    readonly volume: number;
    readonly muted: boolean;
}

/**
 * 播放作用域：记录其启动的播放。release 时停止该作用域仍持有的当前播放；
 * 已被切歌接管或停止的播放不受影响（幂等）。
 */
export interface AudioPlayScope {
    play(group: AudioGroup, track: AudioTrackRef): void;
    release(): void;
}

/** 前后台策略：后台切换时暂停的分组，回到前台时按同样集合恢复。 */
export interface AudioBackgroundPolicy {
    readonly pauseOnBackground: ReadonlyArray<AudioGroup>;
}

export interface AudioServiceOptions {
    /** 真实音频后端；`available` 为 false 时服务整体降级为 no-op。 */
    readonly backend: AudioBackend;
    /** 可选的应用可见性源；与 backgroundPolicy 一同提供时订阅前后台切换。 */
    readonly visibility?: ApplicationVisibility;
    /** 前后台切换策略；缺省不响应可见性变化。 */
    readonly backgroundPolicy?: AudioBackgroundPolicy;
    /** 结构化诊断日志器；切换处理失败时记录，缺省静默。 */
    readonly logger?: Logger;
}

/** 引擎无关的音频服务：分组状态、音量/静音、播放与作用域、降级查询。 */
export interface AudioService {
    /** 后端不可用时为 true；此时所有操作均为无害 no-op。 */
    readonly degraded: boolean;
    createPlayScope(): AudioPlayScope;
    getGroupState(group: AudioGroup): AudioGroupState;
    /** 设置分组音量。返回 false 表示非法值被拒绝并保留原值。 */
    setVolume(group: AudioGroup, volume: number): boolean;
    setMuted(group: AudioGroup, muted: boolean): void;
    stop(group: AudioGroup): void;
    pause(group: AudioGroup): void;
    resume(group: AudioGroup): void;
    /** 取消可见性订阅等资源，重复调用为无操作。 */
    dispose(): void;
}
