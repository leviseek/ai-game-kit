"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailboxServer = exports.isDeferredResult = void 0;
exports.listToArray = listToArray;
const protocol_1 = require("./protocol");
Object.defineProperty(exports, "isDeferredResult", { enumerable: true, get: function () { return protocol_1.isDeferredResult; } });
const result_1 = require("../common/result");
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
    writeResponse(id, resp) {
        const File = CS.System.IO.File;
        try {
            CS.System.IO.Directory.CreateDirectory(this.responsesDir);
            const full = { id, ...resp };
            const tmp = CS.System.IO.Path.Combine(this.responsesDir, `${id}.json.tmp`);
            const target = CS.System.IO.Path.Combine(this.responsesDir, `${id}.json`);
            File.WriteAllText(tmp, JSON.stringify(full));
            if (File.Exists(target))
                File.Delete(target);
            File.Move(tmp, target);
        }
        catch (e) {
            console.log(`[fgui-mcp-probe] 写异步响应 ${id} 异常: ${e}`);
        }
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
        const t0 = Date.now();
        try {
            const raw = File.ReadAllText(path);
            const req = JSON.parse(raw);
            const handler = this.handlers.get(req.method);
            let resp;
            if (!handler) {
                resp = { id: req.id, ok: false, error: `未注册的方法: ${req.method}` };
                (0, result_1.probeLog)(`收到请求 method=${req.method} id=${req.id} → 未注册方法`);
            }
            else {
                try {
                    const params = Object.assign({}, req.params ?? {}, { __requestId: req.id });
                    const result = handler(params);
                    if ((0, protocol_1.isDeferredResult)(result)) {
                        (0, result_1.probeLog)(`收到请求 method=${req.method} id=${req.id} → 已受理（异步响应，${Date.now() - t0}ms）`);
                        return;
                    }
                    resp = { id: req.id, ok: true, result };
                    (0, result_1.probeLog)(`收到请求 method=${req.method} id=${req.id} → 已响应（${Date.now() - t0}ms）`);
                }
                catch (e) {
                    resp = { id: req.id, ok: false, error: String(e && e.message ? e.message : e) };
                    (0, result_1.probeLog)(`收到请求 method=${req.method} id=${req.id} → 异常: ${e && e.message ? e.message : e}`);
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