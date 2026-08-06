import * as cc from "cc";
import type {
  AudioBackend,
  AudioGroup,
  AudioTrackRef,
} from "../../../contracts/audio/Audio";
import type { ResourceScope } from "../../../contracts/resource/ResourceScope";
import type { IResourceProvider } from "../../../contracts/resource/ResourceProvider";

const DEFAULT_VOLUME = 1;

// 引擎接缝：AudioSource 的播放能力；真实实现由引擎提供，测试可注入 mock
export interface CocosAudioSourceLike {
  clip: unknown;
  loop: boolean;
  volume: number;
  readonly playing: boolean;
  play(): void;
  stop(): void;
  pause(): void;
  resume(): void;
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
  return node.addComponent(cc.AudioSource) as unknown as CocosAudioSourceLike;
}

/**
 * Cocos 音频适配器：把 AudioBackend 薄映射到 cc.AudioSource/AudioClip。
 * 音频资源经资源层 `kind: "asset"` 加载（复用加载去重与作用域计数）；
 * 播放中由适配器自建作用域持有 clip，停止/切歌时整体释放，闭合资源闭环。
 * 加载为异步，过期结果（已被更新的 play/stop 取代）会被丢弃。
 */
export function createCocosAudioAdapter(
  options: CocosAudioAdapterOptions,
): AudioBackend {
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

  return {
    available: true,
    play(group, track) {
      const version = nextVersion(group);
      releaseHeld(group);
      const source = sourceFor(group);
      source.stop();

      const handle = provider.load(track.bundle, track.path);
      handle.done.then((settled) => {
        // 已被更新的 play/stop 取代，或加载失败：丢弃过期结果
        if (versions.get(group) !== version || settled.state !== "ready") {
          return;
        }

        const clipScope = provider.createScope();
        clipScope.retain(settled);
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
  };
}
