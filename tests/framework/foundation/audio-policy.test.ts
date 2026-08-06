import { describe, expect, test } from "bun:test";

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import { createAudioService } from "../../../assets/framework/core/audio/AudioService";
import type {
  AudioBackend,
  AudioGroup,
  AudioTrackRef,
} from "../../../assets/framework/contracts/audio/Audio";

const TRACKS = {
  musicMain: { bundle: "audio", path: "music/main" } as AudioTrackRef,
  sfxAttack: { bundle: "audio", path: "sfx/attack" } as AudioTrackRef,
};

class RecordingBackend implements AudioBackend {
  public readonly available = true;
  public readonly playCalls: Array<{ group: AudioGroup; track: AudioTrackRef }> =
    [];
  public readonly stopCalls: AudioGroup[] = [];
  public readonly pauseCalls: AudioGroup[] = [];
  public readonly resumeCalls: AudioGroup[] = [];
  public readonly volumeCalls: Array<{ group: AudioGroup; volume: number }> = [];

  play(group: AudioGroup, track: AudioTrackRef): void {
    this.playCalls.push({ group, track });
  }

  stop(group: AudioGroup): void {
    this.stopCalls.push(group);
  }

  pause(group: AudioGroup): void {
    this.pauseCalls.push(group);
  }

  resume(group: AudioGroup): void {
    this.resumeCalls.push(group);
  }

  setVolume(group: AudioGroup, volume: number): void {
    this.volumeCalls.push({ group, volume });
  }
}

describe("前后台切换策略", () => {
  test("后台暂停 music 分组，前台恢复", () => {
    const platform = new MemoryPlatform();
    const backend = new RecordingBackend();
    const service = createAudioService({
      backend,
      visibility: platform,
      backgroundPolicy: { pauseOnBackground: ["music"] },
    });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    platform.setVisibility("background");
    expect(backend.pauseCalls).toEqual(["music"]);

    platform.setVisibility("foreground");
    expect(backend.resumeCalls).toEqual(["music"]);
    scope.release();
  });

  test("后台暂停不作用于未配置分组", () => {
    const platform = new MemoryPlatform();
    const backend = new RecordingBackend();
    const service = createAudioService({
      backend,
      visibility: platform,
      backgroundPolicy: { pauseOnBackground: ["music"] },
    });
    const scope = service.createPlayScope();

    scope.play("sfx", TRACKS.sfxAttack);
    platform.setVisibility("background");

    expect(backend.pauseCalls).toEqual([]);
    scope.release();
  });

  test("前台恢复仅针对因后台被暂停的分组，不复活后台期间显式停止的播放", () => {
    const platform = new MemoryPlatform();
    const backend = new RecordingBackend();
    const service = createAudioService({
      backend,
      visibility: platform,
      backgroundPolicy: { pauseOnBackground: ["music"] },
    });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    platform.setVisibility("background");
    service.stop("music");
    platform.setVisibility("foreground");

    // stop 已清空当前播放，前台恢复不应复活
    expect(backend.resumeCalls).toEqual([]);
    scope.release();
  });

  test("切换处理抛错不破坏生命周期，dispose 后不再响应", () => {
    const platform = new MemoryPlatform();
    const backend = new RecordingBackend();
    const service = createAudioService({
      backend,
      visibility: platform,
      backgroundPolicy: { pauseOnBackground: ["music"] },
    });

    service.dispose();
    platform.setVisibility("background");
    expect(backend.pauseCalls).toEqual([]);
  });

  test("切换处理捕获后端异常并记录结构化诊断，不影响其他可见性变化", () => {
    const platform = new MemoryPlatform();
    const records: Array<{ message: string; context?: Record<string, unknown> }> =
      [];
    const backend = new RecordingBackend();
    // 仅 sfx 分组 pause 抛错：验证异常被隔离，music 仍正常处理
    const throwingPauseBackend: AudioBackend = {
      available: true,
      play: (group, track) => backend.play(group, track),
      stop: (group) => backend.stop(group),
      pause(group) {
        if (group === "sfx") {
          throw new Error("engine pause failed");
        }
        backend.pause(group);
      },
      resume: (group) => backend.resume(group),
      setVolume: (group, volume) => backend.setVolume(group, volume),
    };
    const noopLogger = {
      debug() {},
      info() {},
      warn(message: string, context?: Record<string, unknown>) {
        records.push({ message, context });
      },
      error() {},
      child() {
        return noopLogger;
      },
    };
    const service = createAudioService({
      backend: throwingPauseBackend,
      visibility: platform,
      backgroundPolicy: { pauseOnBackground: ["music", "sfx"] },
      logger: noopLogger,
    });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    scope.play("sfx", TRACKS.sfxAttack);

    // 首次可见性变化触发 sfx pause 抛错，被策略捕获并记录
    platform.setVisibility("background");
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].message).toMatch(/visibility/);
    expect(records[0].context?.visibilityState).toBe("background");
    expect(records[0].context?.cause).toMatch(/engine pause failed/);

    // 异常被隔离：music 已成功 pause，后续操作不受影响
    expect(backend.pauseCalls).toEqual(["music"]);
    scope.release();
  });
});
