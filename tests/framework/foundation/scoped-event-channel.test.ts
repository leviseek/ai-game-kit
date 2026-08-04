import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import type { DisposeHandle } from "../../../assets/framework/core/scheduling/DisposeHandle";
import {
  createScopedEventChannel,
  type ScopedEventChannel,
} from "../../../assets/framework/core/events/ScopedEventChannel";

interface GameEvents {
  readonly scoreChanged: { readonly score: number };
  readonly levelUp: { readonly level: number };
}

describe("ScopedEventChannel typed publish/subscribe", () => {
  test("delivers a typed payload to subscribers of that event only", () => {
    const channel = createScopedEventChannel<GameEvents>();
    const scoreUpdates: number[] = [];
    const levelUps: number[] = [];

    channel.on("scoreChanged", (payload) => scoreUpdates.push(payload.score));
    channel.on("levelUp", (payload) => levelUps.push(payload.level));

    channel.emit("scoreChanged", { score: 10 });
    channel.emit("levelUp", { level: 2 });

    expect(scoreUpdates).toEqual([10]);
    expect(levelUps).toEqual([2]);
  });
});

describe("ScopedEventChannel subscription disposal", () => {
  test("stops delivering after the subscription handle is disposed", () => {
    const channel = createScopedEventChannel<GameEvents>();
    const scores: number[] = [];

    const handle: DisposeHandle = channel.on("scoreChanged", (payload) =>
      scores.push(payload.score),
    );

    channel.emit("scoreChanged", { score: 1 });
    handle.dispose();
    channel.emit("scoreChanged", { score: 2 });

    expect(scores).toEqual([1]);
  });

  test("repeated disposal of the same handle is harmless", () => {
    const channel = createScopedEventChannel<GameEvents>();
    const scores: number[] = [];

    const handle: DisposeHandle = channel.on("scoreChanged", (payload) =>
      scores.push(payload.score),
    );

    handle.dispose();
    handle.dispose();
    channel.emit("scoreChanged", { score: 5 });

    expect(scores).toEqual([]);
  });
});

describe("ScopedEventChannel handler failure isolation", () => {
  test("a failing handler does not block other handlers in the same emit", () => {
    const failures: unknown[] = [];
    const channel = createScopedEventChannel<GameEvents>({
      onHandlerError: (error) => failures.push(error),
    });
    const order: string[] = [];

    channel.on("scoreChanged", () => {
      throw new Error("first handler failed");
    });
    channel.on("scoreChanged", () => order.push("second"));

    channel.emit("scoreChanged", { score: 1 });

    expect(order).toEqual(["second"]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(Error);
    expect((failures[0] as Error).message).toBe("first handler failed");
  });
});

describe("ScopedEventChannel scope closure", () => {
  test("stops all subscriptions after the channel is disposed", () => {
    const channel = createScopedEventChannel<GameEvents>();
    const scores: number[] = [];

    channel.on("scoreChanged", (payload) => scores.push(payload.score));
    channel.emit("scoreChanged", { score: 1 });

    channel.dispose();
    channel.emit("scoreChanged", { score: 2 });

    expect(scores).toEqual([1]);
  });

  test("a disposed channel ignores future emissions without throwing", () => {
    const channel = createScopedEventChannel<GameEvents>();

    channel.dispose();

    expect(() => channel.emit("scoreChanged", { score: 1 })).not.toThrow();
  });

  test("disposing the channel from a handler stops the same batch", () => {
    const channel = createScopedEventChannel<GameEvents>();
    const order: string[] = [];

    channel.on("scoreChanged", () => {
      order.push("first");
      channel.dispose();
    });
    channel.on("scoreChanged", () => order.push("second"));

    channel.emit("scoreChanged", { score: 1 });

    expect(order).toEqual(["first"]);
  });

  test("dispose after dispose throws on further subscribe", () => {
    const channel = createScopedEventChannel<GameEvents>();

    channel.dispose();

    expect(() =>
      channel.on("scoreChanged", () => {}),
    ).toThrow("cannot subscribe after disposal");
  });

  test("a subscription added during emit is not called in the current batch", () => {
    const channel = createScopedEventChannel<GameEvents>();
    const scores: number[] = [];

    channel.on("scoreChanged", () => {
      channel.on("scoreChanged", (payload) => scores.push(payload.score));
    });

    channel.emit("scoreChanged", { score: 1 });
    channel.emit("scoreChanged", { score: 2 });

    expect(scores).toEqual([2]);
  });

  test("a subscription disposed during emit is skipped later", () => {
    const channel = createScopedEventChannel<GameEvents>();
    const scores: number[] = [];
    let handle: DisposeHandle | undefined;

    channel.on("scoreChanged", () => {
      handle?.dispose();
    });
    handle = channel.on("scoreChanged", (payload) =>
      scores.push(payload.score),
    );

    channel.emit("scoreChanged", { score: 1 });
    channel.emit("scoreChanged", { score: 2 });

    expect(scores).toEqual([]);
  });

  test("disposed subscriptions release captured handler references", () => {
    const channel = createScopedEventChannel<GameEvents>();
    let captured: { readonly large: string } | undefined = {
      large: "x".repeat(1024),
    };
    const weak = new WeakRef(captured);

    channel.on("scoreChanged", () => {
      void captured;
    });
    channel.emit("scoreChanged", { score: 1 });

    captured = undefined;
    channel.dispose();

    // Pruning must release the handler closure; force GC to verify
    if (typeof Bun !== "undefined") {
      Bun.gc(true);
    }

    expect(weak.deref()).toBeUndefined();
  });
});

describe("ScopedEventChannel boundary isolation", () => {
  test("channels do not share subscriptions across instances", () => {
    const first = createScopedEventChannel<GameEvents>();
    const second = createScopedEventChannel<GameEvents>();
    const firstScores: number[] = [];

    first.on("scoreChanged", (payload) => firstScores.push(payload.score));

    second.emit("scoreChanged", { score: 9 });

    expect(firstScores).toEqual([]);
  });

  test("disposing one channel leaves an independent channel working", () => {
    const first = createScopedEventChannel<GameEvents>();
    const second = createScopedEventChannel<GameEvents>();
    const secondScores: number[] = [];

    first.on("scoreChanged", () => {});
    second.on("scoreChanged", (payload) => secondScores.push(payload.score));

    first.dispose();
    second.emit("scoreChanged", { score: 3 });

    expect(secondScores).toEqual([3]);
  });

  test("no module-level event bus or singleton is exposed", () => {
    const source = readFileSync(
      resolve(
        import.meta.dir,
        "../../../assets/framework/core/events/ScopedEventChannel.ts",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\bglobalThis\b/);
    expect(source).not.toMatch(/\bsingleton\b/);
    expect(source).not.toMatch(/static\s+\w+\s*=/);
  });

  test("no string-keyed global event registry leaks from the channel", () => {
    const channel = createScopedEventChannel<GameEvents>();
    const source = readFileSync(
      resolve(
        import.meta.dir,
        "../../../assets/framework/core/events/ScopedEventChannel.ts",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/window\./);
    expect(source).not.toMatch(/globalThis\./);

    expect(() => channel.dispose()).not.toThrow();
  });
});
