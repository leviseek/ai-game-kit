import { describe, expect, test } from "bun:test";

import architectureConfig from "../architecture.config";
import {
    allow,
    branch,
    defineArchitectureConfig,
    flow,
    group,
    lifecycle,
    phase,
    symbol,
} from "../lib/config/builders";
import type { HierarchyGroupConfig } from "../lib/config/types";
import { validateArchitectureConfig } from "../lib/config/validate";

function collectPatterns(root: HierarchyGroupConfig): readonly string[] {
    return root.children.flatMap((child) =>
        typeof child === "string" ? [child] : collectPatterns(child),
    );
}

describe("architecture config", () => {
    test("拒绝重复 group、未知依赖 group 与无原因例外", () => {
        const config = defineArchitectureConfig({
            hierarchy: {
                root: group("root", [
                    group("a", ["assets/a/**"]),
                    group("a", ["assets/b/**"]),
                ]),
            },
            dependencyRules: [
                allow("a", ["missing"], { exception: true, reason: "" }),
            ],
            startup: {
                entry: symbol("AppRoot::onLoad", "assets/boot/AppRoot.ts"),
                phases: [],
                branches: [],
            },
            dataFlows: [],
            resources: [],
        });

        expect(validateArchitectureConfig(config).map((item) => item.rule)).toEqual([
            "config.duplicate-group",
            "config.unknown-group",
            "config.exception-reason",
        ]);
    });

    test("拒绝未声明 reason 的依赖例外", () => {
        const config = defineArchitectureConfig({
            hierarchy: { root: group("root", [group("boot", ["assets/boot/**"])]) },
            dependencyRules: [allow("boot", ["root"], { exception: true })],
            startup: {
                entry: symbol("AppRoot::onLoad"),
                phases: [],
                branches: [],
            },
            dataFlows: [],
            resources: [],
        });

        expect(validateArchitectureConfig(config).map((item) => item.rule)).toEqual([
            "config.exception-reason",
        ]);
    });

    test("拒绝空 branch、重复 lane 与空锚点名", () => {
        const start = symbol("AppRoot::start", "assets/boot/AppRoot.ts");
        const config = defineArchitectureConfig({
            hierarchy: { root: group("root", [group("boot", ["assets/boot/**"])]) },
            dependencyRules: [],
            startup: {
                entry: symbol("AppRoot::onLoad", "assets/boot/AppRoot.ts"),
                phases: [phase("assembly", [symbol("")])],
                branches: [branch("presentation", start, [])],
            },
            dataFlows: [
                flow("dialog", [
                    { id: "view", anchors: [symbol("CloseDialog::bind")] },
                    { id: "view", anchors: [symbol("CloseDialog::onState")] },
                ]),
            ],
            resources: [lifecycle("ui", [symbol("UiHost::loadPackage"), symbol(" ")])],
        });

        expect(validateArchitectureConfig(config).map((item) => item.rule)).toEqual([
            "config.empty-branch",
            "config.duplicate-lane",
            "config.empty-anchor",
            "config.empty-anchor",
        ]);
    });

    test("builder 深层冻结配置对象", () => {
        const config = defineArchitectureConfig({
            hierarchy: { root: group("root", [group("boot", ["assets/boot/**"])]) },
            dependencyRules: [],
            startup: {
                entry: symbol("AppRoot::onLoad"),
                phases: [phase("assembly", [symbol("assembleApp")])],
                branches: [
                    branch("application", symbol("AppRoot::start"), [
                        symbol("Application::start"),
                    ]),
                ],
            },
            dataFlows: [],
            resources: [],
        });

        expect(Object.isFrozen(config)).toBe(true);
        expect(Object.isFrozen(config.startup)).toBe(true);
        expect(Object.isFrozen(config.startup.phases)).toBe(true);
        expect(Object.isFrozen(config.startup.phases[0]?.anchors)).toBe(true);
        expect(Object.isFrozen(config.hierarchy.root.children)).toBe(true);
    });

    test("真实配置覆盖仓库边界并保持真实启动分支", () => {
        const patterns = collectPatterns(architectureConfig.hierarchy.root);
        const application = architectureConfig.startup.branches.find(
            (item) => item.id === "application",
        );
        const presentation = architectureConfig.startup.branches.find(
            (item) => item.id === "presentation",
        );

        expect(validateArchitectureConfig(architectureConfig)).toEqual([]);
        expect(patterns).toEqual(
            expect.arrayContaining([
                "assets/boot/**",
                "assets/framework/core/**",
                "assets/framework/contracts/**",
                "assets/framework/application/**",
                "assets/framework/diagnostics/**",
                "assets/framework/adapters/**",
                "assets/framework/libs/**",
                "assets/framework/*.ts",
                "assets/game/**",
                "assets/samples/**",
                "assets/ui/**",
                "assets/audio/**",
                "assets/common/**",
                "assets/game-content/**",
                "assets/resources/**",
                "tools/creator/**",
                "tools/fgui/**",
                "tools/fgui-mcp/**",
                "tools/arch-viewer/**",
            ]),
        );
        expect(architectureConfig.startup.entry.name).toBe("AppRoot::onLoad");
        expect(application?.from.name).toBe("AppRoot::start");
        expect(application?.anchors.map((item) => item.name)).toContain(
            "Application::start",
        );
        expect(presentation?.from.name).toBe("AppRoot::start");
        expect(presentation?.anchors.map((item) => item.name)).toEqual([
            "createBootFlow::launch",
            "createSceneFlow::switchTo",
            "UiHost::init",
        ]);
    });
});
