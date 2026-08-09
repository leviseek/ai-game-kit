import {
    createCardFixture,
    type CardBattleViewNode,
} from "./assembly";
import {
    createCardBattleBindings,
    createCardBattleViewModel,
} from "./view/view";
import { createViewModelRenderer, type ViewModelNode } from "../../framework";

/** 卡牌对战冒烟的宿主接缝：boot 侧 UiHost 的结构性子集（运行时值传入，samples 不 import boot）。 */
export interface CardBattleSmokeHost {
    loadPackage(bundle: string, path: string): Promise<{ readonly state: string }>;
    readonly pageAdapter:
        | {
              createPage(route: string, layer: string, opts: { packageName: string; resName: string }): {
                  disposed: boolean;
                  view: unknown;
                  error?: unknown;
              };
              mount(page: unknown): void;
              destroy(page: unknown): void;
          }
        | undefined;
    smokeUiInit(): boolean;
    release(): void;
}

/**
 * 卡牌对战真实可玩冒烟：装配 game_card 夹具 + ViewModel 渲染器，驱动完整对局
 * ——出牌/结束回合/敌攻/胜负/重开。每步经 console 输出 `[card-battle]` 标记，
 * 由 headless Chrome + CDP 采集验证。视图节点解析器取用夹具内存记录型
 * viewModel（样本层不 import fgui 适配器，渲染目标与真实页面同名节点一致），
 * 页面打开/关闭与 package 加载经注入的宿主接缝执行。
 */
export async function runCardBattleSmoke(
    host: CardBattleSmokeHost,
    ensureSharedDependencies: () => Promise<void>,
): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
        console.log(`[card-battle] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`);
    };

    // 1. UI 根与页面适配器初始化
    const ready = host.smokeUiInit();
    report("ui-root-init", ready);
    if (!ready) {
        return;
    }

    // 2. 加载 CardGame package（assets/ui/CardGame/CardGame.bin → bundle "ui"）；
    //    该包跨包引用 Common，先确保依赖已注册，使按钮组件可解析
    let packageLoaded = false;
    try {
        await ensureSharedDependencies();
        const handle = await host.loadPackage("ui", "CardGame/CardGame");
        packageLoaded = handle.state === "ready";
        report("package-load", packageLoaded, String(handle.state));
    } catch (error) {
        report("package-load", false, error instanceof Error ? error.message : String(error));
        return;
    }
    const adapter = host.pageAdapter;
    if (!packageLoaded || adapter === undefined) {
        report("battle-open", false, "package not loaded or adapter missing");
        return;
    }

    // 3. 打开 BattleView 页面
    const page = adapter.createPage("card/battle", "normal", {
        packageName: "CardGame",
        resName: "BattleView",
    });
    if (page.disposed || page.view === undefined) {
        report("battle-open", false, String(page.error ?? "no view"));
        return;
    }
    adapter.mount(page);
    report("battle-open", true);

    // 4. 驱动游戏层完整对局：渲染器写夹具内存记录型节点，命令绑定接入战斗操作
    const fixture = createCardFixture();
    await fixture.start();

    // 记录型节点包装为渲染器消费的 ViewModelNode（夹具 viewModel.node 惰性
    // 建录同名节点，多次访问返回同一实例，渲染写入可被重复覆盖）
    const node = (name: string): ViewModelNode => {
        const recording: CardBattleViewNode = fixture.viewModel.node(name);
        return {
            setText: (value: string) => {
                recording.text = value;
            },
            setProgress: (value: number) => {
                recording.progress = value;
            },
            setVisible: (value: boolean) => {
                recording.visible = value;
            },
            onClick: (handler: () => void) => {
                recording.clickHandler = handler;
            },
        };
    };

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

    // 5. 释放：关闭页面、释放作用域
    adapter.destroy(page);
    host.release();

    console.log("[card-battle] complete");
}
