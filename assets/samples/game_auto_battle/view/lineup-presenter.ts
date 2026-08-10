import type { ViewModelNode } from "../../../framework";
import { createViewModelRenderer } from "../../../framework";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { GameSessionNavigator } from "../../../game/lobby/presenter";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import { AUTO_BATTLE_BATTLE_ENTRY } from "../../../game/lobby/catalog";
import type { AutoBattleFixture } from "../assembly";
import {
    createLineupEditorBindings,
    createLineupEditorViewModel,
    type LineupEditorViewModel,
} from "./lineup";
import { createAutoBattlePresenter } from "./presenter";

/**
 * 编队页呈现器：把玩家编队（fixture.lineup）+ 候选英雄区渲染到
 * LineupEditorView 节点。候选 = 英雄池中非敌方阵容的英雄（玩家可上阵，敌方
 * 固定阵容不可选）；点击选择（D3）经命令接线编辑编队并持久化（fixture 内触发）。
 * startBattle 经会话导航切换到战场页并装配战场呈现器。dispose 清理渲染器。
 */
export function createLineupEditorPresenter(
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
    session?: GameSessionNavigator,
): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;

    const renderer = createViewModelRenderer<LineupEditorViewModel>({
        node,
        bindings: createLineupEditorBindings({
            selectSlot: (slot) => {
                autoBattle.lineup.selectSlot(slot);
                render();
            },
            selectHero: (heroId) => {
                autoBattle.lineup.selectHero(heroId);
                render();
            },
            removeFromSlot: (slot) => {
                autoBattle.lineup.removeFromSlot(slot);
                render();
            },
            startBattle: () => {
                // 开战由当前编队实例化；随后切到战场页并装配战场呈现器
                autoBattle.lineup.startBattle();
                if (session !== undefined) {
                    void session.openEntry(
                        AUTO_BATTLE_BATTLE_ENTRY,
                        createAutoBattlePresenter,
                    );
                }
            },
        }),
    });

    function render(): void {
        const enemyIds = new Set(autoBattle.config.enemy.map((unit) => unit.id));
        const candidates = autoBattle.config.heroes.filter(
            (hero) => !enemyIds.has(hero.id),
        );
        renderer.setViewModel(
            createLineupEditorViewModel(
                candidates,
                autoBattle.lineup.value,
                autoBattle.lineup.selectedSlot,
            ),
        );
    }

    render();

    return {
        render,
        dispose: () => {
            renderer.dispose();
        },
    };
}
