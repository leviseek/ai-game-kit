import type {
    GameFixture,
    Module,
    UiNavigator,
} from "../../framework";
import {
    createGameFixture,
    createUiNavigator,
    createViewModelRenderer,
    type ViewModelNode,
} from "../../framework";
import type { AutoBattleEvent, AutoBattleState, AutoBattleUnit } from "./models";
import {
    createAutoBattleClock,
    createAutoBattleClockModule,
    type AutoBattleClock,
} from "./logic/clock";
import {
    createAutoBattleConfig,
    createAutoBattleConfigModule,
    type AutoBattleConfigHandle,
} from "./logic/config";
import { createAutoBattleSkillsModule } from "./logic/skills";
import { createAutoBattleFormationModule } from "./logic/formation";
import {
    createAutoBattleBattle,
    createAutoBattleBattleModule,
    type AutoBattleBattleHandle,
} from "./logic/battle";
import { createAutoBattleUiModule } from "./view/ui";
import {
    createAutoBattleBindings,
    createAutoBattleViewModel,
    formatAutoBattleEvent,
    type AutoBattleCommands,
    type AutoBattleSpeed,
} from "./view/view";

/** 挡位循环次序：1x → 2x → 3x → 1x（与 presenter 共用同一循环语义）。 */
const SPEED_CYCLE: readonly AutoBattleSpeed[] = [1, 2, 3];

/** 缺省自动战斗配置：3v3 阵列与能量规则在夹具层内建，测试可注入覆盖。 */
const DEFAULT_AUTO_BATTLE_CONFIG_CONTENT: Record<string, unknown> = {
    teams: {
        ally: [
            { id: "ally-tank", name: "坦克", position: "front", maxHp: 60, attack: 6, speed: 8, energyMax: 20, skill: { id: "ally-tank-skill", name: "重击", kind: "damage", value: 12, energyCost: 20 } },
            { id: "ally-mage", name: "法师", position: "mid", maxHp: 45, attack: 11, speed: 7, energyMax: 20, skill: { id: "ally-mage-skill", name: "火球", kind: "damage", value: 15, energyCost: 20 } },
            { id: "ally-priest", name: "牧师", position: "back", maxHp: 40, attack: 4, speed: 6, energyMax: 20, skill: { id: "ally-priest-skill", name: "治疗", kind: "heal", value: 10, energyCost: 20 } },
        ],
        enemy: [
            { id: "enemy-tank", name: "骷髅", position: "front", maxHp: 60, attack: 6, speed: 8, energyMax: 20, skill: { id: "enemy-tank-skill", name: "爪击", kind: "damage", value: 12, energyCost: 20 } },
            { id: "enemy-mage", name: "巫妖", position: "mid", maxHp: 45, attack: 9, speed: 7, energyMax: 20, skill: { id: "enemy-mage-skill", name: "暗影", kind: "damage", value: 15, energyCost: 20 } },
            { id: "enemy-shaman", name: "萨满", position: "back", maxHp: 40, attack: 4, speed: 6, energyMax: 20, skill: { id: "enemy-shaman-skill", name: "妖术", kind: "damage", value: 8, energyCost: 20 } },
        ],
    },
    energyGainAttacker: 10,
    energyGainTarget: 5,
};

/**
 * 自动战斗组合夹具的注入选项：测试可注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不依赖 cc/fgui。
 */
export interface AutoBattleFixtureOptions {
    /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
    readonly clock?: AutoBattleClock;
    /** 配置内容：驱动单位/技能/能量规则；缺省为内建缺省配置。 */
    readonly configContent?: Record<string, unknown>;
    /** 事件回调：战斗事件广播接缝（测试据此断言回放顺序）。 */
    readonly onEvent?: (event: AutoBattleEvent) => void;
}

/** 内存记录型视图节点：记录 setter 与点击回调，供测试断言 VM 渲染。 */
export interface AutoBattleViewNode {
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
export function toViewModelNode(recording: AutoBattleViewNode): ViewModelNode {
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

/** 自动战斗组合夹具：在 GameFixture 生命周期接缝之上暴露各能力钩子。 */
export interface AutoBattleFixture extends GameFixture {
    /** 战斗控制器：tick 单行动推进，事件保序回放，restart 重开。 */
    readonly battle: {
        readonly state: AutoBattleState;
        tick(): void;
        restart(): void;
        readonly events: readonly AutoBattleEvent[];
    };
    /** 可控模拟时钟：now() 供事件时间戳，advance 供呈现器推进。 */
    readonly clock: AutoBattleClock;
    /** 配置驱动数值：双方单位清单来自不可变配置表。 */
    readonly config: {
        readonly ally: readonly AutoBattleUnit[];
        readonly enemy: readonly AutoBattleUnit[];
    };
    /** 当前观战加速挡位（1x/2x/3x），只改变驱动节拍。 */
    readonly speed: AutoBattleSpeed;
    /** 循环切换加速挡位并同步模拟时钟倍率。 */
    cycleSpeed(): void;
    /** UI 导航器：route 打开/关闭。 */
    readonly navigator: UiNavigator;
    /**
     * 战场页 ViewModel 渲染：暴露内存记录型视图节点，供测试断言 VM 反映
     * 战斗状态（真实页面经 Cocos 冒烟装配 fgui 接缝）。
     */
    readonly viewModel: {
        readonly node: (name: string) => AutoBattleViewNode;
        render(): void;
    };
}

/**
 * 自动战斗组合夹具装配：显式声明模块清单，构造统一生命周期接缝，并把各
 * 能力钩子暴露给测试驱动。可控时钟、配置、战斗、技能、阵列、UI 六类能力
 * 协作；技能/阵列为纯函数模块只登记装配关系。
 */
export function createAutoBattleFixture(
    options: AutoBattleFixtureOptions = {},
): AutoBattleFixture {
    const clock = options.clock ?? createAutoBattleClock();
    const config: AutoBattleConfigHandle = createAutoBattleConfig(
        options.configContent ?? DEFAULT_AUTO_BATTLE_CONFIG_CONTENT,
    );
    const battle: AutoBattleBattleHandle = createAutoBattleBattle({
        clock,
        config,
        onEvent: (event) => {
            options.onEvent?.(event);
        },
    });
    const navigator: UiNavigator = createUiNavigator();

    // 观战加速挡位：夹具持当前挡位并联动时钟倍率，测试经 cycleSpeed 驱动
    let speed: AutoBattleSpeed = 1;
    const cycleSpeed = (): void => {
        const nextIndex = (SPEED_CYCLE.indexOf(speed) + 1) % SPEED_CYCLE.length;
        speed = SPEED_CYCLE[nextIndex] as AutoBattleSpeed;
        clock.setTimeScale(speed);
    };

    const modules: Module[] = [
        createAutoBattleClockModule(clock),
        createAutoBattleConfigModule(config),
        createAutoBattleBattleModule(battle),
        createAutoBattleSkillsModule(),
        createAutoBattleFormationModule(),
        createAutoBattleUiModule(navigator),
    ];

    const base = createGameFixture({
        id: "auto_battle",
        modules,
    });

    // 战场页 ViewModel：内存记录型视图节点（测试环境无 fgui），绑定声明把
    // VM 映射到节点；render() 按当前战斗状态与事件日志派生 VM 并全量刷新。
    const viewNodes = new Map<string, AutoBattleViewNode>();
    // 惰性登记记录型节点：首次访问创建，renderer 与查询共用
    const ensureViewNode = (name: string): AutoBattleViewNode => {
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
        node: (name: string) => toViewModelNode(ensureViewNode(name)),
        bindings: createAutoBattleBindings({
            restart: () => {
                battle.restart();
            },
            cycleSpeed: () => {
                cycleSpeed();
            },
        } satisfies AutoBattleCommands),
    });

    let disposed = false;

    return {
        ...base,
        battle: {
            get state() {
                return battle.state;
            },
            tick: () => battle.tick(),
            restart: () => battle.restart(),
            get events() {
                return battle.events;
            },
        },
        clock,
        config: {
            ally: config.ally,
            enemy: config.enemy,
        },
        get speed(): AutoBattleSpeed {
            return speed;
        },
        cycleSpeed,
        navigator,
        viewModel: {
            node: ensureViewNode,
            render: () => {
                // 按当前战斗状态派生 VM，事件日志经单位名解析后格式化
                const state = battle.state;
                const nameOf = (id: string): string =>
                    state.units.find((unit) => unit.id === id)?.name ?? id;
                const log = battle.events.map((event) =>
                    formatAutoBattleEvent(event, nameOf),
                );
                viewModelRenderer.setViewModel(
                    createAutoBattleViewModel(state, log, speed),
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
            navigator.dispose();
            battle.dispose();
            await base.dispose();
        },
    };
}
