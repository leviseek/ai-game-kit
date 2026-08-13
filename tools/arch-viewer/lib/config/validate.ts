import type { Diagnostic } from "../graph/types";
import type {
    ArchitectureConfig,
    HierarchyGroupConfig,
    SymbolRef,
} from "./types";

type ConfigDiagnostic = Diagnostic & { readonly rule: string };

/**
 * 纯校验只检查无需文件清单即可确定的结构错误。文件 ownership overlap 留给
 * Analyzer 在扫描完成后处理；未来结构规则可继续按稳定顺序追加到此管线。
 */
export function validateArchitectureConfig(
    config: ArchitectureConfig,
): readonly ConfigDiagnostic[] {
    const diagnostics: ConfigDiagnostic[] = [];
    const groupIds = new Set<string>();

    visitGroups(config.hierarchy.root, (group) => {
        if (groupIds.has(group.id)) {
            diagnostics.push(error(
                "config.duplicate-group",
                `Hierarchy group id is duplicated: ${group.id}`,
                group.id,
            ));
            return;
        }
        groupIds.add(group.id);
    });

    for (const rule of config.dependencyRules) {
        for (const groupId of [rule.from, ...rule.to]) {
            if (!groupIds.has(groupId)) {
                diagnostics.push(error(
                    "config.unknown-group",
                    `Dependency rule references unknown group: ${groupId}`,
                    groupId,
                ));
            }
        }
        if (rule.exception === true && (rule.reason === undefined || rule.reason.trim() === "")) {
            diagnostics.push(error(
                "config.exception-reason",
                "Dependency exception requires a non-empty reason",
                rule.from,
            ));
        }
    }

    for (const item of config.startup.branches) {
        if (item.anchors.length === 0) {
            diagnostics.push(error(
                "config.empty-branch",
                `Startup branch has no anchors: ${item.id}`,
                item.id,
            ));
        }
    }

    for (const item of config.dataFlows) {
        const laneIds = new Set<string>();
        for (const lane of item.lanes) {
            if (laneIds.has(lane.id)) {
                diagnostics.push(error(
                    "config.duplicate-lane",
                    `Semantic flow lane id is duplicated: ${lane.id}`,
                    item.id,
                ));
            }
            laneIds.add(lane.id);
        }
    }

    for (const anchor of allAnchors(config)) {
        if (anchor.name.trim() === "") {
            diagnostics.push(error(
                "config.empty-anchor",
                "Architecture anchor name must not be empty",
                anchor.file,
            ));
        }
    }

    return Object.freeze(diagnostics);
}

function visitGroups(
    group: HierarchyGroupConfig,
    visit: (item: HierarchyGroupConfig) => void,
): void {
    visit(group);
    for (const child of group.children) {
        if (typeof child !== "string") {
            visitGroups(child, visit);
        }
    }
}

function allAnchors(config: ArchitectureConfig): readonly SymbolRef[] {
    return [
        config.startup.entry,
        ...config.startup.phases.flatMap((item) => item.anchors),
        ...config.startup.branches.flatMap((item) => [item.from, ...item.anchors]),
        ...config.dataFlows.flatMap((item) =>
            item.lanes.flatMap((lane) => lane.anchors),
        ),
        ...config.resources.flatMap((item) => item.anchors),
    ];
}

function error(rule: string, message: string, source?: string): ConfigDiagnostic {
    return Object.freeze({ severity: "error", rule, message, source });
}
