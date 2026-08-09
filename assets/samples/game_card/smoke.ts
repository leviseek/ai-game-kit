import {
    createCardFixture,
    toViewModelNode,
} from "./assembly";
import {
    createCardBattleBindings,
    createCardBattleViewModel,
} from "./view/view";
import { createViewModelRenderer, type ViewModelNode } from "../../framework";

/**
 * 卡牌对战冒烟的宿主接缝：boot 侧 UiHost 的结构性子集（运行时值传入，samples 不
 * import boot）。nodeResolver 为可选的真实 fgui 渲染接缝：boot 注入
 * createFairyGuiViewHandle，把页面根组件包装成 ViewModelNode 解析器，使冒烟渲染
 * 落到真实 BattleView 节点（验证 BattleView.xml 与 viewModel 节点名对齐）。
 */
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
    nodeResolver?: (view: unknown) => (name: string) => ViewModelNode | undefined;
}

/** 冒烟运行选项：真实 fgui 渲染接缝由 boot 侧注入（host 缺省无此能力时经此传入）。 */
export interface CardBattleSmokeOptions {
    readonly nodeResolver?: (view: unknown) => (name: string) => ViewModelNode | undefined;
}

/**
 * 卡牌对战真实可玩冒烟：装配 game_card 夹具 + ViewModel 渲染器，驱动完整对局
 * ——出牌/结束回合/敌攻/胜负/重开。每步经 console 输出 `[card-battle]` 标记，
 * 由 headless Chrome + CDP 采集验证。视图节点解析器优先取 nodeResolver（boot
 * 注入的真实 fgui 路径，渲染落到真实 BattleView 节点）；无接缝时回退夹具内存
 * 记录型节点（样本层不 import fgui 适配器）。页面打开/关闭与 package 加载经
 * 注入的宿主接缝执行。
 */
export async function runCardBattleSmoke(
    host: CardBattleSmokeHost,
    ensureSharedDependencies: () => Promise<void>,
    options: CardBattleSmokeOptions = {},
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
        resName: "CardBattleView",
    });
    if (page.disposed || page.view === undefined) {
        report("battle-open", false, String(page.error ?? "no view"));
        return;
    }
    adapter.mount(page);
    report("battle-open", true);

    // 4. 驱动游戏层完整对局：渲染器写视图节点，命令绑定接入战斗操作
    const fixture = createCardFixture();
    await fixture.start();

    // 真实 fgui 渲染接缝优先：boot 注入 nodeResolver 把页面根组件包装成节点
    // 解析器，渲染落到真实 BattleView 节点（覆盖 XML↔viewModel 节点名对齐）；
    // 无接缝时回退夹具内存记录型节点（测试/无 fgui 环境）。
    const resolver = options.nodeResolver ?? host.nodeResolver;
    const node: (name: string) => ViewModelNode | undefined =
        resolver === undefined
            ? (name: string): ViewModelNode => toViewModelNode(fixture.viewModel.node(name))
            : resolver(page.view);

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
