import { describe, expect, test } from "bun:test";

// 红期：contracts/audio 与 core/audio 尚未实现，模块解析失败属预期；
// 本文件通过使用方式锁定待实现契约的形状（分组、后端、作用域、服务）。
import { createAudioService } from "../../../assets/framework/core/audio/AudioService";
import type {
  AudioBackend,
  AudioGroup,
  AudioTrackRef,
} from "../../../assets/framework/contracts/audio/Audio";

const DEFAULT_VOLUME = 1;

const TRACKS = {
  musicMain: { bundle: "audio", path: "music/main" } as AudioTrackRef,
  musicBattle: { bundle: "audio", path: "music/battle" } as AudioTrackRef,
  sfxAttack: { bundle: "audio", path: "sfx/attack" } as AudioTrackRef,
  uiClick: { bundle: "audio", path: "ui/click" } as AudioTrackRef,
};

// 记录型后端替身：可用性可控，所有调用可断言
class RecordingBackend implements AudioBackend {
  public readonly available: boolean;
  public readonly playCalls: Array<{ group: AudioGroup; track: AudioTrackRef }> =
    [];
  public readonly stopCalls: AudioGroup[] = [];
  public readonly pauseCalls: AudioGroup[] = [];
  public readonly resumeCalls: AudioGroup[] = [];
  public readonly volumeCalls: Array<{ group: AudioGroup; volume: number }> = [];

  constructor(available = true) {
    this.available = available;
  }

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

describe("音频分组独立", () => {
  test("music/sfx/ui 独立维护音量与静音状态，互不影响", () => {
    const service = createAudioService({ backend: new RecordingBackend() });

    service.setVolume("music", 0.5);
    service.setMuted("sfx", true);

    expect(service.getGroupState("music").volume).toBe(0.5);
    expect(service.getGroupState("music").muted).toBe(false);
    expect(service.getGroupState("sfx").muted).toBe(true);
    expect(service.getGroupState("ui").volume).toBe(DEFAULT_VOLUME);
    expect(service.getGroupState("ui").muted).toBe(false);
  });

  test("修改某分组音量不影响其他分组", () => {
    const service = createAudioService({ backend: new RecordingBackend() });

    service.setVolume("music", 0.2);
    service.setVolume("sfx", 0.8);

    expect(service.getGroupState("music").volume).toBe(0.2);
    expect(service.getGroupState("sfx").volume).toBe(0.8);
    expect(service.getGroupState("ui").volume).toBe(DEFAULT_VOLUME);
  });
});

describe("音量与静音", () => {
  test("合法音量（0 到 1 含边界）被接受", () => {
    const service = createAudioService({ backend: new RecordingBackend() });

    expect(service.setVolume("music", 0)).toBe(true);
    expect(service.setVolume("music", 1)).toBe(true);
    expect(service.setVolume("music", 0.5)).toBe(true);
  });

  test("非法音量被拒绝并保留原值", () => {
    const service = createAudioService({ backend: new RecordingBackend() });
    service.setVolume("music", 0.4);

    expect(service.setVolume("music", -0.1)).toBe(false);
    expect(service.setVolume("music", 1.5)).toBe(false);

    expect(service.getGroupState("music").volume).toBe(0.4);
  });

  test("静音不改变音量设定，取消静音恢复原音量", () => {
    const service = createAudioService({ backend: new RecordingBackend() });
    service.setVolume("music", 0.6);

    service.setMuted("music", true);
    expect(service.getGroupState("music").volume).toBe(0.6);
    expect(service.getGroupState("music").muted).toBe(true);

    service.setMuted("music", false);
    expect(service.getGroupState("music").muted).toBe(false);
    expect(service.getGroupState("music").volume).toBe(0.6);
  });

  test("设置音量驱动后端 setVolume", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });

    service.setVolume("music", 0.3);

    expect(backend.volumeCalls).toEqual([{ group: "music", volume: 0.3 }]);
  });

  test("静音以后端音量 0 表达，取消静音恢复原音量", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });
    service.setVolume("music", 0.6);

    service.setMuted("music", true);
    expect(backend.volumeCalls[backend.volumeCalls.length - 1]).toEqual({
      group: "music",
      volume: 0,
    });

    service.setMuted("music", false);
    expect(backend.volumeCalls[backend.volumeCalls.length - 1]).toEqual({
      group: "music",
      volume: 0.6,
    });
  });
});

describe("播放、停止与切歌", () => {
  test("按资源播放并驱动后端", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);

    expect(backend.playCalls).toEqual([
      { group: "music", track: TRACKS.musicMain },
    ]);
  });

  test("切歌停止前一首并开始新一首", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    scope.play("music", TRACKS.musicBattle);

    expect(backend.stopCalls).toEqual(["music"]);
    expect(backend.playCalls).toEqual([
      { group: "music", track: TRACKS.musicMain },
      { group: "music", track: TRACKS.musicBattle },
    ]);
  });

  test("停止未播放的音频无副作用", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });

    expect(() => service.stop("ui")).not.toThrow();
    expect(backend.stopCalls).toEqual([]);
  });

  test("暂停与恢复驱动后端", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });
    const scope = service.createPlayScope();

    scope.play("sfx", TRACKS.sfxAttack);
    service.pause("sfx");
    service.resume("sfx");

    expect(backend.pauseCalls).toEqual(["sfx"]);
    expect(backend.resumeCalls).toEqual(["sfx"]);
  });
});

describe("作用域停止", () => {
  test("释放作用域停止其启动的全部音频，不影响其他作用域", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });

    const scopeS1 = service.createPlayScope();
    const scopeS2 = service.createPlayScope();

    scopeS1.play("music", TRACKS.musicMain);
    scopeS1.play("sfx", TRACKS.sfxAttack);
    scopeS2.play("ui", TRACKS.uiClick);

    scopeS1.release();

    expect([...backend.stopCalls].sort()).toEqual(["music", "sfx"]);
    expect(backend.stopCalls).not.toContain("ui");

    scopeS2.release();
    expect(backend.stopCalls).toContain("ui");
  });

  test("释放作用域不影响同分组已被其他作用域切换的播放", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });

    const scopeS1 = service.createPlayScope();
    const scopeS2 = service.createPlayScope();

    scopeS1.play("music", TRACKS.musicMain);
    scopeS2.play("music", TRACKS.musicBattle);

    scopeS1.release();

    // 仅切换时的 stop 一次，s1 释放不得再停止已被 s2 接管的 music
    expect(backend.stopCalls).toEqual(["music"]);

    scopeS2.release();
    expect(backend.stopCalls).toEqual(["music", "music"]);
  });

  test("重复释放无副作用", () => {
    const backend = new RecordingBackend();
    const service = createAudioService({ backend });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    scope.release();

    expect(() => scope.release()).not.toThrow();
  });
});

describe("后端不可用降级", () => {
  test("后端可用时服务非降级", () => {
    const service = createAudioService({ backend: new RecordingBackend() });
    expect(service.degraded).toBe(false);
  });

  test("后端不可用时服务可查询为降级状态", () => {
    const service = createAudioService({ backend: new RecordingBackend(false) });
    expect(service.degraded).toBe(true);
  });

  test("降级状态下所有操作无副作用且不调用后端", () => {
    const backend = new RecordingBackend(false);
    const service = createAudioService({ backend });
    const scope = service.createPlayScope();

    expect(() => {
      scope.play("music", TRACKS.musicMain);
      scope.release();
      service.stop("music");
      service.pause("music");
      service.resume("music");
      service.setMuted("sfx", true);
      service.setVolume("music", 0.5);
    }).not.toThrow();

    expect(backend.playCalls).toEqual([]);
    expect(backend.stopCalls).toEqual([]);
    expect(backend.pauseCalls).toEqual([]);
    expect(backend.resumeCalls).toEqual([]);
    expect(backend.volumeCalls).toEqual([]);
  });
});
