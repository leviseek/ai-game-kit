import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/** 轮询句柄（帧回调内检查），避免编辑器主线程长阻塞 */
interface PollHandle {
    active: boolean;
}

/**
 * 探针 B：PublishHandler.Run() 实机行为。
 * 安全约束：exportPath 重定向到 .objs/fgui-mcp-probe/publish-out/，绝不触碰真实 assets/ui 产物。
 * 记录项：Run() 是否同步返回、是否阻塞主线程、onComplete 是否触发、isSuccess 时序、onPublish 钩子是否随此路径触发、异常。
 * 轮询走 App.add_onUpdate 每帧回调，避免 Thread.Sleep 冻结编辑器。
 * branch 取值：工程无分支（allBranches 空）时先传 activeBranch 原值（空串）；若构造仍失败再测无参构造。
 * 禁止硬编码 "master"——上一轮实测证明该工程未启用分支，不存在 master。
 */
export function runPublishHandlerProbe(): void {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        ProbeResultWriter.record("publish-handler", { status: "blocked", reason: "无打开工程" });
        return;
    }

    const pkgName = "Demo";
    const pkg = project.GetPackageByName(pkgName);
    if (!pkg) {
        ProbeResultWriter.record("publish-handler", { status: "blocked", reason: `包 ${pkgName} 不存在` });
        return;
    }

    const scratchOut = `${project.objsPath}/fgui-mcp-probe/publish-out/${pkgName}`;
    // 记录分支基线与构造策略，供 MCP 设计分支参数校验
    const allBranches: string[] = [];
    const branches = project.allBranches;
    if (branches) {
        for (let i = 0; i < branches.Count; i++) allBranches.push(branches.get_Item(i));
    }

    try {
        // 构造策略：优先传 activeBranch 原值（空串合法 = 主干/无分支），失败再测无参构造
        let handler: FairyEditor.PublishHandler;
        let ctorMode: string;
        try {
            handler = new FairyEditor.PublishHandler(pkg, project.activeBranch);
            ctorMode = `activeBranch: "${project.activeBranch}"`;
        } catch (e: any) {
            const err1 = String(e && e.message ? e.message : e);
            try {
                handler = new FairyEditor.PublishHandler();
                ctorMode = `activeBranch 构造失败(${err1})，回退无参构造成功`;
            } catch (e2: any) {
                ProbeResultWriter.record("publish-handler", {
                    status: "error",
                    activeBranch: project.activeBranch,
                    allBranches,
                    ctorError: err1,
                    ctorError2: String(e2 && e2.message ? e2.message : e2),
                });
                return;
            }
        }
        (globalThis as any).__fguiMcpProbe_onPublishFired = false;

        const completed: { fired: boolean; ts: string } = { fired: false, ts: "" };
        handler.add_onComplete(() => {
            completed.fired = true;
            completed.ts = new Date().toISOString();
            probeLog(`publish-handler onComplete 触发 isSuccess=${handler.isSuccess} exportPath=${handler.exportPath}`);
            ProbeResultWriter.record("publish-handler", {
                status: "complete-callback",
                isSuccess: handler.isSuccess,
                exportPath: handler.exportPath,
                onCompleteFired: true,
                onPublishHookFired: (globalThis as any).__fguiMcpProbe_onPublishFired,
                ctorMode,
                allBranches,
            });
        });

        handler.exportPath = scratchOut;
        handler.genCode = false;

        const t0 = Date.now();
        let runReturnedSync = false;
        try {
            handler.Run();
            const elapsed = Date.now() - t0;
            runReturnedSync = true;
            probeLog(`Run() 同步返回，耗时 ${elapsed}ms（若远小于发布时长则说明内部异步）`);
        } catch (e: any) {
            ProbeResultWriter.record("publish-handler", {
                status: "error",
                error: String(e && e.message ? e.message : e),
                runReturnedSync: false,
            });
            return;
        }

        // 每帧轮询 isSuccess；超时后依赖 onComplete 回调补记
        const deadline = Date.now() + 60000;
        const handle: PollHandle = { active: true };
        const poll = (): void => {
            if (!handle.active) return;
            if (handler.isSuccess || handler.paused || Date.now() >= deadline) {
                handle.active = false;
                App.remove_onUpdate(poll);
                const elapsed = Date.now() - t0;
                if (handler.isSuccess) {
                    probeLog(`发布完成 isSuccess=true 总耗时 ${elapsed}ms`);
                }
                ProbeResultWriter.record("publish-handler", {
                    status: handler.isSuccess ? "pass" : "pending-callback",
                    isSuccess: handler.isSuccess,
                    exportPath: handler.exportPath,
                    fileName: handler.fileName,
                    elapsedMs: elapsed,
                    runReturnedSync,
                    onCompleteFired: completed.fired,
                    onPublishHookFired: (globalThis as any).__fguiMcpProbe_onPublishFired,
                    scratchOut,
                    ctorMode,
                    allBranches,
                });
            }
        };
        App.add_onUpdate(poll);
    } catch (e: any) {
        ProbeResultWriter.record("publish-handler", {
            status: "error",
            error: String(e && e.message ? e.message : e),
        });
    }
}
