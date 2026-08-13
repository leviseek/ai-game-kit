import type { UiHost } from "../host/UiHost";
import { BUNDLES, PACKAGE_PATHS } from "../constants";

/**
 * FairyGUI UI 冒烟序列（引擎集成冒烟驱动）。覆盖 UI 根初始化、package 加载、
 * 页面打开/关闭、遮罩呈现/移除、资源释放闭环与未加载 package 失败保留标识。
 * 每步经 console 输出 `[ui-smoke]` 标记，由 headless Chrome + CDP 采集验证；
 * 任何异常经 onError 上报后继续。
 */
export async function runUiSmoke(host: UiHost): Promise<void> {
    const report = (step: string, ok: boolean, detail = "") => {
        console.log(`[ui-smoke] ${step}: ${ok ? "ok" : "FAIL"}${detail ? ` (${detail})` : ""}`);
    };

    // 1. UI 根与页面适配器初始化
    const ready = host.smokeUiInit();
    report("ui-root-init", ready);
    if (!ready) {
        return;
    }

    // 2. 加载 Demo package（assets/ui/Demo/Demo.bin → bundle "ui" 路径 "Demo/Demo"）
    let packageLoaded = false;
    try {
        const handle = await host.loadPackage(BUNDLES.ui, PACKAGE_PATHS.demo);
        packageLoaded = handle.state === "ready";
        report("package-load", packageLoaded, String(handle.state));
    } catch (error) {
        report("package-load", false, error instanceof Error ? error.message : String(error));
    }

    // 3. 打开页面（package 加载成功后才创建视图）
    const opened = packageLoaded
        ? host.openPage("demo", "normal", "Demo", "DemoView")
        : false;
    report("page-open", opened);

    // 4. 遮罩呈现/移除（模态输入阻断）：经导航器打开/关闭阻断页面，遮罩由
    //    适配器消费导航模态状态自动同步，组合根不再手动调用 setModal
    let modalShown = false;
    let modalHidden = false;
    const navigator = host.navigator;
    if (navigator !== undefined) {
        const openResult = navigator.open("ui-modal", {
            layer: "popup",
            blocking: true,
        });
        modalShown = openResult.ok === true && navigator.modal === true;
        const closeResult = navigator.close();
        modalHidden = closeResult.ok === true && navigator.modal === false;
    }
    report("modal-show", modalShown);
    report("modal-hide", modalHidden);

    // 5. 关闭页面
    const closed = host.closePage("demo");
    report("page-close", closed);

    // 6. 资源释放闭环：释放作用域后 ui Bundle 应可卸载
    host.release();
    const canUnload = host.canUnload(BUNDLES.ui);
    report("resource-release", canUnload);

    // 7. 未加载 package：不存在的路径应保留失败标识（no-op 不崩溃）
    let noopFailed = true;
    try {
        const handle = await host.loadPackage(BUNDLES.ui, "NoSuchPackage/NoSuchView");
        noopFailed = handle.state === "failed";
        report("missing-package-noop", noopFailed, String(handle.state));
    } catch (error) {
        report("missing-package-noop", noopFailed, error instanceof Error ? error.message : String(error));
    }
    host.release();

    console.log("[ui-smoke] complete");
}
