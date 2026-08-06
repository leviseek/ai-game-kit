import type {
  AudioBackend,
  AudioGroup,
  AudioGroupState,
  AudioPlayScope,
  AudioService,
  AudioServiceOptions,
  AudioTrackRef,
} from "../../contracts/audio/Audio";
import type { Logger } from "../../contracts/logging/Logger";
import type { ApplicationVisibilityState } from "../../contracts/platform/Platform";

const AUDIO_GROUPS: readonly AudioGroup[] = ["music", "sfx", "ui"];

const DEFAULT_VOLUME = 1;

interface GroupState {
  volume: number;
  muted: boolean;
  current: ActivePlay | undefined;
}

interface PlayScopeState {
  plays: Set<ActivePlay>;
  released: boolean;
}

interface ActivePlay {
  readonly owner: PlayScopeState;
  readonly group: AudioGroup;
  readonly track: AudioTrackRef;
}

/**
 * 引擎无关的分组音频服务。按 music/sfx/ui 分组维护音量、静音与当前播放，
 * 通过注入的 AudioBackend 驱动真实音频；作用域释放时停止其仍持有的播放。
 * 后端不可用（available 为 false）时整体降级为 no-op，操作不抛错且不触达后端。
 */
export function createAudioService(options: AudioServiceOptions): AudioService {
  const backend: AudioBackend = options.backend;
  const logger: Logger | undefined = options.logger;
  const degraded = !backend.available;

  const groups = new Map<AudioGroup, GroupState>(
    AUDIO_GROUPS.map((group) => [group, {
      volume: DEFAULT_VOLUME,
      muted: false,
      current: undefined,
    }]),
  );

  function stateOf(group: AudioGroup): GroupState {
    return groups.get(group) as GroupState;
  }

  // 有效音量：静音时以 0 表达，不覆盖用户音量设定
  function effectiveVolume(group: AudioGroup): number {
    const state = stateOf(group);
    return state.muted ? 0 : state.volume;
  }

  // 停止分组当前播放：从所属作用域记录中移除，再驱动后端 stop。
  // 作用域释放时也会走这里，因此切换/停止后旧作用域释放不会重复停止。
  function stopCurrent(group: AudioGroup): void {
    const state = stateOf(group);
    const current = state.current;

    if (current === undefined) {
      return;
    }

    state.current = undefined;
    current.owner.plays.delete(current);
    backend.stop(group);
  }

  function setVolume(group: AudioGroup, volume: number): boolean {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      return false;
    }

    if (degraded) {
      // 降级：值合法即成功，但无状态变更与后端副作用
      return true;
    }

    stateOf(group).volume = volume;
    backend.setVolume(group, effectiveVolume(group));
    return true;
  }

  function setMuted(group: AudioGroup, muted: boolean): void {
    if (degraded) {
      return;
    }

    stateOf(group).muted = muted;
    backend.setVolume(group, effectiveVolume(group));
  }

  function stop(group: AudioGroup): void {
    if (degraded) {
      return;
    }
    stopCurrent(group);
  }

  function pause(group: AudioGroup): void {
    if (degraded) {
      return;
    }
    backend.pause(group);
  }

  function resume(group: AudioGroup): void {
    if (degraded) {
      return;
    }
    backend.resume(group);
  }

  function getGroupState(group: AudioGroup): AudioGroupState {
    const state = stateOf(group);
    return { group, volume: state.volume, muted: state.muted };
  }

  function createPlayScope(): AudioPlayScope {
    const scopeState: PlayScopeState = { plays: new Set(), released: false };

    return {
      play(group, track) {
        if (scopeState.released || degraded) {
          return;
        }

        // 切歌：先停止该分组当前播放（无论归属哪个作用域）
        stopCurrent(group);

        const play: ActivePlay = { owner: scopeState, group, track };
        scopeState.plays.add(play);
        stateOf(group).current = play;
        backend.play(group, track);
      },
      release() {
        if (scopeState.released) {
          return;
        }
        scopeState.released = true;

        // Array.from 而非展开运算符：Creator 构建会把 `[...set]` 转译成
        // `[].concat(set)`，concat 不展开 Set 导致迭代得到 Set 本身
        for (const play of Array.from(scopeState.plays)) {
          if (stateOf(play.group).current === play) {
            stopCurrent(play.group);
          }
        }
        scopeState.plays.clear();
      },
    };
  }

  // 前后台策略：后台暂停配置分组、前台恢复，仅恢复因可见性被暂停的分组，
  // 避免覆盖调用方手动暂停/恢复的意图。切换处理捕获错误并记录结构化诊断，
  // 不向上抛破坏应用生命周期。
  const autoPaused = new Set<AudioGroup>();
  let unsubscribeVisibility: (() => void) | undefined;

  if (options.visibility !== undefined && options.backgroundPolicy !== undefined) {
    const visibility = options.visibility;
    const policy = options.backgroundPolicy;

    unsubscribeVisibility = visibility.onVisibilityChange(
      (state: ApplicationVisibilityState) => {
        try {
          if (state === "background") {
            for (const group of policy.pauseOnBackground) {
              if (stateOf(group).current !== undefined) {
                backend.pause(group);
                autoPaused.add(group);
              }
            }
          } else {
            for (const group of Array.from(autoPaused)) {
              // 仅恢复仍在播放的分组：后台期间被显式停止的分组不复活
              if (stateOf(group).current !== undefined) {
                backend.resume(group);
              }
              autoPaused.delete(group);
            }
          }
        } catch (error) {
          logger?.warn("audio visibility transition failed", {
            visibilityState: state,
            cause: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
  }

  function dispose(): void {
    unsubscribeVisibility?.();
    unsubscribeVisibility = undefined;
    autoPaused.clear();
  }

  return {
    degraded,
    createPlayScope,
    getGroupState,
    setVolume,
    setMuted,
    stop,
    pause,
    resume,
    dispose,
  };
}
