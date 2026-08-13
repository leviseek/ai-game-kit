import {
    Application,
    createSceneFlow,
    createServiceRegistry,
    createServiceToken,
    type IResourceProvider,
    type Logger,
    type Module,
    type SceneFlow,
    type SceneResources,
    type ServiceRegistry,
    type ServiceToken,
    type TimeSource,
    type FuiViewBindingRegistrar,
} from "../framework";
import { createApplicationContext } from "../framework/application/ApplicationContext";
import { WallClock } from "../framework/core/time/WallClock";
import { createFuiViewBinderRegistry } from "../framework/core/fui/FuiViewBinderRegistry";
import { ConsoleLogger } from "../framework/diagnostics/logging/ConsoleLogger";
import { CocosApplicationAdapter } from "../framework/adapters/cocos/application/CocosApplicationAdapter";
import { createCocosResourceProvider } from "../framework/adapters/cocos/resource/CocosResourceProvider";
import { createCocosSceneAdapter } from "../framework/adapters/cocos/scene/CocosSceneAdapter";
import { createCocosUiRoot, type CocosUiRoot } from "../framework/adapters/cocos/ui/CocosUiRoot";
import type { FuiObjectFactory } from "../framework/adapters/cocos/ui/FuiViewHost";
import type { GameLobbyHost } from "../game/lobby/host";
import type { GameListFlow } from "../game/lobby/list";
import { createUiHost, type UiHost } from "./host/UiHost";

/**
 * 组合根装配（composition root）：显式创建 Application/Adapter/场景流转/服务注册表/
 * UI 根宿主等全部基础设施，与 AppRoot 组件（生命周期编排）分离。业务 bundle 只经
 * 注册桥读取，不在此产生运行时依赖。
 */

/**
 * game bundle 模块描述符（boot 侧窄接口）：组合根只经注册桥读取，不做运行时
 * 依赖。sceneResources 供场景映射覆盖入口场景；createListFlow 装配列表页流。
 */
export interface GameModule {
    readonly sceneResources?: Readonly<Record<string, SceneResources>>;
    readonly createListFlow?: (host: GameLobbyHost, logger: Logger) => GameListFlow;
}

export function createModules(): readonly Module[] {
    return [];
}

// 装配前 token 校验：缺失 token 或解析期依赖循环抛 ServiceResolutionError，
// 使非法装配在 Application.start 前失败、不进入 running。
function validateRequiredTokens(registry: ServiceRegistry, requiredTokens: readonly ServiceToken<unknown>[]): void {
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
    /** 已接线的 UI 根宿主：组合根单一实例，AppRoot/BootFlow 共用，生命周期随 assembly。 */
    readonly uiHost: UiHost;
    /** Feature 安装接缝：运行时视图 binder 注册器（实例级，随 assembly 存续；resolver 为内部局部）。 */
    readonly fuiViewBindingRegistrar: FuiViewBindingRegistrar;
}

export function assembleApp(options: { fuiObjectFactory?: FuiObjectFactory } = {}): AppAssembly {
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
            logger.error("[smoke] scene flow error", undefined, error instanceof Error ? error : undefined);
        },
    });

    // UI 根宿主经 Adapter 工厂接入：fgui 类型不进入组合根，初始化时机由 BootFlow
    // 在引擎 ready 后（默认流程切 game 首次呈现 / 冒烟路径 startup）触发。
    const uiRoot = createCocosUiRoot();

    // 运行时视图 binder 注册表：实例级、事务式（见 fui-view-binding spec）。
    // 组合根创建单一 registry（同一实例同时实现 registrar 与 resolver），以 resolver
    // 接线 UiHost、以 registrar 暴露 Feature 安装接缝（Task 9）；resolver 保持本函数
    // 内部局部值，不进公共面。
    const binderRegistry = createFuiViewBinderRegistry();
    const uiHost = createUiHost({
        uiRoot,
        resourceProvider,
        logger,
        resolver: binderRegistry,
        // 仅测试覆盖对象创建；生产无参调用缺省用 UIPackage.createObject
        fuiObjectFactory: options.fuiObjectFactory,
    });

    return {
        app,
        adapter,
        sceneFlow,
        resourceProvider,
        uiRoot,
        logger,
        registry,
        validateAssembly,
        uiHost,
        fuiViewBindingRegistrar: binderRegistry,
    };
}
