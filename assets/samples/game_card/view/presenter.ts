import type { IViewModelNode } from "../../../framework";
import { createViewModelRenderer } from "../../../framework";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { CardFixture } from "../assembly";
import { createCardBattleBindings, createCardBattleViewModel, type CardBattleCommands } from "./view";

/** 呈现器驱动接缝选项：测试可注入自增墙钟与手动驱动，确定性推进敌方阶段计时。 */
export interface CardBattlePresenterOptions {
    /** 墙钟读数；缺省 Date.now（ADR-029：呈现层经注入 timeSource，逻辑层禁读墙钟）。 */
    readonly now?: () => number;
    /** 驱动循环；缺省 100ms setInterval。返回释放句柄。 */
    readonly drive?: (tick: () => void) => { readonly dispose: () => void };
}

/**
 * 卡牌战场呈现器：把 card 夹具回合状态绑定到 BattleView 节点。命令点击
 * 联动出牌/回合/重开并立即重渲染；敌方阶段经可控时钟按真实流逝推进，
 * 使对局在持久会话下随时间真实进行。dispose 清理渲染器与时钟驱动。
 *
 * 时间域（ADR-029）：呈现层墙钟读数经注入的 now() 取得（缺省 Date.now，
 * 测试注入自增源确定性推进），以原始墙钟增量 advance 模拟时钟——模拟时钟
 * 内部不持有倍率（1x），增量直接累加，不叠加任何表现时钟倍率。
 */
export function createCardBattlePresenter(fixture: GameFixture, node: (name: string) => IViewModelNode | undefined, options: CardBattlePresenterOptions = {}): GamePresenter {
    const card = fixture as CardFixture;
    const now = options.now ?? (() => Date.now());
    // 驱动循环接缝：缺省 100ms setInterval；测试注入手动驱动（对齐 auto_battle
    // presenter / DevOverlay drive 模式）
    const drive =
        options.drive ??
        ((tick) => {
            const timer = setInterval(tick, 100);
            return { dispose: () => clearInterval(timer) };
        });

    // 敌方 HP 上限取初始状态（对局中途不变），供进度条归一化
    const enemyHpMax = card.battle.state.enemyHp;

    let lastTick = now();

    const renderer = createViewModelRenderer({
        node,
        bindings: createCardBattleBindings({
            playCard: (index: number) => {
                card.battle.playCard(index);
                render();
            },
            endTurn: () => {
                card.battle.endTurn();
                render();
            },
            restart: () => {
                card.battle.restart();
                render();
            },
        } satisfies CardBattleCommands),
    });

    function render(): void {
        renderer.setViewModel(createCardBattleViewModel(card.battle.state, enemyHpMax));
    }

    // 固定节拍驱动模拟时钟前进并按当前状态刷新页面；dispose 时清理。
    // 真实流逝换算保证敌方阶段超时判定在持久会话下持续生效，不依赖外部
    // 手动 advance（与一次性冒烟 runCardBattleSmoke 的手动驱动对齐）。
    // 墙钟回拨时增量收敛为 0（负增量不推进模拟时钟，保持时间单调）。
    const driveHandle = drive(() => {
        const current = now();
        card.clock.advance(Math.max(0, current - lastTick));
        lastTick = current;
        render();
    });

    render();

    return {
        render,
        dispose: () => {
            driveHandle.dispose();
            renderer.dispose();
        },
    };
}
