import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

// 注意：bun 在同一进程运行所有测试文件，mock.module("cc") 全局共享且首个注册
// 生效。本文件全部行为断言都经注入的 createSource 接缝，不依赖 cc 缺省成员；
// 缺省 createSource 路径改用源码断言锁定。
mock.module("cc", () => ({}));

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import { createAudioService } from "../../../assets/framework/core/audio/AudioService";
import { createResourceProvider } from "../../../assets/framework/core/resource/ResourceProvider";
import type { AudioGroup, AudioTrackRef } from "../../../assets/framework/contracts/audio/Audio";
import type { IResourceProvider } from "../../../assets/framework/contracts/resource/ResourceProvider";

const TRACKS = {
  musicMain: { bundle: "audio", path: "music/main" } as AudioTrackRef,
  musicBattle: { bundle: "audio", path: "music/battle" } as AudioTrackRef,
};

interface MockAudioSource {
  clip: unknown;
  loop: boolean;
  volume: number;
  playing: boolean;
  readonly playCalls: number;
  readonly stopCalls: number;
  readonly pauseCalls: number;
  readonly resumeCalls: number;
}

class MockAudioSourceImpl implements MockAudioSource {
  public clip: unknown = undefined;
  public loop = false;
  public volume = 1;
  public playing = false;
  public playCalls = 0;
  public stopCalls = 0;
  public pauseCalls = 0;
  public resumeCalls = 0;

  play(): void {
    this.playing = true;
    this.playCalls += 1;
  }

  stop(): void {
    this.playing = false;
    this.stopCalls += 1;
  }

  pause(): void {
    this.pauseCalls += 1;
  }

  resume(): void {
    this.resumeCalls += 1;
  }
}

interface SourceSeam {
  readonly createSource: (group: AudioGroup) => MockAudioSourceImpl;
  readonly sourceOf: (group: AudioGroup) => MockAudioSourceImpl;
}

function createSourceSeam(): SourceSeam {
  const sources = new Map<AudioGroup, MockAudioSourceImpl>();

  return {
    createSource(group) {
      const source = new MockAudioSourceImpl();
      sources.set(group, source);
      return source;
    },
    sourceOf(group) {
      const source = sources.get(group);
      if (source === undefined) {
        throw new Error(`no source created for ${group}`);
      }
      return source;
    },
  };
}

interface ControlledProvider {
  readonly provider: IResourceProvider;
  readonly calls: Array<{ bundle: string; path: string }>;
  readonly unloaded: string[];
  resolveNext(clip: unknown): void;
}

function createControlledProvider(): ControlledProvider {
  const calls: Array<{ bundle: string; path: string }> = [];
  const unloaded: string[] = [];
  const pending: Array<(value: unknown) => void> = [];

  const provider = createResourceProvider({
    loader: (key) => {
      calls.push({ bundle: key.bundle, path: key.path });
      return new Promise((resolveNext) => {
        pending.push(resolveNext);
      });
    },
    unloadBundle: (bundle) => {
      unloaded.push(bundle);
    },
  });

  return {
    provider,
    calls,
    unloaded,
    resolveNext(clip) {
      pending.shift()?.(clip);
    },
  };
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
  projectRoot,
  "assets/framework/adapters/cocos/audio/CocosAudioAdapter.ts",
);

interface CocosAudioAdapterFactory {
  createCocosAudioAdapter(options: {
    readonly provider: IResourceProvider;
    readonly createSource?: (group: AudioGroup) => unknown;
  }): unknown;
}

async function loadAdapter(): Promise<CocosAudioAdapterFactory["createCocosAudioAdapter"]> {
  const exports = (await import(
    pathToFileURL(adapterFile).href
  )) as Partial<CocosAudioAdapterFactory>;

  expect(typeof exports.createCocosAudioAdapter).toBe("function");

  return exports.createCocosAudioAdapter as CocosAudioAdapterFactory["createCocosAudioAdapter"];
}

async function flush(): Promise<void> {
  await new Promise<void>((resolveNext) => setTimeout(resolveNext, 0));
}

describe("CocosAudioAdapter", () => {
  test("按资源经资源层加载 AudioClip 并驱动 AudioSource", async () => {
    const createAdapter = await loadAdapter();
    const controlled = createControlledProvider();
    const seam = createSourceSeam();
    const adapter = createAdapter({
      provider: controlled.provider,
      createSource: seam.createSource,
    }) as import("../../../assets/framework/contracts/audio/Audio").AudioBackend;
    const service = createAudioService({ backend: adapter });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    expect(controlled.calls).toEqual([{ bundle: "audio", path: "music/main" }]);

    const clip = { name: "music-main" };
    controlled.resolveNext(clip);
    await flush();

    const source = seam.sourceOf("music");
    expect(source.clip).toBe(clip);
    expect(source.playCalls).toBe(1);
    scope.release();
  });

  test("切歌停止前一首并播放新资源，音量应用到 AudioSource", async () => {
    const createAdapter = await loadAdapter();
    const controlled = createControlledProvider();
    const seam = createSourceSeam();
    const adapter = createAdapter({
      provider: controlled.provider,
      createSource: seam.createSource,
    }) as import("../../../assets/framework/contracts/audio/Audio").AudioBackend;
    const service = createAudioService({ backend: adapter });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    controlled.resolveNext({ name: "main" });
    await flush();
    const source = seam.sourceOf("music");

    service.setVolume("music", 0.5);
    expect(source.volume).toBe(0.5);

    scope.play("music", TRACKS.musicBattle);
    controlled.resolveNext({ name: "battle" });
    await flush();

    expect(source.clip).toEqual({ name: "battle" });
    expect(source.stopCalls).toBeGreaterThan(0);
    scope.release();
  });

  test("后台暂停/前台恢复策略驱动 AudioSource", async () => {
    const createAdapter = await loadAdapter();
    const controlled = createControlledProvider();
    const seam = createSourceSeam();
    const platform = new MemoryPlatform();
    const adapter = createAdapter({
      provider: controlled.provider,
      createSource: seam.createSource,
    }) as import("../../../assets/framework/contracts/audio/Audio").AudioBackend;
    const service = createAudioService({
      backend: adapter,
      visibility: platform,
      backgroundPolicy: { pauseOnBackground: ["music"] },
    });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    controlled.resolveNext({ name: "main" });
    await flush();

    platform.setVisibility("background");
    expect(seam.sourceOf("music").pauseCalls).toBe(1);

    platform.setVisibility("foreground");
    expect(seam.sourceOf("music").resumeCalls).toBe(1);
    scope.release();
  });

  test("停止后资源释放闭环：Bundle 可卸载且不报错", async () => {
    const createAdapter = await loadAdapter();
    const controlled = createControlledProvider();
    const seam = createSourceSeam();
    const adapter = createAdapter({
      provider: controlled.provider,
      createSource: seam.createSource,
    }) as import("../../../assets/framework/contracts/audio/Audio").AudioBackend;
    const service = createAudioService({ backend: adapter });
    const scope = service.createPlayScope();

    scope.play("music", TRACKS.musicMain);
    controlled.resolveNext({ name: "main" });
    await flush();

    // 播放中：适配器自建作用域持有 clip，Bundle 不可卸载
    expect(controlled.provider.canUnload("audio")).toBe(false);

    service.stop("music");
    scope.release();

    // 停止后适配器释放持有，资源层计数收敛，Bundle 可卸载
    expect(controlled.provider.canUnload("audio")).toBe(true);
    expect(controlled.unloaded).toContain("audio");
  });

  test("缺省 AudioSource 路径经 cc.Node + cc.AudioSource 构建", async () => {
    const source = readFileSync(adapterFile, "utf8");

    expect(source).toMatch(/cc\.Node/);
    expect(source).toMatch(/cc\.AudioSource/);
    expect(source).toMatch(/options\.createSource\s*\?\?/);
  });
});
