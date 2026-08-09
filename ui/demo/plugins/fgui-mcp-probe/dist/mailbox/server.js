"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailboxServer = void 0;
exports.listToArray = listToArray;
class MailboxServer {
    requestsDir;
    responsesDir;
    handlers = new Map();
    pollIntervalMs;
    lastPollTime = 0;
    lastHeartbeatTime = 0;
    constructor(mailboxDir, pollIntervalMs = 300) {
        this.requestsDir = CS.System.IO.Path.Combine(mailboxDir, "requests");
        this.responsesDir = CS.System.IO.Path.Combine(mailboxDir, "responses");
        this.pollIntervalMs = pollIntervalMs;
    }
    register(method, handler) {
        this.handlers.set(method, handler);
    }
    tick() {
        const now = Date.now();
        if (now - this.lastPollTime < this.pollIntervalMs)
            return;
        this.lastPollTime = now;
        if (now - this.lastHeartbeatTime >= 30000) {
            this.lastHeartbeatTime = now;
            console.log(`[fgui-mcp-probe] tick alive t=${now}`);
        }
        this.processPending();
    }
    processPending() {
        const Directory = CS.System.IO.Directory;
        try {
            Directory.CreateDirectory(this.requestsDir);
            Directory.CreateDirectory(this.responsesDir);
        }
        catch {
            return;
        }
        let files;
        try {
            files = Directory.GetFiles(this.requestsDir, "*.json");
        }
        catch {
            return;
        }
        for (let i = 0; i < files.Length; i++) {
            this.processFile(files.get_Item(i));
        }
    }
    processFile(path) {
        const File = CS.System.IO.File;
        try {
            const raw = File.ReadAllText(path);
            const req = JSON.parse(raw);
            const handler = this.handlers.get(req.method);
            let resp;
            if (!handler) {
                resp = { id: req.id, ok: false, error: `未注册的方法: ${req.method}` };
            }
            else {
                try {
                    const result = handler(req.params ?? {});
                    resp = { id: req.id, ok: true, result };
                }
                catch (e) {
                    resp = { id: req.id, ok: false, error: String(e && e.message ? e.message : e) };
                }
            }
            const tmpPath = path + ".tmp";
            File.WriteAllText(tmpPath, JSON.stringify(resp));
            const respPath = CS.System.IO.Path.Combine(this.responsesDir, `${req.id}.json`);
            if (File.Exists(respPath))
                File.Delete(respPath);
            File.Move(tmpPath, respPath);
        }
        catch (e) {
            console.log(`[fgui-mcp-probe] 处理请求 ${path} 异常: ${e}`);
        }
        finally {
            try {
                File.Delete(path);
            }
            catch {
            }
        }
    }
}
exports.MailboxServer = MailboxServer;
function listToArray(list) {
    const out = [];
    if (!list)
        return out;
    for (let i = 0; i < list.Count; i++)
        out.push(list.get_Item(i));
    return out;
}
//# sourceMappingURL=server.js.map