import type { IAudioBackend, IModule } from "../../../framework";
import { createAudioService, EnumAudioGroup, type IAudioService } from "../../../framework";

/**
 * 音频句柄：组合根创建音频服务与播放作用域，命中时经作用域播放 sfx，
 * dispose 时作用域释放停止命中音频、服务释放后端。模块只登记引用。
 */
export interface FightAudioHandle {
    readonly service: IAudioService;
    /** 命中音效：战斗命中回调触发播放。 */
    playHit(): void;
    dispose(): void;
}

/** 缺省降级音频后端：不可用，所有操作均为 no-op，夹具缺省不触达真实音频。 */
function createUnavailableBackend(): IAudioBackend {
    const noop = (): void => {};
    return {
        available: false,
        play: noop,
        stop: noop,
        pause: noop,
        resume: noop,
        setVolume: noop,
    };
}

export interface FightAudioOptions {
    readonly backend?: IAudioBackend;
}

export function createFightAudio(options: FightAudioOptions = {}): FightAudioHandle {
    const backend = options.backend ?? createUnavailableBackend();
    const service = createAudioService({ backend });
    const scope = service.createPlayScope();

    return {
        service,
        playHit: () => {
            // 命中音效：经作用域播放，作用域释放时停止该分组
            scope.play(EnumAudioGroup.Sfx, { bundle: "samples", path: "sfx/hit" });
        },
        dispose: () => {
            scope.release();
            service.dispose();
        },
    };
}

export function createFightAudioModule(audio: FightAudioHandle): IModule {
    return {
        id: "fight.audio",
        dependencies: [],
        start: () => {
            // 音频服务在组合根构造时即就绪；start 只是让模块进入装配清单
            void audio.service.degraded;
        },
    };
}
