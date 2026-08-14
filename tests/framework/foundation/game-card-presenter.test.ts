import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { IViewModelNode } from "../../../assets/framework";
import { createCardBattlePresenter } from "../../../assets/samples/game_card/view/presenter";

const projectRoot = resolve(import.meta.dir, "../../..");
const assemblyFile = resolve(projectRoot, "assets/samples/game_card/assembly.ts");
const CARD_ASSEMBLY_EXISTS = existsSync(assemblyFile);

/** 记录型视图节点：仅需满足 IViewModelNode 形状（本测试只断言时钟推进，不读节点值）。 */
function recordingView(): { node: (name: string) => IViewModelNode | undefined } {
    return {
        node: () => ({
            setText: () => undefined,
            setProgress: () => undefined,
            setVisible: () => undefined,
            setXY: () => undefined,
            setAlpha: () => undefined,
            setUrl: () => undefined,
            onClick: () => undefined,
        }),
    };
}

interface CardPresenterClockLike {
    now(): number;
    advance(milliseconds: number): void;
}

interface CardPresenterFixtureLike {
    readonly clock: CardPresenterClockLike;
    start(): Promise<void>;
    dispose(): Promise<void>;
}

describe.skipIf(!CARD_ASSEMBLY_EXISTS)("Card battle presenter drive timing (P1-9 regression)", () => {
    // 回归：呈现器不得直接读 Date.now 驱动模拟时钟（ADR-029 C-02 逻辑层禁读
    // 墙钟）。修复前 presenter 用 Date.now() 差值喂模拟时钟，测试不可控；
    // 修复后墙钟读数经注入 now() 取得、驱动经 drive 接缝手动触发，且负增量
    // 收敛为 0（墙钟回拨不推进模拟时钟）。
    test("advances the simulation clock by the injected wall delta only", async () => {
        const assembly = (await import(pathToFileURL(assemblyFile).href)) as {
            createCardFixture: (options?: object) => CardPresenterFixtureLike;
        };
        const fixture = assembly.createCardFixture();
        await fixture.start();
        const view = recordingView();

        let wallTime = 0;
        let driver: (() => void) | undefined;
        const presenter = createCardBattlePresenter(fixture as never, view.node, {
            now: () => wallTime,
            drive: (tick) => {
                driver = tick;
                return {
                    dispose: () => {
                        driver = undefined;
                    },
                };
            },
        });
        expect(driver).toBeDefined();

        // 250ms 墙钟增量 → 模拟时钟 +250（不做任何倍率缩放，1x）
        wallTime += 250;
        driver?.();
        expect(fixture.clock.now()).toBe(250);

        // 再次推进 100ms → +100
        wallTime += 100;
        driver?.();
        expect(fixture.clock.now()).toBe(350);

        // 墙钟回拨：增量收敛为 0，模拟时钟不倒退（时间单调）
        wallTime -= 50;
        driver?.();
        expect(fixture.clock.now()).toBe(350);

        presenter.dispose();
        await fixture.dispose();
    });
});
