import type {
    GameFixture,
    Module,
    PlatformStorage,
    UiNavigator,
} from "../../framework";
import {
    createGameFixture,
    createUiNavigator,
    createViewModelRenderer,
    type ViewModelNode,
} from "../../framework";
import type {
    AutoBattleEvent,
    AutoBattleHero,
    AutoBattleLineup,
    AutoBattleState,
    AutoBattleUnit,
} from "./models";
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
import { FORMATION_GRID_SIZE } from "./logic/grid";
import {
    createAutoBattleBattle,
    createAutoBattleBattleModule,
    type AutoBattleBattleHandle,
    type AutoBattlePlacedUnit,
} from "./logic/battle";
import { editLineup } from "./logic/lineup";
import {
    createLineupStore,
    type LineupStore,
} from "./logic/lineup-store";
import { createAutoBattleUiModule } from "./view/ui";
import {
    buildAutoBattleBindings,
    createAutoBattleViewModel,
    formatAutoBattleEvent,
    type AutoBattleCommands,
    type AutoBattleSpeed,
    type AutoBattleViewModel,
} from "./view/view";
import type { LineupEditorCommands } from "./view/lineup";

/** 挡位循环次序：1x → 2x → 3x → 1x（与 presenter 共用同一循环语义）。 */
const SPEED_CYCLE: readonly AutoBattleSpeed[] = [1, 2, 3];

/** 缺省自动战斗配置：3v3 阵列（heroes 池 + lineup）与能量规则在夹具层内建，测试可注入覆盖。 */
const DEFAULT_AUTO_BATTLE_CONFIG_CONTENT: Record<string, unknown> = {
    heroes: [
        { id: "ally-tank", name: "坦克", position: "front", maxHp: 60, attack: 6, speed: 8, energyMax: 20, skill: { id: "ally-tank-skill", name: "重击", kind: "damage", value: 12, energyCost: 20 } },
        { id: "ally-mage", name: "法师", position: "mid", maxHp: 45, attack: 11, speed: 7, energyMax: 20, skill: { id: "ally-mage-skill", name: "火球", kind: "damage", value: 15, energyCost: 20 } },
        { id: "ally-priest", name: "牧师", position: "back", maxHp: 40, attack: 4, speed: 6, energyMax: 20, skill: { id: "ally-priest-skill", name: "治疗", kind: "heal", value: 10, energyCost: 20 } },
        { id: "enemy-tank", name: "骷髅", position: "front", maxHp: 60, attack: 6, speed: 8, energyMax: 20, skill: { id: "enemy-tank-skill", name: "爪击", kind: "damage", value: 12, energyCost: 20 } },
        { id: "enemy-mage", name: "巫妖", position: "mid", maxHp: 45, attack: 9, speed: 7, energyMax: 20, skill: { id: "enemy-mage-skill", name: "暗影", kind: "damage", value: 15, energyCost: 20 } },
        { id: "enemy-shaman", name: "萨满", position: "back", maxHp: 40, attack: 4, speed: 6, energyMax: 20, skill: { id: "enemy-shaman-skill", name: "妖术", kind: "damage", value: 8, energyCost: 20 } },
    ],
    lineups: {
        ally: ["ally-tank", "ally-mage", "ally-priest"],
        enemy: ["enemy-tank", "enemy-mage", "enemy-shaman"],
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
    /** 平台存储后端：缺省为内存存储；观察编队存档写入/读取。 */
    readonly storage?: PlatformStorage;
    /** 事件回调：战斗事件广播接缝（测试据此断言回放顺序）。 */
    readonly onEvent?: (event: AutoBattleEvent) => void;
}

/** 内存记录型视图节点：记录 setter 与点击回调，供测试断言 VM 渲染。 */
export interface AutoBattleViewNode {
    text: string | undefined;
    progress: number | undefined;
    visible: boolean | undefined;
    /** 最近一次坐标写入（position 绑定经 setXY 记录）。 */
    xy: { x: number; y: number } | undefined;
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
        setXY: (x: number, y: number) => {
            recording.xy = { x, y };
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
    /** 配置驱动数值：双方单位清单与英雄池来自不可变配置表。 */
    readonly config: {
        readonly ally: readonly AutoBattleUnit[];
        readonly enemy: readonly AutoBattleUnit[];
        /** 英雄池（编队页候选来源）。 */
        readonly heroes: readonly AutoBattleHero[];
    };
    /** 当前观战加速挡位（1x/2x/3x），只改变驱动节拍。闭包方法而非 getter： */
    /** Cocos 转译 `...base` 展开时经 Object.assign 固化顶层 getter 为 data 值， */
    /** 方法引用不受影响，跨 Bun/Cocos 语义一致。 */
    getSpeed(): AutoBattleSpeed;
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
    /** 编队编辑：玩家可变编队 + 点击选择操作 + 持久化（lineup-store）。 */
    readonly lineup: {
        /** 当前编队快照（定长槽位序列，空槽 null）。 */
        readonly value: AutoBattleLineup;
        /** 当前选中的布阵格；null = 未选中。 */
        readonly selectedSlot: number | null;
        /** 点击布阵格：未选中则选中；已选中则取消选中（null = 取消选中）。 */
        selectSlot(slot: number | null): void;
        /** 点击候选英雄：填入选中的布阵格，否则填入第一个空槽。 */
        selectHero(heroId: string): void;
        /** 卸下指定槽位英雄。 */
        removeFromSlot(slot: number): void;
        /** 以当前编队重开对局（开战由 lineup 实例化，战斗实例化后与编队解耦）。 */
        startBattle(): void;
        /** 编队持久化存储（versioned-storage，schema v1）。 */
        readonly store: LineupStore;
        /** 从存储恢复上次编队（重启后调用）；无存档则保持当前编队。 */
        restoreLineup(): Promise<void>;
    };
}

/** 缺省内存平台存储：实现 PlatformStorage，供测试与非 Cocos 环境使用。 */
class MemoryStorage implements PlatformStorage {
    private readonly entries = new Map<string, string>();

    async get(key: string): Promise<string | null> {
        return this.entries.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        this.entries.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.entries.delete(key);
    }
}

/** 压缩 heroId 序列 → 定长编队（空槽 null）；不足布阵区容量 FORMATION_GRID_SIZE 的部分留空。 */
function toFullLineup(ids: readonly string[]): AutoBattleLineup {
    const slots: (string | null)[] = Array.from(
        { length: FORMATION_GRID_SIZE },
        () => null,
    );
    ids.forEach((heroId, index) => {
        slots[index] = heroId;
    });
    return { slots };
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
    const navigator: UiNavigator = createUiNavigator();

    // 玩家编队：可变状态（定长槽位），初始 = 配置初始编队；经点击命令编辑并持久化
    const lineupStore = createLineupStore({
        storage: options.storage ?? new MemoryStorage(),
    });
    let lineup: AutoBattleLineup = toFullLineup(config.lineups.ally);
    let selectedSlot: number | null = null;

    const battle: AutoBattleBattleHandle = createAutoBattleBattle({
        clock,
        config,
        // 开战编队由当前玩家编队（己方）+ 配置固定敌方阵容派生；己方按真实布阵
        // 格位（slot）输出，敌方压缩序映射到布阵区前段格。战斗实例化后持单位
        // 快照，后续编队改动只影响下一次重开
        lineups: () => ({
            ally: lineup.slots.reduce<AutoBattlePlacedUnit[]>(
                (placed, heroId, slot) =>
                    heroId === null
                        ? placed
                        : placed.concat([{ slot, heroId }]),
                [],
            ),
            enemy: config.lineups.enemy.map((heroId, slot) => ({ slot, heroId })),
        }),
        onEvent: (event) => {
            options.onEvent?.(event);
        },
    });

    const persistLineup = (): void => {
        // 存储写失败不中断交互，经 console.error 报告（对齐框架 SaveCoordinator 缺省语义）
        void lineupStore.save(lineup).catch((error: unknown) => {
            console.error(error);
        });
    };

    const lineupCommands: LineupEditorCommands = {
        selectSlot(slot) {
            selectedSlot = slot;
        },
        selectHero(heroId) {
            // 优先填入选中的布阵格（替换语义），否则填第一个空槽；满编（MAX_TEAM_SIZE）
            // 由 reducer 拒绝，空槽查找仍遍历全部布阵格
            const target =
                selectedSlot !== null && selectedSlot < FORMATION_GRID_SIZE
                    ? selectedSlot
                    : lineup.slots.findIndex((heroIdAt) => heroIdAt === null);
            if (target === -1) {
                return;
            }
            lineup = editLineup(lineup, { type: "fill", slot: target, heroId });
            persistLineup();
        },
        removeFromSlot(slot) {
            lineup = editLineup(lineup, { type: "remove", slot });
            persistLineup();
        },
        startBattle() {
            battle.restart();
        },
    };

    // 观战加速挡位：夹具持当前挡位并联动时钟倍率，测试经 cycleSpeed 驱动。
    // 挡位经 getSpeed() 闭包方法读取而非顶层 getter：Cocos 转译 `...base` 展开
    // 时经 Object.assign 固化顶层 getter 为 data 值，闭包方法引用不受影响。
    let speed: AutoBattleSpeed = clock.timeScale as AutoBattleSpeed;
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
                xy: undefined,
                clickHandler: undefined,
            };
            viewNodes.set(name, recording);
        }
        return recording;
    };
    const autoBattleCommands: AutoBattleCommands = {
        restart: () => {
            battle.restart();
        },
        cycleSpeed: () => {
            cycleSpeed();
        },
    };
    const viewModelRenderer = createViewModelRenderer<AutoBattleViewModel>({
        node: (name: string) => toViewModelNode(ensureViewNode(name)),
        // 绑定集在 render 时按存活单位动态重建（见 render 内的 buildAutoBattleBindings）
        bindings: [],
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
            heroes: config.heroes,
        },
        getSpeed: (): AutoBattleSpeed => speed,
        cycleSpeed,
        navigator,
        viewModel: {
            node: ensureViewNode,
            render: () => {
                // 按当前战斗状态派生 VM，事件日志经单位名解析后格式化；单位绑定
                // 集随存活单位动态重建（静态标量 + 每单位一组动态绑定）
                const state = battle.state;
                const nameOf = (id: string): string =>
                    state.units.find((unit) => unit.id === id)?.name ?? id;
                const log = battle.events.map((event) =>
                    formatAutoBattleEvent(event, nameOf),
                );
                const vm = createAutoBattleViewModel(state, log, speed);
                viewModelRenderer.setBindings(
                    buildAutoBattleBindings(autoBattleCommands, vm),
                );
                viewModelRenderer.setViewModel(vm);
            },
        },
        lineup: {
            get value() {
                return lineup;
            },
            get selectedSlot() {
                return selectedSlot;
            },
            selectSlot: (slot: number) => lineupCommands.selectSlot(slot),
            selectHero: (heroId: string) => lineupCommands.selectHero(heroId),
            removeFromSlot: (slot: number) => lineupCommands.removeFromSlot(slot),
            startBattle: () => lineupCommands.startBattle(),
            store: lineupStore,
            restoreLineup: async () => {
                const loaded = await lineupStore.load();
                if (loaded === null) {
                    return;
                }
                // 恢复前校验非空 heroId 均在英雄池内：损坏/手工构造存档含未知
                // 英雄时拒绝恢复（保留当前编队），避免未知 id 进入编队页
                const heroIds = new Set(config.heroes.map((hero) => hero.id));
                const unknown = loaded.data.slots.find(
                    (heroId) => heroId !== null && !heroIds.has(heroId),
                );
                if (unknown !== undefined) {
                    throw new Error(
                        `auto-battle lineup: restored lineup references unknown hero "${unknown}"`,
                    );
                }
                lineup = loaded.data;
                // 迁移回写：旧版本存档经 load 逐级迁移后立即落盘当前版本，
                // 避免每次重启重复执行迁移链
                void lineupStore.save(lineup).catch((error: unknown) => {
                    console.error(error);
                });
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
