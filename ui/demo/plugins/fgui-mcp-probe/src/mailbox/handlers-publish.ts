import FairyEditor = CS.FairyEditor;
import type { MailboxServer, MailboxHandler } from "./server";
import { writePublishSignal } from "./publish-signal";
import { saveAllDocuments } from "./handlers-write";

const App = FairyEditor.App;

/**
 * 全自动发布 handler（deferred）：new PublishHandler(pkg, activeBranch) → Run() → 等待 onComplete → 写响应。
 * branch 默认取 project.activeBranch（空串合法 = 主干/无分支），由 allBranches 动态校验，禁止硬编码分支名。
 * 发布是异步操作，通过 MailboxServer.writeResponse 在 onComplete 时补写响应（deferred 机制）。
 * 安全约束：exportPath 重定向到 .objs/fgui-mcp-probe/publish-out/，绝不触碰真实 assets/ui 产物；
 * 真实发布路径由发布配置（fgui_switch_publish_settings）控制，用户可选择是否重定向。
 */
export function createTriggerPublishHandler(server: MailboxServer): MailboxHandler {
    return (params): { deferred: true; id: string } | { id: string } => {
        const project = App.project;
        if (!project) throw new Error("无打开工程");
        const packageName = params["package"] as string | undefined;
        if (!packageName) throw new Error("缺少参数 package");
        const pkg = project.GetPackageByName(packageName);
        if (!pkg) throw new Error(`包不存在: ${packageName}`);

        // 发布前强制保存全部未保存文档：保证内存态修改落盘，避免产物与源 XML 失配（写闭环）
        let savedInfo: { saved: number; hadUnsaved: boolean };
        try {
            savedInfo = saveAllDocuments();
        } catch (e: any) {
            const error = `发布前保存文档失败，已中止发布: ${e && e.message ? e.message : e}`;
            const reqId = params["__requestId"] as string;
            if (reqId) server.writeResponse(reqId, { ok: false, error });
            throw new Error(error);
        }

        // 分支参数：默认取 activeBranch（空串合法）；显式传入时校验 ∈ allBranches
        let branch = project.activeBranch as string;
        const branchArg = params["branch"] as string | undefined;
        if (branchArg !== undefined && branchArg !== "") {
            const branches: string[] = [];
            const all = project.allBranches;
            if (all) {
                for (let i = 0; i < all.Count; i++) branches.push(all.get_Item(i));
            }
            if (!branches.includes(branchArg)) {
                throw new Error(`分支不存在: ${branchArg}（可用分支: ${branches.join(",") || "无（仅主干）"}）`);
            }
            branch = branchArg;
        }

        // 请求 id：从 params 回传（server 在解析请求时注入，见 main.ts 注册包装）
        const reqId = params["__requestId"] as string;
        if (!reqId) throw new Error("缺少请求 id（内部错误）");

        // 构造 PublishHandler：优先 activeBranch，失败回退无参构造（探针已验证的策略）
        let handler: FairyEditor.PublishHandler;
        try {
            handler = new FairyEditor.PublishHandler(pkg, branch);
        } catch {
            handler = new FairyEditor.PublishHandler();
        }

        // 发布目标：默认重定向到 scratch（安全），可传 releaseToReal 关闭重定向走真实产物路径
        const redirect = params["redirectToScratch"] !== false;
        if (redirect) {
            handler.exportPath = `${project.objsPath}/fgui-mcp-probe/publish-out/${packageName}`;
        }
        handler.genCode = false;

        const t0 = Date.now();
        handler.add_onComplete(() => {
            const payload = {
                ok: handler.isSuccess,
                ts: new Date().toISOString(),
                packages: [packageName],
                exportPath: handler.exportPath,
                isSuccess: handler.isSuccess,
            };
            // 同步写发布信号，供 fgui_check_publish 复用
            writePublishSignal(payload);
            server.writeResponse(reqId, {
                ok: true,
                result: {
                    status: handler.isSuccess ? "success" : "failed",
                    isSuccess: handler.isSuccess,
                    exportPath: handler.exportPath,
                    fileName: handler.fileName,
                    elapsedMs: Date.now() - t0,
                    packages: [packageName],
                    savedBeforePublish: savedInfo.hadUnsaved,
                },
            });
        });

        try {
            handler.Run();
        } catch (e: any) {
            server.writeResponse(reqId, {
                ok: false,
                error: String(e && e.message ? e.message : e),
            });
            return { id: reqId };
        }

        return { deferred: true, id: reqId };
    };
}

/**
 * 全自动发布全部包（deferred，参考 FairyGUI-MCP publish_all）：遍历 project.allPackages，
 * 逐个构造 PublishHandler 顺序 Run，全部 onComplete 后写响应。安全约束同 trigger_publish（默认重定向 scratch）。
 * 参数: 可选 redirectToScratch（默认 true）、可选 exclude（跳过指定包名数组）。
 */
export function createPublishAllHandler(server: MailboxServer): MailboxHandler {
    return (params): { deferred: true; id: string } => {
        const project = App.project;
        if (!project) throw new Error("无打开工程");

        // 发布前强制保存全部未保存文档（写闭环）
        try {
            saveAllDocuments();
        } catch (e: any) {
            const error = `发布前保存文档失败，已中止发布: ${e && e.message ? e.message : e}`;
            const reqId = params["__requestId"] as string;
            if (reqId) server.writeResponse(reqId, { ok: false, error });
            throw new Error(error);
        }

        const reqId = params["__requestId"] as string;
        if (!reqId) throw new Error("缺少请求 id（内部错误）");

        // 收集待发布包（跳过 exclude）
        const exclude = (params["exclude"] as string[] | undefined) ?? [];
        const pkgs: FairyEditor.FPackage[] = [];
        const all = project.allPackages;
        if (all) {
            for (let i = 0; i < all.Count; i++) {
                const p = all.get_Item(i);
                if (!exclude.includes(p.name)) pkgs.push(p);
            }
        }
        if (pkgs.length === 0) throw new Error("无待发布包（可能全部被 exclude）");

        const redirect = params["redirectToScratch"] !== false;
        const results: Array<{ package: string; isSuccess: boolean; exportPath: string }> = [];
        const t0 = Date.now();

        const runNext = (index: number): void => {
            if (index >= pkgs.length) {
                // 全部完成：写发布信号（覆盖为最新批次）+ 响应
                const failedCount = results.filter((r) => !r.isSuccess).length;
                const payload = {
                    ok: failedCount === 0,
                    ts: new Date().toISOString(),
                    packages: results.map((r) => r.package),
                    exportPath: results[results.length - 1]?.exportPath ?? "",
                    isSuccess: failedCount === 0,
                };
                writePublishSignal(payload);
                server.writeResponse(reqId, {
                    ok: true,
                    result: {
                        status: failedCount === 0 ? "success" : "partial",
                        isSuccess: failedCount === 0,
                        total: results.length,
                        failedCount,
                        elapsedMs: Date.now() - t0,
                        packages: results,
                    },
                });
                return;
            }
            const pkg = pkgs[index]!;
            let handler: FairyEditor.PublishHandler;
            try {
                handler = new FairyEditor.PublishHandler(pkg, project.activeBranch);
            } catch {
                try {
                    handler = new FairyEditor.PublishHandler();
                } catch (e: any) {
                    results.push({ package: pkg.name, isSuccess: false, exportPath: "" });
                    runNext(index + 1);
                    return;
                }
            }
            if (redirect) {
                handler.exportPath = `${project.objsPath}/fgui-mcp-probe/publish-out/${pkg.name}`;
            }
            handler.genCode = false;
            handler.add_onComplete(() => {
                results.push({ package: pkg.name, isSuccess: handler.isSuccess, exportPath: handler.exportPath });
                runNext(index + 1);
            });
            try {
                handler.Run();
            } catch (e: any) {
                results.push({ package: pkg.name, isSuccess: false, exportPath: "" });
                runNext(index + 1);
            }
        };

        try {
            runNext(0);
        } catch (e: any) {
            server.writeResponse(reqId, { ok: false, error: String(e && e.message ? e.message : e) });
        }
        return { deferred: true, id: reqId };
    };
}
