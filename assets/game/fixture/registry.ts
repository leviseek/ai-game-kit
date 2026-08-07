import type { GameFixture } from "./GameFixture";
import { createRpgFixture } from "../../game_rpg/assembly";
import { createCardFixture } from "../../game_card/assembly";

/** 品类夹具工厂：无参构造一个 GameFixture。 */
export type GameFixtureFactory = () => GameFixture;

/**
 * 品类夹具登记表：品类标识 → 夹具工厂。组合清单显式、不自动扫描；
 * 未登记的品类不参与装配（对齐 design decision 2/3）。
 */
export type GameFixtureRegistry = Readonly<Record<string, GameFixtureFactory>>;

/**
 * 品类夹具登记表：由各品类 change 在 2.x-6.x 阶段登记
 * （RPG 由 task 2.3、卡牌由 task 3.3 登记）。
 * 装配入口（boot/AppRoot）只经此表做薄转发，组合逻辑留在游戏层夹具内。
 */
export const gameFixtureRegistry: GameFixtureRegistry = Object.freeze({
  rpg: createRpgFixture,
  card: createCardFixture,
});
