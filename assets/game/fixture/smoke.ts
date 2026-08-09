import type { GameFixture } from "./GameFixture";
import {
    gameFixtureRegistry,
    type GameFixtureRegistry,
} from "./registry";
import type { ViewModelNode } from "../../framework";
import { createViewModelRenderer } from "../../framework";
import { createCardFixture } from "../../game_card/assembly";
import {
    createCardBattleBindings,
    createCardBattleViewModel,
} from "../../game_card/view/view";

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

/**
 * 卡牌对战真实可玩冒烟：装配 game_card 夹具 + ViewModel 渲染器，经注入的
 * 视图节点解析器（boot 侧 fgui 接缝）驱动完整对局——出牌/结束回合/敌攻/
 * 胜负/重开。每步经 report 回调输出 `[card-battle]` 标记。组合逻辑留在
 * 游戏层夹具，boot/AppRoot 只注入节点解析器（design decision 3/4）。
 */
export async function runCardBattleSmoke(
    node: (name: string) => ViewModelNode | undefined,
    report: (step: string, ok: boolean, detail?: string) => void,
): Promise<void> {
    const fixture = createCardFixture();
    await fixture.start();

    const renderer = createViewModelRenderer({
        node,
        bindings: createCardBattleBindings({
            playCard: (index) => {
                fixture.battle.playCard(index);
            },
            endTurn: () => {
                fixture.battle.endTurn();
            },
            restart: () => {
                fixture.battle.restart();
            },
        }),
    });

    const render = (): void => {
        renderer.setViewModel(
            createCardBattleViewModel(fixture.battle.state, 8),
        );
    };

    // 完整对局：出牌 → 结束回合 → 敌攻 → 胜负 → 重开
    render();
    report("render-initial", true);

    fixture.battle.playCard(0); // 卡牌 0 伤害 2
    render();
    report(
        "play-card",
        fixture.battle.state.enemyHp === 6,
        `enemyHp=${fixture.battle.state.enemyHp}`,
    );

    fixture.battle.endTurn(); // 进入敌方阶段
    fixture.clock.advance(600); // 敌攻一次（默认间隔 500ms）
    render();
    report(
        "enemy-attack",
        fixture.battle.state.playerHp === 8,
        `playerHp=${fixture.battle.state.playerHp}`,
    );

    // 重开重置
    fixture.battle.restart();
    render();
    const restartState = fixture.battle.state;
    report(
        "restart",
        restartState.phase === "player" && restartState.enemyHp === 8,
        `phase=${restartState.phase} enemyHp=${restartState.enemyHp}`,
    );

    await fixture.dispose();
    renderer.dispose();
}
