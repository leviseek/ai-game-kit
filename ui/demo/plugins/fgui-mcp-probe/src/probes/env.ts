import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/** 探针 0：环境快照——编辑器版本、工程类型、活动分支、包清单。无副作用，任何阶段可安全执行 */
export function runEnvProbe(): void {
    const App = FairyEditor.App;
    const project = App.project;
    const result: Record<string, unknown> = {
        status: "ok",
        isMacOS: App.isMacOS,
        editorLanguage: App.language,
        batchMode: App.batchMode,
        projectName: project ? project.name : null,
        projectType: project ? project.type : null,
        activeBranch: project ? project.activeBranch : null,
        allBranches: project ? project.allBranches : null,
        packages: [],
    };

    if (project) {
        const pkgs: unknown[] = [];
        const all = project.allPackages;
        for (let i = 0; i < all.Count; i++) {
            const pkg = all.get_Item(i);
            pkgs.push({ name: pkg.name, id: pkg.id, opened: pkg.opened });
        }
        result["packages"] = pkgs;
    }

    ProbeResultWriter.record("env", result);
    probeLog(`环境快照完成: project=${project ? project.name : "无"} type=${project ? project.type : "?"} branch=${project ? project.activeBranch : "?"}`);
}
