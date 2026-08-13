import { allow, branch, defineArchitectureConfig, deny, flow, group, lifecycle, phase, symbol } from "./lib/config/builders";

/**
 * 仓库级配置描述当前架构意图；未来增加 workspace 时扩展 hierarchy 与规则即可，
 * 扫描器和视图层不需要感知目录硬编码。
 */
const architectureConfig = defineArchitectureConfig({
    hierarchy: {
        root: group("repository", [
            group("assets", [
                group("boot", ["assets/boot/**"]),
                group("framework", [
                    group("framework-core", ["assets/framework/core/**"]),
                    group("framework-contracts", ["assets/framework/contracts/**"]),
                    group("framework-application", ["assets/framework/application/**"]),
                    group("framework-diagnostics", ["assets/framework/diagnostics/**"]),
                    group("framework-adapters", ["assets/framework/adapters/**"]),
                    group("framework-libs", ["assets/framework/libs/**"]),
                    group("framework-root", ["assets/framework/*.ts"]),
                ]),
                group("game", ["assets/game/**"]),
                group("samples", ["assets/samples/**"]),
                group("ui", ["assets/ui/**"]),
                group("audio", ["assets/audio/**"]),
                group("common", ["assets/common/**"]),
                group("game-content", ["assets/game-content/**"]),
                group("resources", ["assets/resources/**"]),
            ]),
            group("tools", [
                group("tool-creator", ["tools/creator/**"]),
                group("tool-fgui", ["tools/fgui/**"]),
                group("tool-fgui-mcp", ["tools/fgui-mcp/**"]),
                group("tool-arch-viewer", ["tools/arch-viewer/**"]),
            ]),
        ]),
    },
    dependencyRules: [
        allow("framework-core", ["framework-contracts"]),
        allow("framework-application", ["framework-contracts"]),
        allow("framework-adapters", ["framework-core", "framework-contracts"]),
        allow("boot", ["framework-application", "framework-adapters", "framework-core", "framework-contracts", "framework-diagnostics"]),
        deny("framework-contracts", ["boot", "game", "samples", "framework-application", "framework-adapters"]),
    ],
    startup: {
        entry: symbol("AppRoot::onLoad", "assets/boot/AppRoot.ts"),
        phases: [
            phase("assembly", [
                symbol("assembleApp", "assets/boot/assembly.ts"),
                symbol("createSceneFlow", "assets/framework/core/scene/SceneFlow.ts"),
                symbol("createBootFlow", "assets/boot/flow/BootFlow.ts"),
            ]),
        ],
        branches: [
            branch("application", symbol("AppRoot::start", "assets/boot/AppRoot.ts"), [symbol("Application::start", "assets/framework/application/Application.ts")]),
            branch("presentation", symbol("AppRoot::start", "assets/boot/AppRoot.ts"), [
                symbol("createBootFlow::launch", "assets/boot/flow/BootFlow.ts"),
                symbol("createSceneFlow::switchTo", "assets/framework/core/scene/SceneFlow.ts"),
                symbol("UiHost::init", "assets/boot/host/UiHost.ts"),
            ]),
        ],
    },
    dataFlows: [
        flow("close-dialog", [
            {
                id: "view-input",
                anchors: [symbol("CloseDialog::bind", "assets/samples/game_fui_demo/view/CloseDialog.ts"), symbol("CloseDialog::_handleConfirm", "assets/samples/game_fui_demo/view/CloseDialog.ts")],
            },
            {
                id: "state",
                anchors: [symbol("closeDialogReducer", "assets/samples/game_fui_demo/store.ts")],
            },
            {
                id: "projection",
                anchors: [symbol("projectCloseDialog", "assets/samples/game_fui_demo/store.ts"), symbol("CloseDialog::onState", "assets/samples/game_fui_demo/view/CloseDialog.ts")],
            },
        ]),
    ],
    resources: [
        lifecycle("global-ui-package", [symbol("UiHost::loadPackage", "assets/boot/host/UiHost.ts"), symbol("UiHost::release", "assets/boot/host/UiHost.ts")]),
        lifecycle("scene-flow", [
            symbol("createSceneFlow::preload", "assets/framework/core/scene/SceneFlow.ts"),
            symbol("createSceneFlow::switchTo", "assets/framework/core/scene/SceneFlow.ts"),
            symbol("createSceneFlow::currentFlowScope", "assets/framework/core/scene/SceneFlow.ts"),
        ]),
    ],
});

export default architectureConfig;
