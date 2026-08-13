import * as cc from "cc";
import type { AudioBackend, AudioGroup } from "../../../contracts/audio/Audio";
import type { ResourceScope } from "../../../contracts/resource/ResourceScope";
import type { IResourceProvider } from "../../../contracts/resource/ResourceProvider";

const DEFAULT_VOLUME = 1;

// 引擎接缝：AudioSource 的播放能力；真实实现由引擎提供，测试可注入 mock。
// destroy 用于释放引擎侧资源（真实实现销毁宿主 Node），dispose 路径调用。
export interface CocosAudioSourceLike {
    clip: unknown;
    loop: boolean;
    volume: number;
    readonly playing: boolean;
    play(): void;
    stop(): void;
    pause(): void;
    resume(): void;
    destroy(): void;
}

// AudioSource 创建接缝：缺省经 cc.Node + cc.AudioSource 构建，测试可注入 mock
export type CocosAudioSourceFactory = (group: AudioGroup) => CocosAudioSourceLike;

export interface CocosAudioAdapterOptions {
    /** 资源层：以 kind: "asset" 加载 AudioClip。 */
    readonly provider: IResourceProvider;
    /** AudioSource 创建接缝；缺省创建挂到隐藏节点上的 AudioSource。 */
    readonly createSource?: CocosAudioSourceFactory;
}

function defaultCreateSource(group: AudioGroup): CocosAudioSourceLike {
    // 惰性读取 cc：仅缺省路径触达引擎，测试注入 createSource 时不会执行
    const node = new cc.Node(`framework-audio-${group}`);
    const source = node.addComponent(cc.AudioSource);

    // 显式委托而非 `{...source}`：后者只复制自有属性，会丢失 AudioSource
    // 原型上的 play/stop/pause/resume 方法；destroy 销毁宿主 Node 以回收引擎资源
    return {
        get clip() {
            return source.clip;
        },
        set clip(value: unknown) {
            source.clip = value as cc.AudioClip;
        },
        get loop() {
            return source.loop;
        },
        set loop(value: boolean) {
            source.loop = value;
        },
        get volume() {
            return source.volume;
        },
        set volume(value: number) {
            source.volume = value;
        },
        get playing() {
            return source.playing;
        },
        play() {
            source.play();
        },
        stop() {
            source.stop();
        },
        pause() {
            source.pause();
        },
        // cc.AudioSource 无 resume 接口：官方 play() 语义即"暂停时调用恢复播放"
        resume() {
            source.play();
        },
        destroy() {
            node.destroy();
        },
    };
}

/**
 * Cocos 音频适配器：把 AudioBackend 薄映射到 cc.AudioSource/AudioClip。
 * 音频资源经资源层 `kind: "asset"` 加载（复用加载去重与作用域计数）；
 * 加载发起即建作用域并 retain loading handle，加载期间 Bundle 视为持有中，
 * ready 后转入引用计数，停止/切歌时整体释放，闭合资源闭环。
 * 加载为异步，过期结果（已被更新的 play/stop 取代）会被丢弃并释放占位。
 * dispose 销毁引擎侧 AudioSource/Node 并释放全部持有。
 */
export function createCocosAudioAdapter(options: CocosAudioAdapterOptions): AudioBackend {
    const provider = options.provider;
    const createSource = options.createSource ?? defaultCreateSource;

    const sources = new Map<AudioGroup, CocosAudioSourceLike>();
    // 每组目标音量：setVolume 先于 play 调用时保留，source 创建时应用
    const volumes = new Map<AudioGroup, number>();
    // 每组当前播放持有的资源作用域：停止/切歌时释放，闭合资源闭环
    const heldScopes = new Map<AudioGroup, ResourceScope>();
    // 每组加载版本号：更新的 play/stop 使旧加载结果失效
    const versions = new Map<AudioGroup, number>();

    function sourceFor(group: AudioGroup): CocosAudioSourceLike {
        let source = sources.get(group);
        if (source === undefined) {
            source = createSource(group);
            source.volume = volumes.get(group) ?? DEFAULT_VOLUME;
            sources.set(group, source);
        }
        return source;
    }

    function releaseHeld(group: AudioGroup): void {
        const scope = heldScopes.get(group);
        if (scope !== undefined) {
            scope.release();
            heldScopes.delete(group);
        }
    }

    function nextVersion(group: AudioGroup): number {
        const next = (versions.get(group) ?? 0) + 1;
        versions.set(group, next);
        return next;
    }

    // 释放全部资源作用域并销毁引擎侧 AudioSource/Node，供服务销毁时调用
    function dispose(): void {
        for (const group of Array.from(heldScopes.keys())) {
            releaseHeld(group);
        }
        for (const source of Array.from(sources.values())) {
            source.destroy();
        }
        sources.clear();
    }

    return {
        available: true,
        play(group, track) {
            const version = nextVersion(group);
            releaseHeld(group);
            const source = sourceFor(group);
            source.stop();

            // 立即建作用域并 retain loading handle：加载期间即标记 Bundle 为"持有中"，
            // 避免调用方在加载窗口误判可卸载；ready 后 retain 自动转入引用计数。
            const handle = provider.load(track.bundle, track.path);
            const clipScope = provider.createScope();
            clipScope.retain(handle);
            handle.done.then((settled) => {
                // 已被更新的 play/stop 取代，或加载失败：释放占位并丢弃过期结果
                if (versions.get(group) !== version || settled.state !== "ready") {
                    clipScope.release();
                    return;
                }

                heldScopes.set(group, clipScope);
                source.clip = settled.resource;
                source.play();
            });
        },
        stop(group) {
            nextVersion(group);
            releaseHeld(group);
            sources.get(group)?.stop();
        },
        pause(group) {
            sources.get(group)?.pause();
        },
        resume(group) {
            sources.get(group)?.resume();
        },
        setVolume(group, volume) {
            volumes.set(group, volume);
            const source = sources.get(group);
            if (source !== undefined) {
                source.volume = volume;
            }
        },
        dispose,
    };
}
