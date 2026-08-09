import {
    _decorator,
    Component,
    director,
    sys,
} from "cc";
import {
    Application,
    createSceneFlow,
    createServiceRegistry,
    createServiceToken,
    type IResourceProvider,
    type Logger,
    type Module,
    type SceneFlow,
    ServiceResolutionError,
    type ServiceRegistry,
    type ServiceToken,
    type TimeSource,
} from "../framework";
import { createApplicationContext } from "../framework/application/ApplicationContext";
import { WallClock } from "../framework/core/time/WallClock";
import { ConsoleLogger } from "../framework/diagnostics/logging/ConsoleLogger";
import { CocosApplicationAdapter } from "../framework/adapters/cocos/application/CocosApplicationAdapter";
import { createCocosResourceProvider } from "../framework/adapters/cocos/resource/CocosResourceProvider";
import { createCocosSceneAdapter } from "../framework/adapters/cocos/scene/CocosSceneAdapter";
import {
    createCocosUiRoot,
    type CocosUiRoot,
} from "../framework/adapters/cocos/ui/CocosUiRoot";
import {
    sceneMap,
    type EntryPageHandle,
    type GameEntryInfo,
} from "../game/fixture/lobby";
import {
    createUiHost,
    type UiHost,
} from "./host/UiHost";
import {
    createGameLobbyHost,
    type GameLobbyHostImpl,
} from "./host/GameLobbyHostImpl";
import {
    createBootFlow,
    type BootFlow,
} from "./flow/BootFlow";
import {
    createSmokeProxy,
    type SmokeProxy,
} from "./smoke/smoke-proxy";

const { ccclass } = _decorator;

export function createModules(): readonly Module[] {
    return [];
}

// 装配前 token 校验：缺失 token 或解析期依赖循环抛 ServiceResolutionError，
// 使非法装配在 Application.start 前失败、不进入 running。
function validateRequiredTokens(
    registry: ServiceRegistry,
    requiredTokens: readonly ServiceToken<unknown>[],
): void {
    for (const token of requiredTokens) {
        registry.resolve(token);
    }
}

export interface AppAssembly {
    readonly app: Application;
    readonly adapter: CocosApplicationAdapter;
    readonly sceneFlow: SceneFlow;
    /** 冒烟用资源提供者：供释放观察（canUnload）查询。 */
    readonly resourceProvider: IResourceProvider;
    /** UI 根宿主：封装 FairyGUI GRoot 获取与运行时初始化时机。 */
    readonly uiRoot: CocosUiRoot;
    /** 组合根日志：供 UI 根初始化失败上报等场景使用。 */
    readonly logger: Logger;
    /** 组合根显式创建的服务注册表：供装配前 token 校验与业务对象经构造注入服务契约。 */
    readonly registry: ServiceRegistry;
    /** 装配前 token 校验：缺失/循环在此同步抛错，失败走既有 app.start().catch 路径。 */
    readonly validateAssembly: () => void;
}

export function assembleApp(): AppAssembly {
    const logger = new ConsoleLogger();
    const context = createApplicationContext(logger);
    const modules = createModules();
    const app = new Application(modules, context);
    const adapter = new CocosApplicationAdapter(app);

    // 服务注册表由组合根显式创建；注册一个无副作用的墙钟时间源作为最小接入演示，
    // 后续业务服务在此以类型化 token 注册。注册表不进 Context、不做全局单例。
    const registry = createServiceRegistry();
    const appTimeSourceToken = createServiceToken<TimeSource>("app.time");
    registry.register(appTimeSourceToken, new WallClock());

    // 装配前 token 校验：模块声明依赖的 token 在此逐个 resolve（缺失/循环同步抛错）。
    // 闭包在 AppRoot.start 先于 app.start 调用，失败走既有 app.start().catch 失败路径。
    const validateAssembly = (): void => {
        validateRequiredTokens(registry, [appTimeSourceToken]);
    };

    // 场景流转冒烟组合：真实引擎接缝（cc.assetManager / cc.director）的整链路组装点。
    // 场景名与资源的映射属于游戏层组合，这里只提供最小组装与触发入口；编排行为已由
    // Bun 测试（scene-flow / cocos-resource-provider / cocos-scene-adapter）兜底。
    const resourceProvider = createCocosResourceProvider();
    const sceneFlow = createSceneFlow({
        provider: resourceProvider,
        activateScene: createCocosSceneAdapter().activateScene,
        onProgress: (sceneId, progress) => {
            logger.info(`[smoke] scene "${sceneId}" progress: ${progress}`);
        },
        onError: (error) => {
            logger.error(
                "[smoke] scene flow error",
                undefined,
                error instanceof Error ? error : undefined,
            );
        },
    });

    // UI 根宿主经 Adapter 工厂接入：fgui 类型不进入组合根，初始化时机由 BootFlow
    // 在引擎 ready 后（默认流程切 game 首次呈现 / 冒烟路径 startup）触发。
    const uiRoot = createCocosUiRoot();

    return {
        app,
        adapter,
        sceneFlow,
        resourceProvider,
        uiRoot,
        logger,
        registry,
        validateAssembly,
    };
}

/**
 * 组合根组件：装配 Application 与宿主模块（UiHost/GameLobbyHostImpl/SmokeProxy/
 * BootFlow），并把会话打开/关闭收敛为薄代理；冒烟触发/观察与 URL 冒烟分派收敛到
 * SmokeProxy（唯一冒烟初始化入口）。启动编排、UI 根初始化时机与默认列表页打开
 * 逻辑委托 BootFlow + 宿主模块。
 */
@ccclass("AppRoot")
export class AppRoot extends Component {
    private app?: Application;
    private adapter?: CocosApplicationAdapter;
    private sceneFlow?: SceneFlow;
    private resourceProvider?: IResourceProvider;
    private uiHost?: UiHost;
    private lobbyHost?: GameLobbyHostImpl;
    private smoke?: SmokeProxy;
    private bootFlow?: BootFlow;
    private logger?: Logger;
    private validateAssembly?: () => void;

    onLoad(): void {
        const {
            app,
            adapter,
            sceneFlow,
            resourceProvider,
            uiRoot,
            logger,
            validateAssembly,
        } = assembleApp();
        this.app = app;
        this.adapter = adapter;
        this.sceneFlow = sceneFlow;
        this.resourceProvider = resourceProvider;
        this.logger = logger;
        this.validateAssembly = validateAssembly;
        this.uiHost = createUiHost({ uiRoot, resourceProvider, logger });
        this.lobbyHost = createGameLobbyHost({
            host: this.uiHost,
            resourceProvider,
            logger,
        });
        // 冒烟唯一初始化入口：冒烟触发/观察方法与 URL 冒烟分派收敛到 SmokeProxy，
        // AppRoot 不再持有各冒烟序列实现。
        this.smoke = createSmokeProxy({
            uiHost: this.uiHost,
            sceneFlow,
            resourceProvider,
            lobbyHost: this.lobbyHost,
        });
        // 启动编排器：场景映射清单来自游戏层 fixture（game/fixture 薄转发）；
        // isNative 探测原生平台（Web 静默跳过热更阶段）；getSearch 供 URL 冒烟分派。
        this.bootFlow = createBootFlow({
            sceneFlow,
            uiHost: this.uiHost,
            lobbyHost: this.lobbyHost,
            smokeRouter: this.smoke.router,
            sceneMap,
            logger,
            isNative: () => sys.isNative === true,
            getSearch: () => (typeof window === "undefined" ? "" : window.location.search),
        });
        director.addPersistRootNode(this.node);
    }

    start(): void {
        // 装配前 token 校验先于 adapter.bind：校验失败时不留已绑定/已初始化的全局状态，
        // 应用保持 created 不进入 running。
        const launch = async (): Promise<void> => {
            this.validateAssembly?.();
            this.adapter?.bind();
            await this.app?.start();
        };
        launch().catch((error) => {
            if (error instanceof ServiceResolutionError) {
                // 装配前校验失败发生在 Application.start 之前，未经 Application 上报，
                // 由组合根经 logger 记录类型化错误。
                this.logger?.error("Service assembly validation failed", undefined, error);
            } else {
                // 非装配校验错误（如 ApplicationStateError）Application 内部不记录，
                // 由组合根记录避免静默吞错；模块生命周期失败仍由 Application 记录。
                this.logger?.error(
                    "AppRoot launch aborted",
                    undefined,
                    error instanceof Error ? error : undefined,
                );
            }
        });

        // 启动编排委托 BootFlow：默认无参流程 GRoot 推迟到 game 首次呈现（阶段 2），
        // 冒烟分叉（URL 带 smoke/fixture）在 startup 立即初始化后执行。仅浏览器环境
        // 触发；纯 TS 测试不触发。
        if (typeof window !== "undefined") {
            this.bootFlow?.launch().catch((error) => {
                this.logger?.error(
                    "[boot] flow launch failed",
                    undefined,
                    error instanceof Error ? error : undefined,
                );
            });
        }
    }

    openEntryPage(entry: GameEntryInfo): Promise<EntryPageHandle> {
        const lobbyHost = this.lobbyHost;
        if (lobbyHost === undefined) {
            throw new Error("lobby host: page adapter not ready");
        }
        return lobbyHost.openEntryPage(entry);
    }

    closeEntryPage(handle: EntryPageHandle): Promise<void> {
        const lobbyHost = this.lobbyHost;
        if (lobbyHost === undefined) {
            return Promise.resolve();
        }
        return lobbyHost.closeEntryPage(handle);
    }

    onDestroy(): void {
        this.adapter?.unbind();
        // 释放冒烟代理：清理冒烟交互钩子（闭包持有组件，常驻根销毁时一并释放）
        this.smoke?.dispose();
        this.smoke = undefined;
        this.bootFlow?.dispose();
        this.bootFlow = undefined;
        this.uiHost?.dispose();
        this.uiHost = undefined;
        this.sceneFlow?.dispose();
        this.lobbyHost?.dispose();
        this.lobbyHost = undefined;
        this.resourceProvider?.dispose();
        this.app?.dispose().catch(() => {
            // dispose 失败已由 Application 内部通过 context.logger 记录
        });
    }
}
