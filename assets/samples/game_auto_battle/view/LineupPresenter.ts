import type { IViewModelNode } from "../../../framework";
import type { IFairyGuiListHandle } from "../../../framework";
import { createViewModelRenderer, GameClock } from "../../../framework";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { GameSessionNavigator } from "../../../game/lobby/presenter";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import { AUTO_BATTLE_BATTLE_ENTRY } from "../../../game/lobby/catalog";
import type { AutoBattleFixture } from "../assembly";
import { createLineupEditorBindings, createLineupEditorViewModel, type LineupCandidateView, type LineupEditorViewModel } from "./lineup";
import { clampPresentationElapsed, createAutoBattlePresenter } from "./presenter";
import { createIdleRewardsPresenter } from "./IdleRewardsPresenter";
import { AUTO_BATTLE_IDLE_REWARDS_ENTRY } from "../../../game/lobby/catalog";
import { createPixelHudAnimator } from "./PixelHudAnimator";
import { LINEUP_SCANLINES_NODE } from "./UiNodes";

/**
 * 编队页呈现器：把玩家编队（fixture.lineup）+ 候选英雄区渲染到
 * LineupEditorView 节点。候选 = 英雄池中非敌方阵容的英雄（玩家可上阵，敌方
 * 固定阵容不可选）；候选区为 GList 虚拟列表，经注入的 list 解析器装配句柄在
 * render 时 setItems 驱动，点击候选经列表点击回调接线编辑编队并持久化（fixture
 * 内触发）。布阵区/开始按钮仍走预置绑定。startBattle 经会话导航切换到战场页
 * 并装配战场呈现器。dispose 清理 HUD 动画定时器、动画器与渲染器。
 */
export function createLineupEditorPresenter(
    fixture: GameFixture,
    node: (name: string) => IViewModelNode | undefined,
    session?: GameSessionNavigator,
    list?: (name: string) => IFairyGuiListHandle<unknown> | undefined,
): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;
    const gameClock = new GameClock();
    const hudAnimator = createPixelHudAnimator({
        timeSource: gameClock,
        node,
        scanlineNode: LINEUP_SCANLINES_NODE,
    });
    let lastWallTime = Date.now();
    const hudTimer = setInterval(() => {
        const wallNow = Date.now();
        gameClock.advance(clampPresentationElapsed(wallNow - lastWallTime));
        lastWallTime = wallNow;
        hudAnimator.step();
    }, 100);

    // 候选英雄 GList 句柄：编队页候选区为虚拟列表，presenter 在 render 时
    // setItems 驱动；节点不存在（内存测试/非真实页面）时退化，候选不渲染
    const candidateList = list?.("candidate_list") as IFairyGuiListHandle<LineupCandidateView> | undefined;
    if (candidateList !== undefined) {
        candidateList.setItemRenderer((view) => {
            view.field("txt_candidate_name")?.setText(view.item.heroName);
            view.field("mark_deployed")?.setVisible(view.item.deployed);
        });
        candidateList.setItemClick((_index, candidate) => {
            autoBattle.lineup.selectHero(candidate.heroId);
            render();
        });
    }

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
                    void session.openEntry(AUTO_BATTLE_BATTLE_ENTRY, createAutoBattlePresenter);
                }
            },
            openIdleRewards: () => {
                // 打开挂机收益页：会话内切页并装配挂机呈现器
                if (session !== undefined) {
                    void session.openEntry(AUTO_BATTLE_IDLE_REWARDS_ENTRY, createIdleRewardsPresenter);
                }
            },
        }),
    });

    function render(): void {
        const enemyIds = new Set(autoBattle.config.enemy.map((unit) => unit.id));
        const candidates = autoBattle.config.heroes.filter((hero) => !enemyIds.has(hero.id));
        // VM 派生候选数据（含 deployed 上阵态）供列表句柄消费，避免重复派生
        const vm = createLineupEditorViewModel(candidates, autoBattle.lineup.value, autoBattle.lineup.selectedSlot);
        renderer.setViewModel(vm);
        if (candidateList !== undefined) {
            candidateList.setItems(vm.candidates);
            // 内容变化需重绘 deployed 标记：候选长度常不变（点击仅翻转单项状态），
            // 长度相同时 numItems setter 可能短路，显式 refresh 保证 itemRenderer 重跑
            candidateList.refresh();
        }
    }

    render();

    return {
        render,
        dispose: () => {
            clearInterval(hudTimer);
            hudAnimator.dispose();
            renderer.dispose();
        },
    };
}
