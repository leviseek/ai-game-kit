import type { GameFixture } from "./GameFixture";

/** 品类夹具工厂：无参构造一个 GameFixture。 */
export type GameFixtureFactory = () => GameFixture;

/**
 * 品类夹具登记表：品类标识 → 夹具工厂。组合清单显式、不自动扫描；
 * 未登记的品类不参与装配（对齐 design decision 2/3）。
 */
export type GameFixtureRegistry = Readonly<Record<string, GameFixtureFactory>>;

/**
 * 品类夹具登记表（当前为空：五类夹具由各自 change 在 2.x-6.x 阶段登记，
 * 例如 `Object.freeze({ rpg: createRpgFixture, ... })`）。装配入口
 * （boot/AppRoot）只经此表做薄转发，组合逻辑留在游戏层夹具内。
 */
export const gameFixtureRegistry: GameFixtureRegistry = Object.freeze({});
