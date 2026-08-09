import type { GameFixture } from "./GameFixture";
import {
  gameFixtureRegistry,
  type GameFixtureRegistry,
} from "./registry";

/**
 * 按品类夹具驱动一次完整生命周期冒烟：构造夹具并依次执行
 * start → pause → resume → failRollback → dispose。每步经 console 输出
 * `[fixture-smoke]` 标记，由 headless Chrome + CDP 采集验证（对齐 runUiSmoke）。
 * 未登记的品类报告 fixture-unknown 失败标记，不抛错；生命周期任一步失败
 * 报告该步失败标记并中止后续步骤，不中断序列其余部分。
 */
export async function runFixtureSmoke(
  fixtureId: string,
  registry: GameFixtureRegistry = gameFixtureRegistry,
): Promise<void> {
  const report = (step: string, ok: boolean, detail = "") => {
    console.log(
      `[fixture-smoke] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`,
    );
  };

  const factory = registry[fixtureId];

  if (factory === undefined) {
    report("fixture-unknown", false, `no factory for "${fixtureId}"`);
    return;
  }

  let fixture: GameFixture;

  try {
    fixture = factory();
  } catch (error) {
    report(
      "fixture-create",
      false,
      error instanceof Error ? error.message : String(error),
    );
    return;
  }

  report("fixture-found", true, fixtureId);

  // 音频降级路径探测（可选能力）：夹具若暴露 `audio.degraded`（如格斗夹具
  // 缺省不可用后端），报告降级状态成立（true=后端不可用、服务整体 no-op）。
  // 未暴露该能力的夹具不输出此标记，保持驱动不依赖具体品类能力。
  const audio = (fixture as { audio?: { readonly degraded?: boolean } }).audio;
  if (audio !== undefined) {
    report("audio-degraded", audio.degraded === true, `degraded=${String(audio.degraded)}`);
  }

  const steps: ReadonlyArray<[string, (f: GameFixture) => Promise<void>]> = [
    ["start", (f) => f.start()],
    ["pause", (f) => f.pause()],
    ["resume", (f) => f.resume()],
    ["failRollback", (f) => f.failRollback()],
    ["dispose", (f) => f.dispose()],
  ];

  for (const [step, run] of steps) {
    try {
      await run(fixture);
      report(step, true);
    } catch (error) {
      report(
        step,
        false,
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
  }
}
