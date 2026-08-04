import { describe, expect, test } from "bun:test";

import type {
  ApplicationVisibilityState,
  DeviceInfo,
} from "../../../assets/framework/contracts/platform/Platform";
import type { TimeSource } from "../../../assets/framework/contracts/time/TimeSource";
import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";

describe("MemoryPlatform", () => {
  test("starts in the foreground by default", () => {
    const platform = new MemoryPlatform();

    expect(platform.state).toBe("foreground");
  });

  test("changes visibility and notifies registered listeners", () => {
    const platform = new MemoryPlatform();
    const seen: ApplicationVisibilityState[] = [];

    platform.onVisibilityChange((state) => {
      seen.push(state);
    });

    platform.setVisibility("background");
    platform.setVisibility("foreground");

    expect(seen).toEqual(["background", "foreground"]);
  });

  test("does not notify a listener after its handle is disposed", () => {
    const platform = new MemoryPlatform();
    const seen: ApplicationVisibilityState[] = [];
    const unsubscribe = platform.onVisibilityChange((state) => {
      seen.push(state);
    });

    unsubscribe();
    platform.setVisibility("background");

    expect(seen).toEqual([]);
  });

  test("stores and reads string values through the storage contract", async () => {
    const platform = new MemoryPlatform();

    expect(await platform.get("player.name")).toBeNull();

    await platform.set("player.name", "levi");
    expect(await platform.get("player.name")).toBe("levi");

    await platform.delete("player.name");
    expect(await platform.get("player.name")).toBeNull();
  });

  test("exposes default device information", () => {
    const platform = new MemoryPlatform();

    expect(platform.platform).toBeTypeOf("string");
    expect(platform.model).toBeTypeOf("string");
    expect(platform.language).toBeTypeOf("string");
  });

  test("accepts injected device information", () => {
    const deviceInfo: DeviceInfo = {
      platform: "web-desktop",
      model: "test-model",
      language: "zh-CN",
    };

    const platform = new MemoryPlatform({ deviceInfo });

    expect(platform.platform).toBe("web-desktop");
    expect(platform.model).toBe("test-model");
    expect(platform.language).toBe("zh-CN");
  });

  test("provides an injectable time source", () => {
    let current = 1_000;
    const now = () => current;
    const platform = new MemoryPlatform({ now });
    const timeSource: TimeSource = platform.timeSource;

    expect(timeSource.now()).toBe(1_000);

    current = 2_000;
    expect(timeSource.now()).toBe(2_000);
  });
});
