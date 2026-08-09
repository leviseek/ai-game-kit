"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writePublishSignal = writePublishSignal;
var FairyEditor = CS.FairyEditor;
function writePublishSignal(payload) {
    const project = FairyEditor.App.project;
    if (!project)
        return "";
    const File = CS.System.IO.File;
    const dir = `${project.objsPath}/fgui-mcp-probe`;
    CS.System.IO.Directory.CreateDirectory(dir);
    const path = `${dir}/publish-signal.json`;
    const tmp = `${path}.tmp`;
    File.WriteAllText(tmp, JSON.stringify(payload));
    if (File.Exists(path))
        File.Delete(path);
    File.Move(tmp, path);
    return path;
}
//# sourceMappingURL=publish-signal.js.map