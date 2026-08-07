import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import type { Module } from "../../../assets/framework";
import {
  createGameFixture,
  type GameFixture,
} from "../../../assets/game/fixture/GameFixture";

const projectRoot = resolve(import.meta.dir, "../../..");
const contractFile = resolve(projectRoot, "assets/game/fixture/GameFixture.ts");

const lifecycleSeams = [
  "start",
  "pause",
  "resume",
  "failRollback",
  "dispose",
] as const;

function createRecordingModule(id: string, log: string[]): Module {
  return {
    id,
    dependencies: [],
    start: () => {
      log.push(`${id}:start`);
    },
    pause: () => {
      log.push(`${id}:pause`);
    },
    resume: () => {
      log.push(`${id}:resume`);
    },
    stop: () => {
      log.push(`${id}:stop`);
    },
    dispose: () => {
      log.push(`${id}:dispose`);
    },
  };
}

// 统一驱动（happy path）：与 8.6 统一测试相同的接缝调用顺序，
// 不针对任何品类分支，证明任意 GameFixture 可无差异驱动。
async function driveHappyPath(fixture: GameFixture): Promise<string[]> {
  const steps: string[] = [];
  await fixture.start();
  steps.push("start");
  await fixture.pause();
  steps.push("pause");
  await fixture.resume();
  steps.push("resume");
  await fixture.dispose();
  steps.push("dispose");
  return steps;
}

// 统一驱动（含失败回滚接缝）：启动后触发 failRollback，再释放。
async function driveWithFailRollback(fixture: GameFixture): Promise<string[]> {
  const steps: string[] = [];
  await fixture.start();
  steps.push("start");
  await fixture.failRollback();
  steps.push("failRollback");
  await fixture.dispose();
  steps.push("dispose");
  return steps;
}

describe("GameFixture public contract", () => {
  test("declares the GameFixture contract file with the required seams", () => {
    expect(existsSync(contractFile)).toBe(true);

    if (!existsSync(contractFile)) {
      return;
    }

    const source = readFileSync(contractFile, "utf8");

    expect(source).toMatch(/\bexport\s+interface\s+GameFixture\b/);
    expect(source).toMatch(/readonly\s+modules\s*:/);

    for (const seam of lifecycleSeams) {
      expect(source).toMatch(new RegExp(`\\b${seam}\\s*\\(`));
    }

    // 契约层不依赖 cc / fgui：装配基础设施保持引擎无关（task 1.2 约束）
    expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
    expect(source).not.toMatch(/from\s*["']fairygui/);
  });

  test("createGameFixture builds a fixture exposing the module list and lifecycle seams", async () => {
    const log: string[] = [];
    const core = createRecordingModule("core", log);
    const fixture = createGameFixture({ id: "test", modules: [core] });

    expect(fixture.id).toBe("test");
    expect(fixture.modules.map((m) => m.id)).toEqual(["core"]);

    for (const seam of lifecycleSeams) {
      expect(typeof fixture[seam]).toBe("function");
    }

    // 装配基础设施必须真正组装并驱动已声明模块，而不只是暴露空壳
    await fixture.start();
    expect(log).toContain("core:start");
    await fixture.dispose();
    expect(log).toContain("core:dispose");
  });
});

describe("uniform lifecycle driving", () => {
  test("a single driver drives fixtures with different module compositions identically", async () => {
    const logA: string[] = [];
    const logB: string[] = [];

    const fixtureA = createGameFixture({
      id: "a",
      modules: [createRecordingModule("core", logA)],
    });
    const fixtureB = createGameFixture({
      id: "b",
      modules: [
        createRecordingModule("core", logB),
        createRecordingModule("save", logB),
      ],
    });

    await expect(driveHappyPath(fixtureA)).resolves.toEqual([
      "start",
      "pause",
      "resume",
      "dispose",
    ]);
    await expect(driveHappyPath(fixtureB)).resolves.toEqual([
      "start",
      "pause",
      "resume",
      "dispose",
    ]);

    expect(logA).toContain("core:start");
    expect(logB).toContain("core:start");
    expect(logB).toContain("save:start");
  });

  test("the failRollback seam can be driven and leaves the fixture releasable", async () => {
    const log: string[] = [];
    const fixture = createGameFixture({
      id: "f",
      modules: [createRecordingModule("core", log)],
    });

    const steps = await driveWithFailRollback(fixture);
    expect(steps).toEqual(["start", "failRollback", "dispose"]);

    // 失败回滚后不残留半启动状态：再次释放仍是安全的（幂等）
    await expect(fixture.dispose()).resolves.toBeUndefined();
  });
});

describe("undeclared capabilities do not participate in assembly", () => {
  test("the module list only contains declared modules and undeclared capabilities never run", async () => {
    const log: string[] = [];
    const core = createRecordingModule("core", log);
    // audio 模块在测试中存在但未声明给夹具
    const audio = createRecordingModule("audio", log);

    const fixture = createGameFixture({ id: "no-audio", modules: [core] });

    expect(fixture.modules.map((m) => m.id)).toEqual(["core"]);
    expect(fixture.modules.includes(audio)).toBe(false);

    await driveHappyPath(fixture);

    expect(log).toContain("core:start");
    expect(log).not.toContain("audio:start");
    expect(log).not.toContain("audio:dispose");
  });

  test("resource scope is only present when declared", () => {
    const fixture = createGameFixture({ id: "no-scope", modules: [] });

    expect(fixture.scope).toBeUndefined();
  });
});
