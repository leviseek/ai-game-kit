"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEnvProbe = runEnvProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runEnvProbe() {
    const App = FairyEditor.App;
    const project = App.project;
    const result = {
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
        const pkgs = [];
        const all = project.allPackages;
        for (let i = 0; i < all.Count; i++) {
            const pkg = all.get_Item(i);
            pkgs.push({ name: pkg.name, id: pkg.id, opened: pkg.opened });
        }
        result["packages"] = pkgs;
    }
    result_1.ProbeResultWriter.record("env", result);
    (0, result_1.probeLog)(`环境快照完成: project=${project ? project.name : "无"} type=${project ? project.type : "?"} branch=${project ? project.activeBranch : "?"}`);
}
//# sourceMappingURL=env.js.map