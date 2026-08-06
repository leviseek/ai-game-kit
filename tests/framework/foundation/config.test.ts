import { describe, expect, test } from "bun:test";

import { createMemoryResourceProvider } from "../../../assets/framework/adapters/memory/MemoryResourceProvider";
import type { PlatformStorage } from "../../../assets/framework/contracts/platform/Platform";
import type {
  ConfigTable,
  ReadonlyConfigSnapshot,
} from "../../../assets/framework/contracts/config/Config";
import {
  ConfigLoadError,
  ConfigMissingError,
  ConfigParseError,
  ConfigTypeMismatchError,
} from "../../../assets/framework/contracts/config/ConfigErrors";
import {
  configArray,
  configBoolean,
  configNumber,
  configObject,
  configString,
  createConfigTable,
} from "../../../assets/framework/core/config/ConfigTable";
import { loadConfigTable } from "../../../assets/framework/core/config/ConfigLoader";

interface HeroConfig {
  readonly id: number;
  readonly name: string;
}

// 快照对冻结对象赋值在 strict 模式下抛 TypeError；无论抛出还是被忽略，
// 后续读取都必须返回原始内容。测试统一经 try/catch 吞掉修改尝试。
function attemptMutation(fn: () => void): void {
  try {
    fn();
  } catch {
    // 冻结对象在 strict 模式下赋值抛错属预期，忽略以覆盖"抛出或被忽略"两种语义
  }
}

describe("ConfigTable typed reads", () => {
  test("reads a configured value at its declared type", () => {
    const table = createConfigTable({ level: 3, name: "levi" });

    expect(table.read("level", configNumber)).toBe(3);
    expect(table.read("name", configString)).toBe("levi");
  });

  test("reads boolean, object and array values at their declared types", () => {
    const hero = { id: 1, name: "alice" };
    const table = createConfigTable({
      pvp: true,
      hero,
      badges: ["newbie", "explorer"],
    });

    expect(table.read("pvp", configBoolean)).toBe(true);
    expect(table.read("hero", configObject)).toEqual(hero);
    expect(table.read("badges", configArray)).toEqual(["newbie", "explorer"]);
  });

  test("a type mismatch throws a typed error carrying the key", () => {
    const table = createConfigTable({ level: "abc" });

    try {
      table.read("level", configNumber);
      expect.unreachable("read should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigTypeMismatchError);
      const mismatch = error as ConfigTypeMismatchError;
      expect(mismatch.key).toBe("level");
    }
  });

  test("a declared object type rejects a non-object value with a typed error", () => {
    const table = createConfigTable({ hero: 7 });

    expect(() => table.read("hero", configObject)).toThrow(
      ConfigTypeMismatchError,
    );
  });

  test("a declared array type rejects a non-array value with a typed error", () => {
    const table = createConfigTable({ badges: "newbie" });

    expect(() => table.read("badges", configArray)).toThrow(
      ConfigTypeMismatchError,
    );
  });
});

describe("ConfigTable missing vs malformed config", () => {
  test("reading a missing key throws a distinct missing error", () => {
    const table = createConfigTable({ level: 3 });

    try {
      table.read("missing", configNumber);
      expect.unreachable("read should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigMissingError);
      const missing = error as ConfigMissingError;
      expect(missing.key).toBe("missing");
    }
  });

  test("malformed structured content throws a distinct parse error with key diagnostics", () => {
    // 值存在但为无法解析为对象形状的 JSON 字符串：属解析失败而非类型不匹配
    const table = createConfigTable({ startParams: "{oops" });

    try {
      table.read("startParams", configObject);
      expect.unreachable("read should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigParseError);
      const parse = error as ConfigParseError;
      expect(parse.key).toBe("startParams");
    }
  });

  test("missing and parse failures are different typed errors", () => {
    const table = createConfigTable({ startParams: "{oops" });

    let missingCaught: unknown;
    let parseCaught: unknown;

    try {
      table.read("not-here", configObject);
    } catch (error) {
      missingCaught = error;
    }

    try {
      table.read("startParams", configObject);
    } catch (error) {
      parseCaught = error;
    }

    expect(missingCaught).toBeInstanceOf(ConfigMissingError);
    expect(parseCaught).toBeInstanceOf(ConfigParseError);
    expect(missingCaught).not.toBeInstanceOf(ConfigParseError);
    expect(parseCaught).not.toBeInstanceOf(ConfigMissingError);
  });
});

describe("ConfigTable default value strategy", () => {
  test("a missing key falls back to the provided default without error", () => {
    const table = createConfigTable({ level: 3 });

    expect(table.read("unknown", configNumber, 99)).toBe(99);
    expect(table.read("unknown", configString, "fallback")).toBe("fallback");
  });

  test("a present key returns the actual value instead of the default", () => {
    const table = createConfigTable({ level: 3, name: "levi" });

    expect(table.read("level", configNumber, 99)).toBe(3);
    expect(table.read("name", configString, "fallback")).toBe("levi");
  });

  test("the default only covers missing keys, not malformed ones", () => {
    const table = createConfigTable({ startParams: "{oops" });

    // 默认值仅在缺失时生效：配置存在但解析失败仍必须报错，不得静默回退
    expect(() =>
      table.read("startParams", configObject, {}),
    ).toThrow(ConfigParseError);
  });
});

describe("ConfigTable read-only snapshot", () => {
  test("snapshot is a frozen structure", () => {
    const table = createConfigTable({ level: 3, hero: { id: 1, name: "alice" } });

    const snapshot = table.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.level).toBe(3);
  });

  test("mutating the snapshot does not affect later reads", () => {
    const table = createConfigTable({ level: 3 });

    const snapshot = table.snapshot();
    attemptMutation(() => {
      (snapshot as Record<string, unknown>).level = 999;
    });
    attemptMutation(() => {
      (snapshot as Record<string, unknown>).added = true;
    });

    expect(table.read("level", configNumber)).toBe(3);
    expect(Object.prototype.hasOwnProperty.call(snapshot, "added")).toBe(false);
  });

  test("mutating a nested snapshot object does not change later reads", () => {
    const table = createConfigTable({ hero: { id: 1, name: "alice" } });

    const snapshot = table.snapshot();
    const hero = (snapshot as { readonly hero: HeroConfig }).hero;
    attemptMutation(() => {
      hero.name = "bob";
    });

    expect(table.read("hero", configObject)).toEqual({ id: 1, name: "alice" });
  });

  test("snapshot and table expose the same loaded content", () => {
    const table = createConfigTable({ level: 3 });
    const snapshot: ReadonlyConfigSnapshot = table.snapshot();

    expect(table.read("level", configNumber)).toBe(snapshot.level);
    expect(Object.keys(snapshot)).toEqual(["level"]);
  });
});

describe("ConfigTable save-storage separation boundary", () => {
  test("config loads and reads never touch a save key-value backend", async () => {
    const storageCalls: string[] = [];
    const spyStorage: PlatformStorage = {
      async get(key) {
        storageCalls.push(`get:${key}`);
        return null;
      },
      async set(key, value) {
        storageCalls.push(`set:${key}:${value}`);
      },
      async delete(key) {
        storageCalls.push(`delete:${key}`);
      },
    };

    // 配置走资源读取路径（kind: "asset"），全程不写也不读存档后端
    const provider = createMemoryResourceProvider({
      loader: async () => ({ level: 3, name: "levi" }),
    });
    const table: ConfigTable = await loadConfigTable(
      provider,
      "config",
      "start.json",
    );

    expect(table.read("level", configNumber)).toBe(3);
    expect(table.read("name", configString)).toBe("levi");
    expect(storageCalls).toEqual([]);
  });

  test("a bundle config load failure is a typed error preserving the underlying cause", async () => {
    const underlying = new Error("bundle missing");
    const provider = createMemoryResourceProvider({
      loader: async () => {
        throw underlying;
      },
    });

    try {
      await loadConfigTable(provider, "config", "start.json");
      expect.unreachable("load should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      const loadError = error as ConfigLoadError;
      expect(loadError.bundle).toBe("config");
      expect(loadError.path).toBe("start.json");
      expect(loadError.cause).toBe(underlying);
    }
  });

  test("a bundle config load failure produces no partial config state", async () => {
    const provider = createMemoryResourceProvider({
      loader: async () => {
        throw new Error("resource missing");
      },
    });

    // 装载失败整体失败：调用方拿不到部分配置表，也读不到任何条目
    await expect(
      loadConfigTable(provider, "config", "start.json"),
    ).rejects.toBeInstanceOf(ConfigLoadError);
  });

  test("malformed config content is a typed error and never produces a table", () => {
    // 装载出的内容不是纯对象（如标量/数组/空）：视为解析失败，不产生部分状态
    expect(() => createConfigTable("not-an-object")).toThrow(ConfigParseError);
    expect(() => createConfigTable([1, 2, 3])).toThrow(ConfigParseError);
    expect(() => createConfigTable(null)).toThrow(ConfigParseError);
  });
});
