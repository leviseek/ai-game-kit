import type { GameFixture, IModule, IPlatformStorage, UiNavigator } from "../../framework";
import { createGameFixture, createUiNavigator, createViewModelRenderer, type IViewModelNode } from "../../framework";
import { text } from "../../game-content/generated/i18n";
import type {
    AutoBattleBaseAttributes,
    AutoBattleBuff,
    AutoBattleEvent,
    AutoBattleHero,
    AutoBattleLineup,
    AutoBattleSkill,
    AutoBattleSkillCondition,
    AutoBattleSkillEffectDef,
    AutoBattleState,
    AutoBattleUnit,
    AutoBattleUnitAnimation,
} from "./models";
import { createAutoBattleClock, createAutoBattleClockModule, createIdleRewardClock, createIdleRewardClockModule, type AutoBattleClock, type IdleRewardClock } from "./logic/clock";
import { createAutoBattleConfig, createAutoBattleConfigModule, type AutoBattleConfigHandle } from "./logic/config";
import { createAutoBattleSkillsModule } from "./logic/skills";
import { createAutoBattleFormationModule } from "./logic/formation";
import { createAutoBattleMoveModule } from "./logic/move";
import { FORMATION_GRID_SIZE } from "./logic/grid";
import { createAutoBattleBattle, createAutoBattleBattleModule, type AutoBattleBattleHandle, type AutoBattlePlacedUnit } from "./logic/battle";
import { defaultDeploymentSlot, editLineup } from "./logic/lineup";
import { createLineupStore, type LineupStore } from "./logic/LineupStore";
import { computeRate, createAutoBattleIdleRewardsModule, createIdleRewardsHandle, type IdleRateSource, type IdleRewardsHandle } from "./logic/IdleRewards";
import { createIdleRewardsStore, createIdleRewardsStoreModule, type IdleRewardStore } from "./logic/IdleRewardsStore";
import type { IdleOfflineSettlement, IdleRewardState } from "./models";
import { createAutoBattleUiModule } from "./view/ui";
import { buildAutoBattleBindings, createAutoBattleViewModel, formatAutoBattleEvent, gridToXY, type AutoBattleCommands, type AutoBattleSpeed, type AutoBattleViewModel } from "./view/view";
import { createAutoBattleEffectsModule, projectHitFeedbackEvents, type HitFeedbackEffect } from "./view/effects";
import { createEffectAnimator, type AutoBattleEffectAnimator } from "./view/EffectAnimator";
import type { LineupEditorCommands } from "./view/lineup";
import { createDefaultAutoBattleConfigContent } from "./content/autoBattleTables";

/** 挡位循环次序：保留原三档顺序，并在最高档后提供 0.5x 慢速观察。 */
const SPEED_CYCLE: readonly AutoBattleSpeed[] = [1, 2, 3, 0.5];

/**
 * 缺省自动战斗配置：由 7 张配置表（baseAttributes/heroes/unitAnimations/skills/
 * buffs/skillEffects/skillConditions）驱动，数据源为 assets/game-content/auto-battle/
 * JSON（TS 镜像经 createDefaultAutoBattleConfigContent 加载，一致性由测试锁定）。
 */
const DEFAULT_AUTO_BATTLE_CONFIG_CONTENT: Record<string, unknown> = createDefaultAutoBattleConfigContent();

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
    readonly storage?: IPlatformStorage;
    /** 事件回调：战斗事件广播接缝（测试据此断言回放顺序）。 */
    readonly onEvent?: (event: AutoBattleEvent) => void;
    /** 挂机可控墙钟：缺省为内建时钟（从 0 开始，测试经 advance 推进模拟离线时长）。 */
    readonly idleClock?: IdleRewardClock;
    /** 挂机收益速率来源：缺省为固定速率（computeRate 接缝）。 */
    readonly idleRateSource?: IdleRateSource;
}

/** 内存记录型视图节点：记录 setter 与点击回调，供测试断言 VM 渲染。 */
export interface AutoBattleViewNode {
    text: string | undefined;
    progress: number | undefined;
    visible: boolean | undefined;
    /** 最近一次坐标写入（position 绑定经 setXY 记录）。 */
    xy: { x: number; y: number } | undefined;
    /** 最近一次透明度写入（特效动画经 setAlpha 记录）。 */
    alpha: number | undefined;
    /** 最近一次图片 URL 写入（loader 序列帧经 setUrl 记录）。 */
    url: string | undefined;
    clickHandler: (() => void) | undefined;
}

/**
 * 把记录转换为渲染器消费的 IViewModelNode 实现，并附加 recording 引用：
 * 测试经 clickHandler 触发命令绑定回调（渲染器 onClick 时写入）。
 * 导出供冒烟回退路径复用，避免节点契约在装配与冒烟间漂移。
 */
export function toViewModelNode(recording: AutoBattleViewNode): IViewModelNode {
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
        setAlpha: (value: number) => {
            recording.alpha = value;
        },
        setUrl: (value: string) => {
            recording.url = value;
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
        /** 7 张表：基础属性/单位动画/技能/buff/动效/条件（视图层按 id 查表）。 */
        readonly baseAttributes: readonly AutoBattleBaseAttributes[];
        readonly unitAnimations: readonly AutoBattleUnitAnimation[];
        readonly skills: readonly AutoBattleSkill[];
        readonly buffs: readonly AutoBattleBuff[];
        readonly skillEffects: readonly AutoBattleSkillEffectDef[];
        readonly skillConditions: readonly AutoBattleSkillCondition[];
    };
    /** 当前观战速度挡位（0.5x/1x/2x/3x），只改变驱动节拍。闭包方法而非 getter： */
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
    /** 命中反馈特效：投影器增量消费事件 + 动画器驱动节点，供测试断言。 */
    readonly effects: {
        /** 事件→特效投影器纯函数（同构于 view/effects 导出）。 */
        project(events: readonly AutoBattleEvent[]): readonly HitFeedbackEffect[];
        /** 动画器实例（飘字/闪白/抖动），测试断言进行中动画数。 */
        readonly animator: AutoBattleEffectAnimator;
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
    /** 挂机收益：离线收益结算、持久化与恢复。 */
    readonly idleRewards: {
        /** 当前挂机状态快照。 */
        readonly state: IdleRewardState;
        /** 可控墙钟（测试经 advance 推进模拟离线时长）。 */
        readonly clock: IdleRewardClock;
        /** 预计算可领收益（不推进 lastSeenAt，纯展示；与 settleOffline 同一速率）。 */
        preview(): IdleOfflineSettlement;
        /** 按当前墙钟结算离线收益并推进 lastSeenAt（幂等）；返回结算结果。 */
        settleOffline(): IdleOfflineSettlement;
        /** 从存储恢复上次挂机状态（重启后调用）；无存档/损坏则保持初始。 */
        restore(): Promise<void>;
        /** 挂机收益存储（versioned-storage）。 */
        readonly store: IdleRewardStore;
    };
}

/** 缺省内存平台存储：实现 IPlatformStorage，供测试与非 Cocos 环境使用。 */
class MemoryStorage implements IPlatformStorage {
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

/** 压缩 heroId 序列 → 定长编队（空槽 null）；按默认布阵策略（前排贴中线优先，
 *  见 defaultDeploymentSlot）落槽，不足布阵区容量 FORMATION_GRID_SIZE 的部分留空。 */
function toFullLineup(ids: readonly string[]): AutoBattleLineup {
    const slots: (string | null)[] = Array.from({ length: FORMATION_GRID_SIZE }, () => null);
    ids.forEach((heroId, index) => {
        slots[defaultDeploymentSlot("ally", index)] = heroId;
    });
    return { slots };
}

/**
 * 自动战斗组合夹具装配：显式声明模块清单，构造统一生命周期接缝，并把各
 * 能力钩子暴露给测试驱动。可控时钟、配置、战斗、技能、阵列、UI 六类能力
 * 协作；技能/阵列为纯函数模块只登记装配关系。
 */
export function createAutoBattleFixture(options: AutoBattleFixtureOptions = {}): AutoBattleFixture {
    const clock = options.clock ?? createAutoBattleClock();
    const config: AutoBattleConfigHandle = createAutoBattleConfig(options.configContent ?? DEFAULT_AUTO_BATTLE_CONFIG_CONTENT);
    const navigator: UiNavigator = createUiNavigator();

    // 玩家编队：可变状态（定长槽位），初始 = 配置初始编队；经点击命令编辑并持久化
    const lineupStore = createLineupStore({
        storage: options.storage ?? new MemoryStorage(),
    });
    let lineup: AutoBattleLineup = toFullLineup(config.lineups.ally);
    let selectedSlot: number | null = null;

    // 挂机收益：可控墙钟（离线时长基准）+ 入账控制器 + 自持版本化存储。
    // 收益速率缺省走 computeRate(lineup) 接缝（首版固定常量；lineup 非空槽加权
    // 预留），调用方注入 idleRateSource 可覆盖——速率接缝独立于编队读取，编队
    // 读取失败不中断结算（spec：回退默认速率）。
    const idleRewardsClock = options.idleClock ?? createIdleRewardClock();
    const idleRewardsStore = createIdleRewardsStore({
        storage: options.storage ?? new MemoryStorage(),
    });
    const idleRewardsHandle: IdleRewardsHandle = createIdleRewardsHandle({
        clock: idleRewardsClock,
        rateSource: options.idleRateSource ?? (() => computeRate(lineup)),
    });
    const persistIdleRewards = (): void => {
        // 存储写失败不中断交互，经 console.error 报告（对齐 SaveCoordinator 缺省语义）
        void idleRewardsStore.save(idleRewardsHandle.state).catch((error: unknown) => {
            console.error(error);
        });
    };

    const battle: AutoBattleBattleHandle = createAutoBattleBattle({
        clock,
        config,
        // 开战编队由当前玩家编队（己方）+ 配置固定敌方阵容派生；己方按真实布阵
        // 格位（slot）输出，敌方压缩序按默认布阵策略（前排贴中线优先）映射到布阵
        // 区格。战斗实例化后持单位快照，后续编队改动只影响下一次重开
        lineups: () => ({
            ally: lineup.slots.reduce<AutoBattlePlacedUnit[]>((placed, heroId, slot) => (heroId === null ? placed : placed.concat([{ slot, heroId }])), []),
            enemy: config.lineups.enemy.map((heroId, index) => ({ slot: defaultDeploymentSlot("enemy", index), heroId })),
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
            const target = selectedSlot !== null && selectedSlot < FORMATION_GRID_SIZE ? selectedSlot : lineup.slots.findIndex((heroIdAt) => heroIdAt === null);
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
        // 挂机收益页为会话内页面，导航由 presenter 层经 session 触发；
        // 夹具层命令留空占位（fixture 引擎无关，不持有页面导航器）
        openIdleRewards() {},
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

    const modules: IModule[] = [
        createAutoBattleClockModule(clock),
        createAutoBattleConfigModule(config),
        createAutoBattleBattleModule(battle),
        createAutoBattleSkillsModule(),
        createAutoBattleFormationModule(),
        createAutoBattleMoveModule(),
        createAutoBattleEffectsModule(),
        createAutoBattleUiModule(navigator),
        createIdleRewardClockModule(idleRewardsClock),
        createIdleRewardsStoreModule(idleRewardsStore),
        createAutoBattleIdleRewardsModule(idleRewardsHandle),
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
                alpha: undefined,
                url: undefined,
                clickHandler: undefined,
            };
            viewNodes.set(name, recording);
        }
        return recording;
    };
    // 命中反馈动画器：节点解析复用 VM 节点（记录型节点已实现 setAlpha/setXY），
    // 时间源用模拟时钟（测试经 clock.advance 确定性推进动画）；单位绝对坐标由
    // state 按 id 查 gridKey 经 gridToXY 推导，供飘字/抖动归位。
    const effectAnimator = createEffectAnimator({
        node: (name: string) => toViewModelNode(ensureViewNode(name)),
        timeSource: () => clock.now(),
        homeXYOf: (unitId: string) => {
            const unit = battle.state.units.find((candidate) => candidate.id === unitId);
            return unit === undefined ? { x: 0, y: 0 } : gridToXY(unit.gridKey);
        },
        gridXYOf: (gridKey: string) => gridToXY(gridKey),
    });
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
            baseAttributes: config.baseAttributes,
            unitAnimations: config.unitAnimations,
            skills: config.skills,
            buffs: config.buffs,
            skillEffects: config.skillEffects,
            skillConditions: config.skillConditions,
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
                const nameOf = (id: string): string => {
                    const unit = state.units.find((candidate) => candidate.id === id);
                    return unit === undefined ? id : text.getOr(unit.name, unit.name);
                };
                const log = battle.events.map((event) => formatAutoBattleEvent(event, nameOf));
                const vm = createAutoBattleViewModel(state, log, speed);
                viewModelRenderer.setBindings(buildAutoBattleBindings(autoBattleCommands, vm));
                viewModelRenderer.setViewModel(vm);
            },
        },
        effects: {
            project: (events: readonly AutoBattleEvent[]) => projectHitFeedbackEvents(events, -1).effects,
            animator: effectAnimator,
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
                const unknown = loaded.data.slots.find((heroId) => heroId !== null && !heroIds.has(heroId));
                if (unknown !== undefined) {
                    throw new Error(`auto-battle lineup: restored lineup references unknown hero "${unknown}"`);
                }
                lineup = loaded.data;
                // 迁移回写：旧版本存档经 load 逐级迁移后立即落盘当前版本，
                // 避免每次重启重复执行迁移链
                void lineupStore.save(lineup).catch((error: unknown) => {
                    console.error(error);
                });
            },
        },
        idleRewards: {
            get state() {
                return idleRewardsHandle.state;
            },
            clock: idleRewardsClock,
            preview: () => idleRewardsHandle.previewOffline(),
            settleOffline: () => {
                // 结算后立即持久化：下次结算/重启以本次入账为准，重复结算幂等
                const settlement = idleRewardsHandle.settleOffline();
                persistIdleRewards();
                return settlement;
            },
            restore: async () => {
                // 恢复上次挂机状态；缺档保持初始（无存档）、损坏/未来版本抛错。
                // 编队读取失败回退固定默认速率（spec）：此处不读编队，速率接缝
                // 由 settleOffline 内部 computeRate 兜底固定值
                const loaded = await idleRewardsStore.load();
                if (loaded === null) {
                    return;
                }
                idleRewardsHandle.restore(loaded.data);
                // 迁移回写：旧版本存档经 load 逐级迁移后立即落盘当前版本，
                // 避免每次重启重复执行迁移链
                void idleRewardsStore.save(idleRewardsHandle.state).catch((error: unknown) => {
                    console.error(error);
                });
            },
            store: idleRewardsStore,
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
            idleRewardsHandle.dispose();
            await base.dispose();
        },
    };
}
