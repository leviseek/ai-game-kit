import type { ViewModelNode } from "../../framework";
import { createViewModelRenderer } from "../../framework";
import type { GameFixture } from "../fixture/GameFixture";
import type { CardFixture } from "../../game_card/assembly";
import {
    createCardBattleBindings,
    createCardBattleViewModel,
    type CardBattleCommands,
} from "../../game_card/view/view";

/**
 * 品类呈现器：把夹具状态渲染到真实页面节点。引擎无关——消费 ViewModelNode
 * 契约，不依赖 fgui/cc；节点解析器（FairyGuiViewHandle）由宿主注入。
 */
export interface GamePresenter {
    render(): void;
    dispose(): void;
}

/** 呈现器工厂：按品类装配 ViewModelRenderer 到注入的节点解析器。 */
export type GamePresenterFactory = (
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
) => GamePresenter;

/**
 * 卡牌战场呈现器：把 card 夹具回合状态绑定到 BattleView 节点。命令点击
 * 联动出牌/回合/重开并立即重渲染；敌方阶段经可控时钟按真实流逝推进，
 * 使对局在持久会话下随时间真实进行。dispose 清理渲染器与时钟驱动。
 */
export function createCardBattlePresenter(
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
): GamePresenter {
    const card = fixture as CardFixture;

    // 敌方 HP 上限取初始状态（对局中途不变），供进度条归一化
    const enemyHpMax = card.battle.state.enemyHp;

    let lastTick = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;

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
        renderer.setViewModel(
            createCardBattleViewModel(card.battle.state, enemyHpMax),
        );
    }

    // 固定节拍驱动模拟时钟前进并按当前状态刷新页面；dispose 时清理。
    // 真实流逝换算保证敌方阶段超时判定在持久会话下持续生效，不依赖外部
    // 手动 advance（与一次性冒烟 runCardBattleSmoke 的手动驱动对齐）
    timer = setInterval(() => {
        const now = Date.now();
        card.clock.advance(now - lastTick);
        lastTick = now;
        render();
    }, 100);

    render();

    return {
        render,
        dispose: () => {
            if (timer !== undefined) {
                clearInterval(timer);
                timer = undefined;
            }
            renderer.dispose();
        },
    };
}

/** 品类呈现器登记表：id → 呈现器工厂，显式清单、与夹具注册表对齐。 */
export const gamePresenterRegistry: Readonly<
    Record<string, GamePresenterFactory>
> = Object.freeze({
    card: createCardBattlePresenter,
});
