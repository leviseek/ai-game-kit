import type {
    InputSample,
    InputSource,
    Module,
    UiNavigator,
} from "../../framework";
import { createInputMapper, createUiNavigator } from "../../framework";
import {
    createGameFixture,
    type GameFixture,
} from "../../game/fixture/GameFixture";
import type { CardAction, CardConfig, CardTurnPhase } from "./models";
import {
    createCardBattle,
    createCardBattleModule,
    type CardBattleHandle,
} from "./logic/battle";
import {
    createCardClockModule,
    createCardSimClock,
    type CardSimClock,
} from "./logic/clock";
import {
    createCardConfig,
    createCardConfigModule,
    type CardConfigHandle,
} from "./logic/config";
import {
    createCardInputModule,
    createCardInputSource,
} from "./logic/input";
import { createCardUiModule } from "./view/ui";
import {
    createCardBattleBindings,
    createCardBattleViewModel,
    type CardBattleCommands,
} from "./view/view";
import { createViewModelRenderer, type ViewModelNode } from "../../framework";

/** 缺省卡牌配置：回合时长与卡牌数值在夹具层内建，测试可注入覆盖。 */
const DEFAULT_CARD_CONFIG_CONTENT: Record<string, unknown> = {
    cards: [
        { id: "card-0", name: "Slash", cost: 1, damage: 2 },
        { id: "card-1", name: "Fireball", cost: 2, damage: 4 },
        { id: "card-2", name: "Block", cost: 0, damage: 0 },
    ],
    turnDurationMs: 1000,
    playerHp: 10,
    enemyHp: 8,
    startMana: 3,
    enemyAttackIntervalMs: 500,
    enemyDamage: 2,
};

/**
 * 卡牌组合夹具的注入选项：测试可注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不依赖 cc/fgui。
 */
export interface CardFixtureOptions {
    /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
    readonly clock?: CardSimClock;
    /** 配置内容：驱动卡牌数值与回合时长；缺省为内建缺省配置。 */
    readonly configContent?: Record<string, unknown>;
    /** 底层输入源：缺省为可控输入源（测试经 fixture.input.push 注入事件）。 */
    readonly inputSource?: InputSource;
}

/** 卡牌组合夹具：在 GameFixture 生命周期接缝之上暴露各能力钩子。 */
export interface CardFixture extends GameFixture {
    /** 回合流状态机：读取 phase 与出牌结果，驱动确定性回合。 */
    readonly battle: {
        readonly state: {
            readonly turn: number;
            readonly phase: CardTurnPhase;
            readonly playerHp: number;
            readonly enemyHp: number;
            readonly mana: number;
            readonly hand: readonly CardConfig[];
            readonly result: "win" | "lose" | undefined;
        };
        playCard(index: number): boolean;
        endTurn(): boolean;
        /** 重置对局到初始状态（重开按钮命令）。 */
        restart(): void;
    };
    /** 可控模拟时钟：推进回合，结果与真实时钟无关。 */
    readonly clock: {
        now(): number;
        advance(milliseconds: number): void;
    };
    /** UI 导航器：route 打开/关闭。 */
    readonly navigator: UiNavigator;
    /** 输入上下文：切换激活上下文并路由类型化 action 采样，联动出牌。 */
    readonly input: {
        readonly activeContext: string;
        setActiveContext(context: string): void;
        push(sourceId: string, pressed: boolean, value?: number): void;
        readonly samples: readonly InputSample<CardAction>[];
    };
    /** 配置驱动数值：卡牌与回合时长来自不可变配置表。 */
    readonly config: {
        readonly cards: readonly CardConfig[];
        readonly turnDurationMs: number;
    };
    /**
     * 战场页 ViewModel 渲染：暴露内存记录型视图节点，供测试断言 VM 反映
     * 战斗状态（真实页面经 Cocos 冒烟装配 fgui 接缝）。
     */
    readonly viewModel: {
        readonly node: (name: string) => CardBattleViewNode;
        /** 按当前战斗状态渲染 VM 到记录型节点。 */
        render(): void;
    };
}

/**
 * 卡牌组合夹具装配：显式声明模块清单，构造统一生命周期接缝，并把各能力
 * 钩子暴露给测试驱动。组合逻辑留在游戏层夹具内，AppRoot 只做薄转发
 * （design decision 3/4）。可控时间、回合流、配置、输入、UI 五类能力协作。
 */

/** 内存记录型视图节点：记录 setter 与点击回调，供测试断言 VM 渲染。 */
export interface CardBattleViewNode {
    text: string | undefined;
    progress: number | undefined;
    visible: boolean | undefined;
    clickHandler: (() => void) | undefined;
}

/**
 * 把记录转换为渲染器消费的 ViewModelNode 实现，并附加 recording 引用：
 * 测试经 clickHandler 触发命令绑定回调（渲染器 onClick 时写入）。
 * 导出供冒烟回退路径复用，避免节点契约在装配与冒烟间漂移。
 */
export function toViewModelNode(recording: CardBattleViewNode): ViewModelNode {
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
}

export function createCardFixture(
    options: CardFixtureOptions = {},
): CardFixture {
    const clock = options.clock ?? createCardSimClock();
    const config: CardConfigHandle = createCardConfig(
        options.configContent ?? DEFAULT_CARD_CONFIG_CONTENT,
    );
    const battle: CardBattleHandle = createCardBattle(clock, config);
    const navigator: UiNavigator = createUiNavigator();

    // 输入：可控源 + InputMapper，push 注入事件，samples 记录采样；
    // onSample 按 action 联动出牌（play-card-* → playCard、end-turn → endTurn）
    const inputHandle = createCardInputSource();
    const samples: InputSample<CardAction>[] = [];
    const inputMapper = createInputMapper<CardAction>({
        timeSource: clock,
        activeContext: "gameplay",
        mappings: {
            gameplay: {
                "keyboard.1": "play-card-0",
                "keyboard.2": "play-card-1",
                "keyboard.3": "play-card-2",
                "keyboard.enter": "end-turn",
            },
            ui: {},
        },
        source: options.inputSource ?? inputHandle.source,
        onSample: (sample) => {
            samples.push(sample);

            // 只有按下事件联动出牌，释放事件只记录采样
            if (!sample.pressed) {
                return;
            }

            if (sample.action === "end-turn") {
                battle.endTurn();
            } else if (sample.action.startsWith("play-card-")) {
                const index = Number(sample.action.slice("play-card-".length));
                battle.playCard(index);
            }
        },
    });

    const modules: Module[] = [
        createCardClockModule(clock),
        createCardConfigModule(config),
        createCardBattleModule(battle),
        createCardInputModule(inputHandle),
        createCardUiModule(navigator),
    ];

    const base = createGameFixture({
        id: "card",
        modules,
    });

    // 战场页 ViewModel：内存记录型视图节点（测试环境无 fgui），绑定声明把
    // VM 映射到节点；render() 按当前战斗状态派生 VM 并全量刷新。真实页面由
    // Cocos 冒烟经 FairyGuiViewHandle 接缝装配同名节点。
    const viewNodes = new Map<string, CardBattleViewNode>();
    // 惰性登记记录型节点：首次访问创建，renderer 与查询共用
    const ensureViewNode = (name: string): CardBattleViewNode => {
        let recording = viewNodes.get(name);
        if (recording === undefined) {
            recording = {
                text: undefined,
                progress: undefined,
                visible: undefined,
                clickHandler: undefined,
            };
            viewNodes.set(name, recording);
        }
        return recording;
    };
    const viewModelRenderer = createViewModelRenderer({
        // 渲染器消费 ViewModelNode 包装，测试经 viewModel.node 读回 recording
        node: (name: string) => toViewModelNode(ensureViewNode(name)),
        bindings: createCardBattleBindings({
            playCard: (index) => {
                battle.playCard(index);
            },
            endTurn: () => {
                battle.endTurn();
            },
            restart: () => {
                battle.restart();
            },
        } satisfies CardBattleCommands),
    });

    let disposed = false;

    return {
        ...base,
        battle: {
            get state() {
                return battle.state;
            },
            playCard: (index: number) => battle.playCard(index),
            endTurn: () => battle.endTurn(),
            restart: () => battle.restart(),
        },
        clock: {
            now: () => clock.now(),
            advance: (milliseconds: number) => clock.advance(milliseconds),
        },
        navigator,
        input: {
            get activeContext() {
                return inputMapper.activeContext;
            },
            setActiveContext: (context: string) => {
                inputMapper.setActiveContext(context);
            },
            push: (sourceId: string, pressed: boolean, value?: number) => {
                inputHandle.push(sourceId, pressed, value);
            },
            get samples() {
                // 返回快照，避免调用方持有内部数组引用绕过 readonly 约束
                return [...samples];
            },
        },
        config: {
            cards: config.cards,
            turnDurationMs: config.turnDurationMs,
        },
        viewModel: {
            node: ensureViewNode,
            render: () => {
                // 按当前战斗状态派生 VM 并全量刷新记录型节点
                const state = battle.state;
                viewModelRenderer.setViewModel(
                    createCardBattleViewModel(state, config.enemyHp),
                );
            },
        },
        dispose: async () => {
            if (disposed) {
                return;
            }
            disposed = true;
            // 统一释放组合根持有的共享能力：模块 dispose 保持无副作用，
            // 避免 failRollback 探针复用模块实例时提前销毁夹具自身能力
            viewModelRenderer.dispose();
            inputMapper.dispose();
            navigator.dispose();
            battle.dispose();
            await base.dispose();
        },
    };
}
