import FairyEditor = CS.FairyEditor;

/** 探针结果记录器：把每次探针的结构化结果追加写入 .objs/fgui-mcp-probe/，并在控制台输出摘要 */
export class ProbeResultWriter {
    private static resultsDir: string;
    private static resultsFile: string;

    private static ensurePaths(): void {
        if (this.resultsDir) return;
        const objsPath = FairyEditor.App.project ? FairyEditor.App.project.objsPath : "";
        this.resultsDir = objsPath + "/fgui-mcp-probe";
        this.resultsFile = this.resultsDir + "/probe-results.json";
        CS.System.IO.Directory.CreateDirectory(this.resultsDir);
    }

    /** 记录单条探针结果；同名 key 覆盖，保证可重复运行 */
    public static record(key: string, data: Record<string, unknown>): void {
        this.ensurePaths();
        const all = this.readAll();
        all[key] = Object.assign({ ts: new Date().toISOString() }, data);
        this.writeAll(all);
        const summary = data["status"] ?? "done";
        FairyEditor.App.consoleView.Log(`[fgui-mcp-probe][${key}] ${summary}`);
    }

    public static readAll(): Record<string, any> {
        this.ensurePaths();
        if (!CS.System.IO.File.Exists(this.resultsFile)) return {};
        try {
            const json = CS.System.IO.File.ReadAllText(this.resultsFile);
            return JSON.parse(json);
        } catch {
            return {};
        }
    }

    private static writeAll(all: Record<string, unknown>): void {
        CS.System.IO.File.WriteAllText(this.resultsFile, JSON.stringify(all, null, 2));
    }

    public static getResultsFile(): string {
        this.ensurePaths();
        return this.resultsFile;
    }
}

/** 控制台与结果双写日志 */
export function probeLog(msg: string): void {
    console.log(`[fgui-mcp-probe] ${msg}`);
    try {
        FairyEditor.App.consoleView.Log(`[fgui-mcp-probe] ${msg}`);
    } catch {
        /* 编辑器控制台不可用时仅 console 输出 */
    }
}

/** 捕获同步执行的异常并转为结构化的失败结果 */
export function safeRun<T>(key: string, fn: () => T): T | undefined {
    try {
        return fn();
    } catch (e: any) {
        ProbeResultWriter.record(key, {
            status: "error",
            error: String(e && e.message ? e.message : e),
            stack: String(e && e.stack ? e.stack : ""),
        });
        probeLog(`探针 ${key} 抛出异常: ${e && e.message ? e.message : e}`);
        return undefined;
    }
}
