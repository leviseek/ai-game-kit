"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProbeResultWriter = void 0;
exports.probeLog = probeLog;
exports.safeRun = safeRun;
var FairyEditor = CS.FairyEditor;
class ProbeResultWriter {
    static resultsDir;
    static resultsFile;
    static ensurePaths() {
        if (this.resultsDir)
            return;
        const objsPath = FairyEditor.App.project ? FairyEditor.App.project.objsPath : "";
        this.resultsDir = objsPath + "/fgui-mcp-probe";
        this.resultsFile = this.resultsDir + "/probe-results.json";
        CS.System.IO.Directory.CreateDirectory(this.resultsDir);
    }
    static record(key, data) {
        this.ensurePaths();
        const all = this.readAll();
        all[key] = Object.assign({ ts: new Date().toISOString() }, data);
        this.writeAll(all);
        const summary = data["status"] ?? "done";
        FairyEditor.App.consoleView.Log(`[fgui-mcp-probe][${key}] ${summary}`);
    }
    static readAll() {
        this.ensurePaths();
        if (!CS.System.IO.File.Exists(this.resultsFile))
            return {};
        try {
            const json = CS.System.IO.File.ReadAllText(this.resultsFile);
            return JSON.parse(json);
        }
        catch {
            return {};
        }
    }
    static writeAll(all) {
        CS.System.IO.File.WriteAllText(this.resultsFile, JSON.stringify(all, null, 2));
    }
    static getResultsFile() {
        this.ensurePaths();
        return this.resultsFile;
    }
}
exports.ProbeResultWriter = ProbeResultWriter;
function probeLog(msg) {
    try {
        FairyEditor.App.consoleView.Log(`[fgui-mcp-probe] ${msg}`);
    }
    catch {
        console.log(`[fgui-mcp-probe] ${msg}`);
    }
}
function safeRun(key, fn) {
    try {
        return fn();
    }
    catch (e) {
        ProbeResultWriter.record(key, {
            status: "error",
            error: String(e && e.message ? e.message : e),
            stack: String(e && e.stack ? e.stack : ""),
        });
        probeLog(`探针 ${key} 抛出异常: ${e && e.message ? e.message : e}`);
        return undefined;
    }
}
//# sourceMappingURL=result.js.map