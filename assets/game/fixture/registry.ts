import type { GameFixture } from "./GameFixture";
import { lookupBundle } from "../../framework";

/** 品类夹具工厂：无参构造一个 GameFixture。 */
export type GameFixtureFactory = () => GameFixture;

/** 品类夹具登记表：品类标识 → 夹具工厂。 */
export type GameFixtureRegistry = Readonly<Record<string, GameFixtureFactory>>;

/** samples bundle 注册的品类模块描述符（fixtures 部分）。 */
export interface SamplesModule {
    readonly fixtures: Readonly<Record<string, GameFixtureFactory>>;
}

/**
 * 品类夹具运行时登记表：从 samples bundle 的全局注册读取；samples 未加载时
 * 为空表（组合根须先经 host.loadBundle 确保 samples 脚本执行）。装配入口只经
 * 此表做薄转发，组合逻辑留在游戏层夹具内。
 */
export function gameFixtureRegistry(): Readonly<Record<string, GameFixtureFactory>> {
    const samples = lookupBundle("samples") as SamplesModule | undefined;
    return samples?.fixtures ?? {};
}
