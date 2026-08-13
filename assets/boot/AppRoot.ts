import {
    _decorator,
    Component,
    director,
    sys,
} from "cc";
import { DEBUG } from "cc/env";
import {
    Application,
    lookupBundle,
    ServiceResolutionError,
    type IResourceProvider,
    type Logger,
    type SceneFlow,
} from "../framework";
import { CocosApplicationAdapter } from "../framework/adapters/cocos/application/CocosApplicationAdapter";
import type { GameEntryInfo } from "../game/lobby/catalog";
import type { EntryPageHandle } from "../game/lobby/host";
import type { GameListFlow } from "../game/lobby/list";
import {
    assembleApp,
    type AppAssembly,
    type GameModule,
} from "./assembly";
import { BUNDLES, getWindowSearch, isRuntimeEnvironment } from "./constants";
import type { UiHost } from "./host/UiHost";
import {
    createGameLobbyHost,
    type GameLobbyHostImpl,
} from "./host/GameLobbyHostImpl";
import {
    BOOTSTRAP_SCENE,
    createBootFlow,
    type BootFlow,
} from "./flow/BootFlow";
import {
    createSmokeProxy,
    type SmokeProxy,
} from "./smoke/SmokeProxy";
import { createIsDevEnabled } from "./dev/DevEnv";
import {
    setupDevOverlay,
    type DevOverlayRoot,
    type DevOverlaySetupHandle,
} from "./dev/DevOverlay";

const { ccclass } = _decorator;

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
    private listFlow?: GameListFlow;
    private smoke?: SmokeProxy;
    private bootFlow?: BootFlow;
    private logger?: Logger;
    private validateAssembly?: () => void;
    private isDevEnabled?: () => boolean;
    private devOverlay?: DevOverlaySetupHandle;

    onLoad(): void {
        const {
            app,
            adapter,
            sceneFlow,
            resourceProvider,
            logger,
            validateAssembly,
            uiHost,
        }: AppAssembly = assembleApp();
        this.app = app;
        this.adapter = adapter;
        this.sceneFlow = sceneFlow;
        this.resourceProvider = resourceProvider;
        this.logger = logger;
        this.validateAssembly = validateAssembly;
        // 组合根单一装配：消费 assembleApp 产出的已接线 uiHost（含 resolver/registrar），
        // 不在此重复装配；AppRoot 只持引用供 onDestroy 释放。
        this.uiHost = uiHost;
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
        // 启动编排器：场景映射经 getSceneMap 闭包动态读取（BOOTSTRAP_SCENE 为
        // 静态引导，game bundle 加载后其 sceneResources 可覆盖/扩展）；game 场景
        // 激活后经 onGameSceneActive 装配 game 模块列表流。isNative 探测原生平台
        // （Web 静默跳过热更阶段）；getSearch 供 URL 冒烟分派。
        this.bootFlow = createBootFlow({
            sceneFlow,
            uiHost: this.uiHost,
            lobbyHost: this.lobbyHost,
            smokeRouter: this.smoke.router,
            getSceneMap: () => {
                const gameModule = lookupBundle(BUNDLES.game) as
                    | GameModule
                    | undefined;
                return {
                    ...BOOTSTRAP_SCENE,
                    ...(gameModule?.sceneResources ?? {}),
                };
            },
            logger,
            isNative: () => sys.isNative === true,
            getSearch: getWindowSearch,
            onGameSceneActive: () => this.openGameListPage(),
        });
        // dev overlay 环境开关：仅 debug 构建初始化（release 下 `if (DEBUG)` 编译期
        // 折叠，为 bundler DCE 创造条件，dev 分支代码不进 release 产物）；cc/env
        // DEBUG 宏为主，URL ?dev=0/?dev=1 强制覆盖（design D2）。
        if (DEBUG) {
            this.isDevEnabled = createIsDevEnabled({
                ccDebug: DEBUG,
                search: getWindowSearch(),
            });
        }
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
        // 冒烟分叉（URL 带 smoke/fixture）在 startup 立即初始化后执行。仅运行时
        // 环境触发（浏览器有 window，Cocos 原生经 sys.isNative）；纯 TS 测试不触发。
        if (isRuntimeEnvironment(sys.isNative === true)) {
            this.bootFlow?.launch().catch((error) => {
                this.logger?.error(
                    "[boot] flow launch failed",
                    undefined,
                    error instanceof Error ? error : undefined,
                );
            });
        }
    }

    /** game 场景激活后经注册桥装配列表页流：组合根无 game 运行时依赖。 */
    private openGameListPage(): void {
        // 发起 dev overlay 挂载（与列表页并行，GRoot 未就绪由 setupDevOverlay 内部重试）
        this.setupDevOverlayIfEnabled();
        const gameModule = lookupBundle(BUNDLES.game) as GameModule | undefined;
        if (gameModule?.createListFlow === undefined) {
            this.logger?.warn(
                "[boot] game bundle list flow not registered; skipping list page open",
            );
            return;
        }
        if (this.lobbyHost === undefined || this.logger === undefined) {
            return;
        }
        this.listFlow = gameModule.createListFlow(this.lobbyHost, this.logger);
        this.listFlow.openListPageWithRetry();
    }

    /**
     * 按环境开关装配 dev overlay（薄转发）：组装逻辑（loadPackage/采样器/时钟/
     * 重试/竞态守卫）收敛到 dev 模块，AppRoot 只持句柄并在 onDestroy 释放。
     * dev 关闭或已装配时 no-op；overlay 常驻全局作用域（跨品类会话）。
     */
    private setupDevOverlayIfEnabled(): void {
        if (this.isDevEnabled === undefined || this.devOverlay !== undefined) {
            return;
        }
        if (this.uiHost === undefined || this.logger === undefined) {
            return;
        }
        const uiHost = this.uiHost;
        const appLogger = this.logger;
        this.devOverlay = setupDevOverlay({
            host: {
                // root 动态读取：GRoot 就绪由 setupDevOverlay 内部重试
                get root(): DevOverlayRoot | undefined {
                    return uiHost.root;
                },
                loadPackage: (bundle, path) =>
                    uiHost.loadPackage(bundle, path) ??
                    Promise.resolve({ state: "failed" }),
            },
            logger: appLogger,
            isDevEnabled: this.isDevEnabled,
        });
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
        // 释放 dev overlay：取消重试、停驱动、销毁控制器与视图（幂等）
        this.devOverlay?.dispose();
        this.devOverlay = undefined;
        // 释放冒烟代理：清理冒烟交互钩子（闭包持有组件，常驻根销毁时一并释放）
        this.smoke?.dispose();
        this.smoke = undefined;
        this.bootFlow?.dispose();
        this.bootFlow = undefined;
        this.listFlow?.dispose();
        this.listFlow = undefined;
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
