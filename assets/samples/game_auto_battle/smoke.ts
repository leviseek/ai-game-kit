import {
    createAutoBattleFixture,
    toViewModelNode,
} from "./assembly";
import {
    createAutoBattleBindings,
    createAutoBattleViewModel,
    formatAutoBattleEvent,
} from "./view/view";
import { createViewModelRenderer, type ViewModelNode } from "../../framework";

/**
 * 自动战斗冒烟的宿主接缝：boot 侧 UiHost 的结构性子集（运行时值传入，
 * samples 不 import boot）。nodeResolver 为可选的真实 fgui 渲染接缝：boot
 * 注入 createFairyGuiViewHandle，把页面根组件包装成 ViewModelNode 解析器，
 * 使冒烟渲染落到真实 BattleView 节点（验证 BattleView.xml 与 viewModel 节点
 * 名对齐）。
 */
export interface AutoBattleSmokeHost {
    loadPackage(bundle: string, path: string): Promise<{ readonly state: string }>;
    readonly pageAdapter:
        | {
              createPage(
                  route: string,
                  layer: string,
                  opts: { packageName: string; resName: string },
              ): {
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

/** 冒烟运行选项：真实 fgui 渲染接缝由 boot 侧注入，规模配置可选覆盖。 */
export interface AutoBattleSmokeOptions {
    readonly nodeResolver?: (view: unknown) => (name: string) => ViewModelNode | undefined;
    /** 单侧规模（NvN，1..MAX_TEAM_SIZE）：缺省 3v3，注入 6v6 验证规模上限渲染。 */
    readonly scale?: number;
}

/** 按单侧规模生成对称 NvN 配置：属性对齐缺省配置口径，保证冒烟自然终局。 */
function scaleConfigContent(scale: number): Record<string, unknown> {
    const team = (prefix: string): Record<string, unknown>[] =>
        Array.from({ length: scale }, (_, index) => ({
            id: `${prefix}${index}`,
            name: `${prefix}${index}`,
            position: "front",
            maxHp: 60,
            attack: 6,
            speed: 8,
            energyMax: 20,
            skill: {
                id: `${prefix}${index}-skill`,
                name: "重击",
                kind: "damage",
                value: 12,
                energyCost: 20,
            },
        }));
    const ally = team("a");
    const enemy = team("e");
    return {
        heroes: [...ally, ...enemy],
        lineups: {
            ally: ally.map((entry) => entry.id),
            enemy: enemy.map((entry) => entry.id),
        },
        energyGainAttacker: 10,
        energyGainTarget: 5,
    };
}

/**
 * 自动战斗真实可玩冒烟：装配 game_auto_battle 夹具 + ViewModel 渲染器，驱动
 * 完整对局到终局——多单位按速度自动行动、能量满自动放技能、胜负判定、重开。
 * 每步经 console 输出 `[auto-battle]` 标记，由 headless Chrome + CDP 采集验证。
 * 视图节点解析器优先取 nodeResolver（boot 注入的真实 fgui 路径）；无接缝时
 * 回退夹具内存记录型节点（样本层不 import fgui 适配器）。
 */
export async function runAutoBattleSmoke(
    host: AutoBattleSmokeHost,
    ensureSharedDependencies: () => Promise<void>,
    options: AutoBattleSmokeOptions = {},
): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
        console.log(
            `[auto-battle] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`,
        );
    };

    // 1. UI 根与页面适配器初始化
    const ready = host.smokeUiInit();
    report("ui-root-init", ready);
    if (!ready) {
        return;
    }

    // 2. 加载 AutoBattle package；该包跨包引用 Common，先确保依赖已注册
    let packageLoaded = false;
    try {
        await ensureSharedDependencies();
        const handle = await host.loadPackage("ui", "AutoBattle/AutoBattle");
        packageLoaded = handle.state === "ready";
        report("package-load", packageLoaded, String(handle.state));
    } catch (error) {
        report(
            "package-load",
            false,
            error instanceof Error ? error.message : String(error),
        );
        return;
    }
    const adapter = host.pageAdapter;
    if (!packageLoaded || adapter === undefined) {
        report("battle-open", false, "package not loaded or adapter missing");
        return;
    }

    // 3. 打开 BattleView 页面
    const page = adapter.createPage("auto_battle/battle", "normal", {
        packageName: "AutoBattle",
        resName: "AutoBattleView",
    });
    if (page.disposed || page.view === undefined) {
        report("battle-open", false, String(page.error ?? "no view"));
        return;
    }
    adapter.mount(page);
    report("battle-open", true);

    // 4. 驱动游戏层完整对局：渲染器写视图节点，命令绑定接入重开
    //    规模配置按选项注入：缺省 3v3，注入 6v6 验证规模上限渲染与槽位显隐
    const fixture = createAutoBattleFixture(
        options.scale !== undefined && options.scale !== 3
            ? { configContent: scaleConfigContent(options.scale) }
            : {},
    );
    await fixture.start();

    const resolver = options.nodeResolver ?? host.nodeResolver;
    const node: (name: string) => ViewModelNode | undefined =
        resolver === undefined
            ? (name: string): ViewModelNode =>
                  toViewModelNode(fixture.viewModel.node(name))
            : resolver(page.view);

    const renderer = createViewModelRenderer({
        node,
        bindings: createAutoBattleBindings({
            restart: () => {
                fixture.battle.restart();
            },
            cycleSpeed: () => {
                fixture.cycleSpeed();
            },
        }),
    });

    const render = (): void => {
        const state = fixture.battle.state;
        const nameOf = (id: string): string =>
            state.units.find((unit) => unit.id === id)?.name ?? id;
        const log = fixture.battle.events.map((event) =>
            formatAutoBattleEvent(event, nameOf),
        );
        renderer.setViewModel(
            createAutoBattleViewModel(state, log, fixture.speed),
        );
    };

    render();
    report(
        "render-initial",
        true,
        `round=${fixture.battle.state.round} units=${fixture.battle.state.units.length}`,
    );

    // 完整对局：手动 tick 驱动到终局（确定性），护栏防止配置失衡死循环
    let guard = 0;
    while (fixture.battle.state.phase === "fighting" && guard < 1000) {
        fixture.battle.tick();
        guard += 1;
        render();
    }
    const endState = fixture.battle.state;
    report(
        "battle-end",
        endState.phase === "over",
        `round=${endState.round} result=${endState.result ?? "none"}`,
    );

    // 挡位切换：cycleSpeed 循环到 2x 并同步时钟倍率，状态文本随 VM 刷新。
    // 经夹具内存渲染器显式刷新，保证真实 fgui 与回退路径都能断言状态文本。
    const firstResult = endState.result;
    fixture.cycleSpeed();
    fixture.viewModel.render();
    const speedNode = fixture.viewModel.node("txt_speed").text;
    report(
        "speed-cycle",
        fixture.speed === 2 && speedNode === "x2",
        `speed=${fixture.speed} txt=${speedNode ?? "none"}`,
    );

    // 重开重置
    fixture.battle.restart();
    render();
    const restartState = fixture.battle.state;
    report(
        "restart",
        restartState.round === 1 &&
            restartState.units.every(
                (unit) => unit.hp === unit.maxHp && unit.energy === 0,
            ),
        `round=${restartState.round}`,
    );

    // 切换挡位后重开驱动到终局：结果与首次终局一致（挡位不改变战斗结果）
    let rerunGuard = 0;
    while (fixture.battle.state.phase === "fighting" && rerunGuard < 1000) {
        fixture.battle.tick();
        rerunGuard += 1;
    }
    const rerunState = fixture.battle.state;
    report(
        "speed-result-unchanged",
        rerunState.phase === "over" && rerunState.result === firstResult,
        `speed=${fixture.speed} result=${rerunState.result ?? "none"}`,
    );

    await fixture.dispose();
    renderer.dispose();

    // 5. 释放：关闭页面、释放作用域
    adapter.destroy(page);
    host.release();

    console.log("[auto-battle] complete");
}
