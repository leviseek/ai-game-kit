import { describe, expect, test } from "bun:test";

import { PassiveScheduler } from "../../../assets/framework/core/scheduling/PassiveScheduler";
import { SimulationClock } from "../../../assets/framework/core/time/SimulationClock";

interface Failure {
  readonly error: Error;
}

describe("PassiveScheduler failure isolation", () => {
  test("a failing callback does not block other due tasks in the same tick", () => {
    const clock = new SimulationClock({ initialTime: 0 });
    const scheduler = new PassiveScheduler(clock);
    const order: string[] = [];

    scheduler.schedule(() => {
      throw new Error("first failed");
    }, 100);
    scheduler.schedule(() => {
      order.push("second");
    }, 100);
    scheduler.schedule(() => {
      order.push("third");
    }, 100);

    clock.advance(100);
    scheduler.tick();

    expect(order).toEqual(["second", "third"]);
  });

  test("reports a failed callback through the configured error reporter", () => {
    const clock = new SimulationClock({ initialTime: 0 });
    const failures: Failure[] = [];
    const scheduler = new PassiveScheduler(clock, {
      onTaskError: (error) => {
        failures.push({ error });
      },
    });

    scheduler.schedule(() => {
      throw new Error("boom");
    }, 100);

    clock.advance(100);
    scheduler.tick();

    expect(failures).toHaveLength(1);
    expect(failures[0].error.message).toBe("boom");
  });

  test("isolates each failing callback and reports every failure", () => {
    const clock = new SimulationClock({ initialTime: 0 });
    const failures: Failure[] = [];
    const scheduler = new PassiveScheduler(clock, {
      onTaskError: (error) => {
        failures.push({ error });
      },
    });

    scheduler.schedule(() => {
      throw new Error("one");
    }, 100);
    scheduler.schedule(() => {
      throw new Error("two");
    }, 100);
    scheduler.schedule(() => {
      // succeeds, must still run after two failures
    }, 100);

    clock.advance(100);
    scheduler.tick();

    expect(failures).toHaveLength(2);
    expect(failures.map(({ error }) => error.message).sort()).toEqual([
      "one",
      "two",
    ]);
  });

  test("a failing one-shot task is still removed after failure", () => {
    const clock = new SimulationClock({ initialTime: 0 });
    const failures: Failure[] = [];
    const scheduler = new PassiveScheduler(clock, {
      onTaskError: (error) => {
        failures.push({ error });
      },
    });

    scheduler.schedule(() => {
      throw new Error("boom");
    }, 100);

    clock.advance(100);
    scheduler.tick();
    clock.advance(500);
    scheduler.tick();

    expect(failures).toHaveLength(1);
  });

  test("a failing repeating task stays scheduled and may fail again on next interval", () => {
    const clock = new SimulationClock({ initialTime: 0 });
    const failures: Failure[] = [];
    const scheduler = new PassiveScheduler(clock, {
      onTaskError: (error) => {
        failures.push({ error });
      },
    });

    scheduler.schedule(
      () => {
        throw new Error("recurring");
      },
      100,
      { repeat: true },
    );

    clock.advance(100);
    scheduler.tick();
    clock.advance(100);
    scheduler.tick();

    expect(failures).toHaveLength(2);
  });

  test("continues to process a later batch after a failure in an earlier batch", () => {
    const clock = new SimulationClock({ initialTime: 0 });
    const failures: Failure[] = [];
    const scheduler = new PassiveScheduler(clock, {
      onTaskError: (error) => {
        failures.push({ error });
      },
    });
    const runs: string[] = [];

    scheduler.schedule(() => {
      throw new Error("failing");
    }, 100);
    scheduler.schedule(() => {
      runs.push("first-batch-ok");
    }, 100);
    scheduler.schedule(() => {
      runs.push("second-batch");
    }, 300);

    clock.advance(100);
    scheduler.tick();
    clock.advance(200);
    scheduler.tick();

    expect(failures).toHaveLength(1);
    expect(runs).toEqual(["first-batch-ok", "second-batch"]);
  });
});
