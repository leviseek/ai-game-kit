/**
 * URL 冒烟分派的运行器集合：由组合根绑定具体 boot/smoke 模块序列。
 */
export interface SmokeRouterDeps {
    readonly runUiSmoke: () => Promise<void>;
    readonly runSceneFlowSmoke: () => Promise<void>;
    readonly runModalClickSmoke: () => Promise<void>;
    readonly runCardBattleSmoke: () => Promise<void>;
    readonly runFixtureSmoke: (fixtureId: string) => Promise<void>;
    readonly runFixturePerf: (perfFixtureId: string) => Promise<void>;
}

/**
 * 冒烟分派结果：tag 用作序列失败时 console 标记（如 `[ui-smoke] sequence error`），
 * run 为对应冒烟序列的启动函数。
 */
export interface SmokeAction {
    readonly tag: string;
    readonly run: () => Promise<void>;
}

/**
 * URL 冒烟分派：解析 URL 参数（smoke=fairygui-ui/scene-flow/modal-click/
 * card-battle、fixture、fixture-perf），命中则返回对应冒烟序列；未命中任何
 * 冒烟参数返回 null 供调用方走默认主入口流程。优先级与 else-if 互斥语义
 * 对齐既有 AppRoot.start：一次请求只分派一种冒烟序列，不叠加执行。
 */
export class SmokeRouter {
    constructor(private readonly deps: SmokeRouterDeps) {}

    resolve(search: string): SmokeAction | null {
        const params = new URLSearchParams(search);
        if (params.get("smoke") === "fairygui-ui") {
            return { tag: "ui-smoke", run: this.deps.runUiSmoke };
        }
        if (params.get("smoke") === "scene-flow") {
            return { tag: "scene-smoke", run: this.deps.runSceneFlowSmoke };
        }
        if (params.get("smoke") === "modal-click") {
            return { tag: "modal-click", run: this.deps.runModalClickSmoke };
        }
        if (params.get("smoke") === "card-battle") {
            return { tag: "card-battle", run: this.deps.runCardBattleSmoke };
        }
        if (params.get("fixture") !== null) {
            const fixtureId = params.get("fixture") ?? "";
            return { tag: "fixture-smoke", run: () => this.deps.runFixtureSmoke(fixtureId) };
        }
        if (params.get("fixture-perf") !== null) {
            const perfFixtureId = params.get("fixture-perf") ?? "";
            return { tag: "fixture-perf", run: () => this.deps.runFixturePerf(perfFixtureId) };
        }
        return null;
    }
}

export function createSmokeRouter(deps: SmokeRouterDeps): SmokeRouter {
    return new SmokeRouter(deps);
}
