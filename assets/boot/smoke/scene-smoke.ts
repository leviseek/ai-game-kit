import { director } from "cc";
import type { SceneResources, SceneSwitchResult } from "../../framework";

/**
 * 场景流转冒烟的接入对象：由组合根把 sceneFlow 与资源提供者绑定为闭包。
 */
export interface SceneSmokeContext {
    preload(sceneId: string, resources: SceneResources): Promise<void>;
    switchTo(sceneId: string, resources: SceneResources): Promise<SceneSwitchResult>;
    canUnload(bundle: string): boolean;
}

/**
 * 场景流转冒烟序列（引擎集成冒烟驱动）。覆盖预加载、成功切换、失败保留当前
 * 场景、重试与资源释放闭环。每步经 console 输出 `[scene-smoke]` 标记，由
 * headless Chrome + CDP 采集验证（对齐 runUiSmoke）。`game` 场景已随 game
 * bundle 独立分包，预加载/切换须加载 game bundle（对齐 BOOTSTRAP_SCENE），
 * 场景注册后 director.loadScene("game") 才可命中；单向冒烟 startup → game
 * 安全，回切 startup 会实例化第二个 AppRoot，本序列只做单向。
 */
export async function runSceneFlowSmoke(context: SceneSmokeContext): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
        console.log(
            `[scene-smoke] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`,
        );
    };

    // 1. 入口：初始场景 startup，game Bundle 尚无持有（可卸载）
    const initialScene = director.getScene()?.name ?? "";
    report("entry", initialScene === "startup", initialScene);
    report("initial-can-unload-game", context.canUnload("game"));

    // 2. 预加载：game 场景资源（game bundle）被流转作用域持有（不可卸载）
    let preloadHolds = false;
    try {
        await context.preload("game", { bundle: "game", paths: ["game"] });
        preloadHolds = !context.canUnload("game");
        report("preload", true);
        report("preload-holds-game", preloadHolds);
    } catch (error) {
        report("preload", false, error instanceof Error ? error.message : String(error));
        return;
    }

    // 3. 释放闭环：对第二个目标（common）预加载触发前一次流转作用域释放 →
    //    game 归零可卸载，common 被新流转作用域持有。
    let releaseLoop = false;
    try {
        await context.preload("game", {
            bundle: "common",
            paths: ["placeholder"],
        });
        releaseLoop = context.canUnload("game");
        report("release-loop", releaseLoop);
    } catch (error) {
        report("release-loop", false, error instanceof Error ? error.message : String(error));
        return;
    }

    // 4. 成功切换：加载 game bundle 启动 game 场景，game 所有权转移给 sceneScope
    //    （仍不可卸载）
    let switched = false;
    try {
        const result = await context.switchTo("game", {
            bundle: "game",
            paths: ["game"],
        });
        switched = result.ok === true && result.sceneId === "game";
        report("switch", switched, String(result.reason ?? ""));
        report(
            "switch-scene",
            director.getScene()?.name === "game",
            director.getScene()?.name ?? "",
        );
        report("switch-holds-game", !context.canUnload("game"));
    } catch (error) {
        report("switch", false, error instanceof Error ? error.message : String(error));
    }

    // 5. 资源链失败：不存在的 Bundle 加载失败，场景保留 game、可重试
    let failKeeps = false;
    try {
        const result = await context.switchTo("game", {
            bundle: "no-such-bundle",
            paths: ["placeholder"],
        });
        failKeeps = result.ok === false;
        report("fail-keeps-scene", failKeeps, String(result.reason ?? ""));
    } catch (error) {
        report("fail-keeps-scene", false, error instanceof Error ? error.message : String(error));
    }

    // 6. 失败后重试：切回 game bundle 资源再次成功
    let retried = false;
    try {
        const result = await context.switchTo("game", {
            bundle: "game",
            paths: ["game"],
        });
        retried = result.ok === true && result.sceneId === "game";
        report("retry", retried, String(result.reason ?? ""));
    } catch (error) {
        report("retry", false, error instanceof Error ? error.message : String(error));
    }

    // 7. 未加载 Bundle 卸载 no-op：canUnload 查询不崩溃且为 true
    report("missing-bundle-noop", context.canUnload("no-such-bundle"));

    console.log("[scene-smoke] complete");
}
