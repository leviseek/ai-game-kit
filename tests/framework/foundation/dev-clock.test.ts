import { describe, expect, test } from "bun:test";

import { createDevPresentationClock } from "../../../assets/boot/dev/DevClock";

describe("createDevPresentationClock", () => {
    test("tick 按墙钟增量推进表现时间", () => {
        const devClock = createDevPresentationClock();
        const start = devClock.timeSource();
        const wallNow = Date.now();

        devClock.tick(wallNow + 100);

        const after = devClock.timeSource();
        expect(after).toBeGreaterThan(start);
    });

    test("负增量（墙钟倒退）防抖：表现时间不倒退", () => {
        const devClock = createDevPresentationClock();
        const wallNow = Date.now();
        devClock.tick(wallNow + 100);
        const before = devClock.timeSource();

        // 倒退的墙钟读数不应使表现时间倒退
        devClock.tick(wallNow - 10_000);
        expect(devClock.timeSource()).toBe(before);
    });
});
