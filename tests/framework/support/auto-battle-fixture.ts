import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import type {
    PlatformStorage,
    UiNavigator,
} from "../../../assets/framework";

/** 项目根与 auto_battle 品类关键路径（契约/边界断言复用）。 */
export const AUTO_BATTLE_PROJECT_ROOT = resolve(import.meta.dir, "../../..");
export const AUTO_BATTLE_ASSEMBLY_FILE = resolve(
    AUTO_BATTLE_PROJECT_ROOT,
    "assets/samples/game_auto_battle/assembly.ts",
);
export const AUTO_BATTLE_ASSEMBLY_EXISTS = existsSync(AUTO_BATTLE_ASSEMBLY_FILE);
export const AUTO_BATTLE_FRAMEWORK_ROOT = resolve(
    AUTO_BATTLE_PROJECT_ROOT,
    "assets/framework",
);

// ---- 自动战斗夹具目标契约（task 1.1 锁定，task 3.1 实现） ----

export type AutoBattleSide = "ally" | "enemy";
export type AutoBattlePosition = "front" | "mid" | "back";
export type AutoBattleSkillKind = "damage" | "heal";
export type AutoBattlePhase = "fighting" | "over";

/** 技能配置：伤害或治疗由 kind 区分，energyCost 决定满能量释放阈值。 */
export interface AutoBattleSkill {
    readonly id: string;
    readonly name: string;
    readonly kind: AutoBattleSkillKind;
    readonly value: number;
    readonly energyCost: number;
}

/** 单位静态配置：属性与技能由配置表驱动。 */
export interface AutoBattleUnit {
    readonly id: string;
    readonly name: string;
    readonly side: AutoBattleSide;
    readonly position: AutoBattlePosition;
    /** 队内逻辑槽位序号 0..N-1（镜像逻辑层 index，实例化顺序与同排稳定次序身份）。 */
    readonly index: number;
    readonly maxHp: number;
    readonly attack: number;
    readonly speed: number;
    readonly energyMax: number;
    readonly skill: AutoBattleSkill;
}

/** 战斗中的单位运行时快照：静态属性 + 当前 HP/能量。 */
export interface AutoBattleUnitState extends AutoBattleUnit {
    readonly hp: number;
    readonly energy: number;
}

export type AutoBattleEventType =
    | "round-start"
    | "attack"
    | "skill-damage"
    | "skill-heal"
    | "unit-dead"
    | "battle-over"
    | "restart";

/** 战斗事件：seq 保序，time 为事件发生时模拟时钟读数。 */
export interface AutoBattleEvent {
    readonly seq: number;
    readonly type: AutoBattleEventType;
    readonly time: number;
    readonly sourceId: string;
    readonly targetId?: string;
    readonly value?: number;
    readonly round?: number;
    readonly result?: "win" | "lose";
}

export interface AutoBattleState {
    readonly round: number;
    readonly phase: AutoBattlePhase;
    /** 当前行动序列（单位 id，按速度降序快照）。 */
    readonly order: readonly string[];
    readonly actionIndex: number;
    readonly result: "win" | "lose" | undefined;
    readonly units: readonly AutoBattleUnitState[];
}

export type AutoBattleSpeed = 1 | 2 | 3;

/** 玩家编队：定长槽位序列（slot 0..布阵区容量-1 → 英雄 id），空槽 null。 */
export interface AutoBattleLineup {
    readonly slots: readonly (string | null)[];
}

/** 英雄静态配置：英雄池条目（编队候选），形状为 AutoBattleUnit 去掉 side/index。 */
export interface AutoBattleHero {
    readonly id: string;
    readonly name: string;
    readonly position: AutoBattlePosition;
    readonly maxHp: number;
    readonly attack: number;
    readonly speed: number;
    readonly energyMax: number;
    readonly skill: AutoBattleSkill;
}

/** 编队持久化存储：versioned-storage 语义（schema 版本化 + 迁移预留）。 */
export interface LineupStore {
    readonly currentVersion: number;
    save(lineup: AutoBattleLineup): Promise<void>;
    load(): Promise<{ readonly version: number; readonly data: AutoBattleLineup } | null>;
    delete(): Promise<void>;
}

export interface AutoBattleClock {
    now(): number;
    advance(milliseconds: number): void;
    readonly timeScale: number;
    setTimeScale(rate: number): void;
}

export interface AutoBattleFixtureOptions {
    /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
    readonly clock?: AutoBattleClock;
    /** 配置内容：驱动单位/技能/能量规则；缺省为夹具内建缺省配置。 */
    readonly configContent?: Record<string, unknown>;
    /** 平台存储后端：缺省为内存存储；观察编队存档写入/读取。 */
    readonly storage?: PlatformStorage;
    /** 事件回调：战斗事件广播接缝（测试据此断言回放顺序）。 */
    readonly onEvent?: (event: AutoBattleEvent) => void;
}

export interface AutoBattleViewNode {
    text: string | undefined;
    progress: number | undefined;
    visible: boolean | undefined;
    clickHandler: (() => void) | undefined;
}

export interface AutoBattleFixtureHooks {
    readonly battle: {
        readonly state: AutoBattleState;
        tick(): void;
        /** 重置对局到初始状态（重开按钮命令），幂等。 */
        restart(): void;
        /** 事件回放日志：按发生顺序完整记录。 */
        readonly events: readonly AutoBattleEvent[];
    };
    readonly clock: AutoBattleClock;
    readonly config: {
        readonly ally: readonly AutoBattleUnit[];
        readonly enemy: readonly AutoBattleUnit[];
        /** 英雄池（编队页候选来源）。 */
        readonly heroes: readonly AutoBattleHero[];
    };
    /** 当前观战加速挡位（1x/2x/3x）。 */
    readonly speed: AutoBattleSpeed;
    /** 循环切换加速挡位并同步模拟时钟倍率。 */
    cycleSpeed(): void;
    readonly navigator: UiNavigator;
    readonly viewModel: {
        readonly node: (name: string) => AutoBattleViewNode;
        render(): void;
    };
    /** 编队编辑：玩家可变编队 + 点击选择操作 + 持久化。 */
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
        /** 以当前编队重开对局（开战由 lineup 实例化）。 */
        startBattle(): void;
        /** 编队持久化存储。 */
        readonly store: LineupStore;
        /** 从存储恢复上次编队（重启后调用）；无存档则保持当前编队。 */
        restoreLineup(): Promise<void>;
    };
}

export type AutoBattleFixture = GameFixture & AutoBattleFixtureHooks;
export type CreateAutoBattleFixture = (
    options?: AutoBattleFixtureOptions,
) => AutoBattleFixture;

export async function loadCreateAutoBattleFixture(): Promise<CreateAutoBattleFixture> {
    const mod = (await import(pathToFileURL(AUTO_BATTLE_ASSEMBLY_FILE).href)) as {
        createAutoBattleFixture: CreateAutoBattleFixture;
    };
    return mod.createAutoBattleFixture;
}

// ---- 测试配置构造：默认 1v1，行为测试注入定制单位/规则 ----

export function unit(
    id: string,
    name: string,
    overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
    return {
        id,
        name,
        position: "front",
        maxHp: 100,
        attack: 10,
        speed: 5,
        energyMax: 100,
        skill: {
            id: `${id}-skill`,
            name: `${name} Skill`,
            kind: "damage",
            value: 40,
            energyCost: 100,
        },
        ...overrides,
    };
}

export function configContent(opts: {
    ally?: readonly Record<string, unknown>[];
    enemy?: readonly Record<string, unknown>[];
    energyGainAttacker?: number;
    energyGainTarget?: number;
} = {}): Record<string, unknown> {
    // 新格式：heroes 池 + lineups（英雄 id 序列）；既有测试经此统一走 lineup 实例化
    const ally = opts.ally ?? [unit("a", "Tank")];
    const enemy = opts.enemy ?? [unit("e", "Slime")];
    return {
        heroes: [...ally, ...enemy],
        lineups: {
            ally: ally.map((entry) => entry.id as string),
            enemy: enemy.map((entry) => entry.id as string),
        },
        energyGainAttacker: opts.energyGainAttacker ?? 10,
        energyGainTarget: opts.energyGainTarget ?? 5,
    };
}

// ---- 统一驱动：与 8.6 统一生命周期测试相同的接缝调用顺序 ----

export async function driveUniformLifecycle(fixture: GameFixture): Promise<string[]> {
    const steps: string[] = [];
    await fixture.start();
    steps.push("start");
    await fixture.pause();
    steps.push("pause");
    await fixture.resume();
    steps.push("resume");
    await fixture.dispose();
    steps.push("dispose");
    return steps;
}
