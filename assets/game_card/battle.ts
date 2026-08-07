import type { Module } from "../framework";
import { createStateMachine, type StateMachine } from "../framework";
import type { CardSimClock } from "./clock";
import type { CardConfigHandle } from "./config";
import type { CardBattleState, CardTurnPhase } from "./models";

/** 回合流事件：出牌结算不改变阶段，阶段转移由结束回合与时钟超时驱动。 */
type CardTurnEvent = "end-turn" | "turn-elapsed" | "finish";

/**
 * 回合流控制器：以状态机表达回合阶段转移，出牌结算由可控时钟驱动的
 * 阶段超时衔接。enemy 阶段持续达到配置回合时长（>=）后自动回到 player
 * 阶段，回合数 +1；mana 在回合开始重置。业务规则（卡牌数值/回合时长）
 * 只来自注入的配置句柄，框架层不出现卡组/回合模型（3.1 负向断言锁定）。
 */
export interface CardBattleHandle {
  readonly state: CardBattleState;
  /** 玩家阶段出牌：校验手牌与 mana 后结算伤害，命中终局进入 over。 */
  playCard(index: number): boolean;
  /** 结束玩家回合：player → enemy；非玩家阶段拒绝。 */
  endTurn(): boolean;
  /** 停止回合推进与出牌，幂等。 */
  dispose(): void;
}

export function createCardBattle(
  clock: CardSimClock,
  config: CardConfigHandle,
): CardBattleHandle {
  // 回合流状态机：阶段转移表只表达"结束回合/时钟超时/终局"三种驱动
  const fsm: StateMachine<CardTurnPhase, CardTurnEvent> = createStateMachine<
    CardTurnPhase,
    CardTurnEvent
  >({
    initial: "player",
    transitions: {
      player: { "end-turn": "enemy", finish: "over" },
      enemy: { "turn-elapsed": "player" },
      over: {},
    },
    onTransitionError: () => {
      // 非法事件（如非玩家阶段出牌）静默拒绝，阶段保持不变
    },
  });

  let disposed = false;
  let turn = 1;
  let playerHp = config.playerHp;
  let enemyHp = config.enemyHp;
  let mana = config.startMana;
  let phaseEnteredAt = clock.now();

  // 惰性同步回合阶段：enemy 阶段超时后自动回到 player 并重置 mana；
  // 读取状态或任何操作前先同步，保证时钟推进即时反映到回合流
  function syncPhase(): void {
    if (disposed || fsm.state !== "enemy") {
      return;
    }

    if (clock.now() - phaseEnteredAt < config.turnDurationMs) {
      return;
    }

    fsm.send("turn-elapsed");
    turn += 1;
    mana = config.startMana;
    phaseEnteredAt = clock.now();
  }

  return {
    get state(): CardBattleState {
      syncPhase();
      return {
        turn,
        phase: fsm.state,
        playerHp,
        enemyHp,
        mana,
        hand: config.cards,
      };
    },
    playCard(index: number): boolean {
      syncPhase();

      if (disposed || fsm.state !== "player") {
        return false;
      }

      const card = config.cards[index];
      if (card === undefined || mana < card.cost) {
        return false;
      }

      mana -= card.cost;
      enemyHp -= card.damage;

      if (enemyHp <= 0) {
        enemyHp = 0;
        fsm.send("finish");
      }

      return true;
    },
    endTurn(): boolean {
      syncPhase();

      if (disposed || fsm.state !== "player") {
        return false;
      }

      fsm.send("end-turn");
      phaseEnteredAt = clock.now();
      return true;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      fsm.dispose();
    },
  };
}

/**
 * 回合流模块：组合根创建控制器并注入；模块只登记引用，不在此释放共享
 * 控制器——组合根的 dispose 统一负责（避免 failRollback 探针复用模块
 * 实例时提前销毁夹具自身能力，对齐 GameFixture 幂等契约）。
 */
export function createCardBattleModule(battle: CardBattleHandle): Module {
  return {
    id: "card.battle",
    dependencies: [],
    start: () => {
      // 控制器在组合根构造时即就绪；start 只是让模块进入装配清单
      void battle.state.phase;
    },
  };
}
