import { GameClock } from "../../framework";

/**
 * dev overlay 表现时钟装配：GameClock（framework 表现时间控制点，ADR-029）经
 * 墙钟差值推进，动画器只读 timeSource.now()。AppRoot 不直接 new GameClock
 * （task68 组合根 new 白名单约束），由本工厂集中创建并驱动。
 */
export function createDevPresentationClock(): {
    readonly timeSource: () => number;
    /** 按墙钟增量推进表现时钟；由驱动循环每帧调用。 */
    tick(wallNow: number): void;
} {
    const clock = new GameClock();
    let lastWall = Date.now();
    return {
        timeSource: () => clock.now(),
        tick(wallNow: number): void {
            clock.advance(Math.max(0, wallNow - lastWall));
            lastWall = wallNow;
        },
    };
}
