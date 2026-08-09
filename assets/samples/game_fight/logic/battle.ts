import type { Module } from "../../../framework";
import type {
    FightBattleState,
    FightFrameData,
    FightHitbox,
} from "../models";
import type { FightEffect } from "./pool";
import type { FightEffectPool } from "./pool";

/** 敌人判定区域：战斗结算使用的固定命中目标，与招式判定盒做相交检测。 */
const ENEMY_BODY = { x: 96, y: 0, width: 28, height: 60 };

const PLAYER_START_HP = 100;
const ENEMY_START_HP = 100;

/** 招式帧数据：判定盒/连招/帧数据只存在于游戏层（负向边界断言锁定）。 */
const MOVES: readonly FightFrameData[] = [
    {
        id: "punch",
        name: "Punch",
        startupFrames: 1,
        activeFrames: 2,
        recoveryFrames: 3,
        damage: 10,
        hitbox: { x: 90, y: 0, width: 24, height: 40 },
    },
    {
        id: "kick",
        name: "Kick",
        startupFrames: 2,
        activeFrames: 2,
        recoveryFrames: 4,
        damage: 15,
        hitbox: { x: 86, y: 0, width: 36, height: 48 },
    },
    {
        id: "block",
        name: "Block",
        startupFrames: 0,
        activeFrames: 1,
        recoveryFrames: 2,
        damage: 5,
        hitbox: { x: 94, y: 0, width: 20, height: 60 },
    },
];

interface ActiveMoveState {
    readonly move: FightFrameData;
    /** 招式内已推进帧数：startup → active → recovery 依次结算。 */
    frameInMove: number;
    /** 本次招式是否已命中：每个招式在活动帧窗口内至多结算一次伤害。 */
    hitApplied: boolean;
    /** 命中时从对象池借出的特效：招式结束时归还，保证借还成对。 */
    effect: FightEffect | undefined;
}

/** 矩形相交判定：判定盒与敌人判定区域是否重叠。 */
function hitboxesOverlap(a: FightHitbox, b: FightHitbox): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

/** 战斗控制器句柄：固定步长逐帧推进，命中经对象池产生特效并播放音频。 */
export interface FightBattleHandle {
    readonly state: FightBattleState;
    readonly moves: readonly FightFrameData[];
    /** 输入 action 联动出招：空闲时开始招式，非空闲拒绝。 */
    startMove(action: string): boolean;
    /** 固定步长推进一帧：结算当前招式帧数据与命中。 */
    tick(): void;
    dispose(): void;
}

export interface FightBattleOptions {
    /** 命中特效对象池：命中借出、招式结束归还。 */
    readonly pool: FightEffectPool;
    /** 命中回调：借出特效对象后调用（音频播放接缝）。 */
    readonly onHit?: (effect: unknown) => void;
}

/**
 * 战斗控制器：模拟时钟下固定步长逐帧推进，招式经 startup/active/recovery
 * 帧数据结算，active 窗口内判定盒命中敌人则造成伤害、连招 +1、从对象池
 * 借出命中特效并通知音频播放。对象池复用而非反复创建（created 保持小值）。
 */
export function createFightBattle(
    options: FightBattleOptions,
): FightBattleHandle {
    const pool = options.pool;
    const reportHit = options.onHit ?? (() => { });

    let frame = 0;
    const playerHp = PLAYER_START_HP;
    let enemyHp = ENEMY_START_HP;
    let combo = 0;
    let activeMove: ActiveMoveState | undefined;
    let disposed = false;

    function state(): FightBattleState {
        return {
            frame,
            playerHp,
            enemyHp,
            combo,
            activeMoveId: activeMove?.move.id ?? null,
        };
    }

    return {
        get state() {
            return state();
        },
        moves: MOVES,
        startMove(action: string) {
            if (disposed || activeMove !== undefined) {
                return false;
            }
            const move = MOVES.find((candidate) => candidate.id === action);
            if (move === undefined) {
                return false;
            }
            activeMove = { move, frameInMove: 0, hitApplied: false, effect: undefined };
            return true;
        },
        tick() {
            if (disposed) {
                return;
            }
            frame += 1;
            const current = activeMove;
            if (current === undefined) {
                return;
            }

            current.frameInMove += 1;
            const { move } = current;

            // 命中窗口：活动帧内判定盒与敌人相交，每个招式只结算一次
            if (
                !current.hitApplied &&
                current.frameInMove > move.startupFrames &&
                current.frameInMove <= move.startupFrames + move.activeFrames &&
                hitboxesOverlap(move.hitbox, ENEMY_BODY)
            ) {
                current.hitApplied = true;
                enemyHp = Math.max(0, enemyHp - move.damage);
                combo += 1;
                // 借出命中特效：招式结束归还，保证借还成对、对象被复用
                current.effect = pool.acquire();
                reportHit(current.effect);
            }

            // 招式结束：startup + active + recovery 帧后回到空闲，归还命中特效
            if (
                current.frameInMove >=
                move.startupFrames + move.activeFrames + move.recoveryFrames
            ) {
                if (current.effect !== undefined) {
                    pool.release(current.effect);
                }
                activeMove = undefined;
            }
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            // 归还未完成招式仍持有的命中特效，避免对象池遗留借出对象
            if (activeMove?.effect !== undefined) {
                pool.release(activeMove.effect);
            }
            activeMove = undefined;
        },
    };
}

/**
 * 战斗模块：组合根创建战斗控制器并注入对象池与音频回调；模块只登记引用，
 * 帧推进由测试经 fixture.battle.tick 驱动，模块生命周期无副作用。
 */
export function createFightBattleModule(battle: FightBattleHandle): Module {
    return {
        id: "fight.battle",
        dependencies: [],
        start: () => {
            // 战斗控制器在组合根构造时即就绪；start 只是让模块进入装配清单
            void battle.moves.length;
        },
    };
}
