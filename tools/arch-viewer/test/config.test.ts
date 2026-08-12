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
import type {
    ArchitectureConfig,
    HierarchyGroupConfig,
} from "../lib/config/types";
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

    test("复制并深层冻结普通可变配置输入", () => {
        const leafChildren = ["assets/boot/**"];
        const leaf = { id: "boot", label: "boot", children: leafChildren };
        const rootChildren = [leaf];
        const root = { id: "root", label: "root", children: rootChildren };
        const ruleTargets = ["boot"];
        const rule = { kind: "allow" as const, from: "root", to: ruleTargets };
        const rules = [rule];
        const entry = { name: "AppRoot::onLoad" };
        const phaseAnchor = { name: "assembleApp" };
        const phaseAnchors = [phaseAnchor];
        const startupPhase = { id: "assembly", anchors: phaseAnchors };
        const phases = [startupPhase];
        const branchFrom = { name: "AppRoot::start" };
        const branchAnchor = { name: "Application::start" };
        const branchAnchors = [branchAnchor];
        const startupBranch = {
            id: "application",
            from: branchFrom,
            anchors: branchAnchors,
        };
        const branches = [startupBranch];
        const laneAnchor = { name: "CloseDialog::bind" };
        const laneAnchors = [laneAnchor];
        const lane = { id: "view", anchors: laneAnchors };
        const lanes = [lane];
        const dataFlow = { id: "dialog", lanes };
        const dataFlows = [dataFlow];
        const resourceAnchor = { name: "UiHost::loadPackage" };
        const resourceAnchors = [resourceAnchor];
        const resource = { id: "ui", anchors: resourceAnchors };
        const resources = [resource];
        const input = {
            hierarchy: { root },
            dependencyRules: rules,
            startup: { entry, phases, branches },
            dataFlows,
            resources,
        } satisfies ArchitectureConfig;

        const config = defineArchitectureConfig(input);

        root.id = "changed-root";
        leaf.id = "changed-leaf";
        leafChildren.push("assets/game/**");
        rootChildren.length = 0;
        rule.from = "changed-rule";
        ruleTargets.push("root");
        rules.length = 0;
        entry.name = "changed-entry";
        startupPhase.id = "changed-phase";
        phaseAnchor.name = "changed-phase-anchor";
        phases.length = 0;
        startupBranch.id = "changed-branch";
        branchFrom.name = "changed-from";
        branchAnchor.name = "changed-branch-anchor";
        branches.length = 0;
        dataFlow.id = "changed-flow";
        lane.id = "changed-lane";
        laneAnchor.name = "changed-lane-anchor";
        dataFlows.length = 0;
        resource.id = "changed-resource";
        resourceAnchor.name = "changed-resource-anchor";
        resources.length = 0;

        expect(config.hierarchy.root.id).toBe("root");
        expect(config.hierarchy.root.children).toHaveLength(1);
        expect(config.dependencyRules[0]?.from).toBe("root");
        expect(config.dependencyRules[0]?.to).toEqual(["boot"]);
        expect(config.startup.entry.name).toBe("AppRoot::onLoad");
        expect(config.startup.phases[0]?.anchors[0]?.name).toBe("assembleApp");
        expect(config.startup.branches[0]?.from.name).toBe("AppRoot::start");
        expect(config.dataFlows[0]?.lanes[0]?.anchors[0]?.name).toBe(
            "CloseDialog::bind",
        );
        expect(config.resources[0]?.anchors[0]?.name).toBe("UiHost::loadPackage");

        const frozenValues = [
            config,
            config.hierarchy,
            config.hierarchy.root,
            config.hierarchy.root.children,
            config.hierarchy.root.children[0],
            config.dependencyRules,
            config.dependencyRules[0],
            config.dependencyRules[0]?.to,
            config.startup,
            config.startup.entry,
            config.startup.phases,
            config.startup.phases[0],
            config.startup.phases[0]?.anchors,
            config.startup.phases[0]?.anchors[0],
            config.startup.branches,
            config.startup.branches[0],
            config.startup.branches[0]?.from,
            config.startup.branches[0]?.anchors,
            config.startup.branches[0]?.anchors[0],
            config.dataFlows,
            config.dataFlows[0],
            config.dataFlows[0]?.lanes,
            config.dataFlows[0]?.lanes[0],
            config.dataFlows[0]?.lanes[0]?.anchors,
            config.dataFlows[0]?.lanes[0]?.anchors[0],
            config.resources,
            config.resources[0],
            config.resources[0]?.anchors,
            config.resources[0]?.anchors[0],
        ];
        expect(frozenValues.every((value) => Object.isFrozen(value))).toBe(true);
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
