import { runCardBattleSmoke as runCardBattleGame } from "../../game/fixture/smoke";
import { createFairyGuiViewHandle } from "../../framework/adapters/cocos/ui/FairyGuiViewHandle";
import type { UiHost } from "../host/UiHost";

/**
 * 卡牌对战真实可玩冒烟。加载 CardGame 包并打开 BattleView 页面，经 fgui 接缝
 * 把视图节点解析器注入游戏层 runCardBattleSmoke，驱动完整对局。每步经 console
 * 输出 `[card-battle]` 标记，由 headless Chrome + CDP 采集验证。
 */
export async function runCardBattleSmoke(
    host: UiHost,
    ensureSharedDependencies: () => Promise<void>,
): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
        console.log(`[card-battle] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`);
    };

    // 1. UI 根与页面适配器初始化
    const ready = host.smokeUiInit();
    report("ui-root-init", ready);
    if (!ready) {
        return;
    }

    // 2. 加载 CardGame package（assets/ui/CardGame/CardGame.bin → bundle "ui"）；
    //    该包跨包引用 Common，先确保依赖已注册，使按钮组件可解析
    let packageLoaded = false;
    try {
        await ensureSharedDependencies();
        const handle = await host.loadPackage("ui", "CardGame/CardGame");
        packageLoaded = handle.state === "ready";
        report("package-load", packageLoaded, String(handle.state));
    } catch (error) {
        report("package-load", false, error instanceof Error ? error.message : String(error));
        return;
    }
    const adapter = host.pageAdapter;
    if (!packageLoaded || adapter === undefined) {
        report("battle-open", false, "package not loaded or adapter missing");
        return;
    }

    // 3. 打开 BattleView 页面并拿真实视图（fgui GComponent）
    const page = adapter.createPage("card/battle", "normal", {
        packageName: "CardGame",
        resName: "BattleView",
    });
    if (page.disposed || page.view === undefined) {
        report("battle-open", false, String(page.error ?? "no view"));
        return;
    }
    adapter.mount(page);
    report("battle-open", true);

    // 4. 注入 fgui 视图节点解析器，驱动游戏层完整对局
    const node = createFairyGuiViewHandle(page.view as never);
    await runCardBattleGame(node, report);

    // 5. 释放：关闭页面、释放作用域
    adapter.destroy(page);
    host.release();

    console.log("[card-battle] complete");
}
