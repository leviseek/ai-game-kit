import { describe, expect, test } from "bun:test";

import { GameClock, EnumPauseDomain } from "../../../assets/framework/core/time/GameClock";

describe("GameClock", () => {
    test("starts at the configured initial time", () => {
        const clock = new GameClock({ initialTime: 100 });
        expect(clock.now()).toBe(100);
        expect(clock.now(EnumPauseDomain.Menu)).toBe(100);
        expect(clock.now(EnumPauseDomain.Combat)).toBe(100);
    });

    test("advances elapsed time scaled by rate", () => {
        const clock = new GameClock({ timeScale: 2 });
        clock.advance(100);
        // rate=2：now 增 200ms（未暂停域均推进）
        expect(clock.now()).toBe(200);
        expect(clock.now(EnumPauseDomain.Menu)).toBe(200);
        expect(clock.now(EnumPauseDomain.Combat)).toBe(200);
    });

    test("paused domain does not advance while others continue", () => {
        const clock = new GameClock();
        clock.pause(EnumPauseDomain.Combat);
        clock.advance(100);
        // combat 冻结、menu 正常推进
        expect(clock.now(EnumPauseDomain.Combat)).toBe(0);
        expect(clock.now(EnumPauseDomain.Menu)).toBe(100);
    });

    test("menu pause does not freeze combat", () => {
        const clock = new GameClock();
        clock.pause(EnumPauseDomain.Menu);
        clock.advance(100);
        // menu 暂停不冻结 combat（悬浮菜单时战斗表现继续）
        expect(clock.now(EnumPauseDomain.Combat)).toBe(100);
        expect(clock.now(EnumPauseDomain.Menu)).toBe(0);
    });

    test("resume restores advancement for the resumed domain only", () => {
        const clock = new GameClock();
        clock.pause(EnumPauseDomain.Combat);
        clock.advance(100);
        clock.resume(EnumPauseDomain.Combat);
        clock.advance(100);
        // combat 恢复后从暂停处继续（elapsed 100 之后 +100）
        expect(clock.now(EnumPauseDomain.Combat)).toBe(100);
        expect(clock.now(EnumPauseDomain.Menu)).toBe(200);
    });

    test("freezeAll freezes every domain and thawAll restores", () => {
        const clock = new GameClock();
        clock.advance(100);
        clock.freezeAll();
        clock.advance(100);
        // 全部域冻结：now 停在 100
        expect(clock.now()).toBe(100);
        expect(clock.now(EnumPauseDomain.Menu)).toBe(100);
        expect(clock.now(EnumPauseDomain.Combat)).toBe(100);
        clock.thawAll();
        clock.advance(100);
        expect(clock.now()).toBe(200);
    });

    test("thawAll preserves per-domain pauses (C-17 additive semantics)", () => {
        const clock = new GameClock();
        clock.pause(EnumPauseDomain.Combat);
        clock.freezeAll();
        clock.advance(100);
        // 应用级冻结期间全部域不推进
        expect(clock.now(EnumPauseDomain.Menu)).toBe(0);
        expect(clock.now(EnumPauseDomain.Combat)).toBe(0);
        // thawAll 只清应用级冻结：menu 恢复推进、combat 保持分层暂停冻结
        clock.thawAll();
        clock.advance(100);
        expect(clock.now(EnumPauseDomain.Menu)).toBe(100);
        expect(clock.now(EnumPauseDomain.Combat)).toBe(0);
        // 分层 resume 解除 combat 暂停
        clock.resume(EnumPauseDomain.Combat);
        clock.advance(100);
        expect(clock.now(EnumPauseDomain.Combat)).toBe(100);
    });

    test("jumpTo jumps the base time for all domains", () => {
        const clock = new GameClock();
        clock.advance(100);
        clock.jumpTo(500);
        expect(clock.now()).toBe(500);
        expect(clock.now(EnumPauseDomain.Menu)).toBe(500);
        expect(clock.now(EnumPauseDomain.Combat)).toBe(500);
    });

    test("setTimeScale updates rate for subsequent advances", () => {
        const clock = new GameClock();
        clock.advance(100); // rate 1 → 100
        clock.setTimeScale(3);
        clock.advance(100); // rate 3 → +300
        expect(clock.now()).toBe(400);
    });

    test("rejects invalid rate values", () => {
        expect(() => new GameClock({ timeScale: 0 })).toThrow();
        expect(() => new GameClock({ timeScale: -1 })).toThrow();
        expect(() => new GameClock({ timeScale: Number.NaN })).toThrow();
        const clock = new GameClock();
        expect(() => clock.setTimeScale(0)).toThrow();
        expect(() => clock.setTimeScale(Number.POSITIVE_INFINITY)).toThrow();
    });

    test("rejects negative advance", () => {
        const clock = new GameClock();
        expect(() => clock.advance(-1)).toThrow();
    });
});
