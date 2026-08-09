"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHttpListenerProbe = runHttpListenerProbe;
exports.runFileMailboxProbe = runFileMailboxProbe;
const result_1 = require("../common/result");
function runHttpListenerProbe() {
    const HttpListener = CS.System.Net.HttpListener;
    const findFreePort = () => {
        const min = 49152;
        const max = 65535;
        for (let attempt = 0; attempt < 64; attempt++) {
            const port = min + Math.floor(Math.random() * (max - min));
            const probe = new HttpListener();
            try {
                probe.Prefixes.Add(`http://127.0.0.1:${port}/`);
                probe.Start();
                probe.Stop();
                probe.Close();
                return port;
            }
            catch {
                try {
                    probe.Close();
                }
                catch {
                }
            }
        }
        return 0;
    };
    const port = findFreePort();
    if (!port) {
        result_1.ProbeResultWriter.record("http-listener", { status: "error", error: "64 次端口探测均失败" });
        return;
    }
    const prefix = `http://127.0.0.1:${port}/`;
    const listener = new HttpListener();
    try {
        listener.Prefixes.Add(prefix);
        listener.Start();
        const isListening = listener.IsListening;
        (0, result_1.probeLog)(`HttpListener Start() 成功 port=${port} IsListening=${isListening}`);
        const WebClient = CS.System.Net.WebClient;
        const client = new WebClient();
        let callbackThreadIsEditorThread = null;
        let callbackEditorApiTouch = "";
        const callback = (ar) => {
            try {
                const name = CS.FairyEditor.App.project?.name;
                callbackEditorApiTouch = `ok:${name}`;
            }
            catch (e) {
                callbackEditorApiTouch = `error:${e && e.message ? e.message : e}`;
            }
            try {
                const context = listener.EndGetContext(ar);
                const response = context.Response;
                response.StatusCode = 200;
                response.Close();
            }
            catch (e) {
                callbackEditorApiTouch += `|respond-error:${e && e.message ? e.message : e}`;
            }
        };
        let roundTrip;
        try {
            const AsyncCallback = CS.System.AsyncCallback;
            listener.BeginGetContext(new AsyncCallback(callback), null);
            roundTrip = client.DownloadString(prefix + "ping");
        }
        catch (e) {
            roundTrip = `error:${e && e.message ? e.message : e}`;
        }
        finally {
            client.Dispose();
        }
        result_1.ProbeResultWriter.record("http-listener", {
            status: roundTrip === "" ? "pass" : "warn",
            isListening,
            port,
            prefix,
            roundTrip,
            callbackEditorApiTouch,
            note: "roundTrip 空串即 HTTP 200 空响应闭环成功；callbackEditorApiTouch 记录回调线程触碰编辑器 API 的成败",
        });
        (0, result_1.probeLog)(`HttpListener 请求-响应 roundTrip=${roundTrip === "" ? "200 ok" : roundTrip} 回调触碰编辑器API=${callbackEditorApiTouch}`);
    }
    catch (e) {
        result_1.ProbeResultWriter.record("http-listener", {
            status: "error",
            error: String(e && e.message ? e.message : e),
            stack: String(e && e.stack ? e.stack : ""),
            prefix,
        });
        (0, result_1.probeLog)(`HttpListener 异常: ${e && e.message ? e.message : e}`);
    }
    finally {
        try {
            listener.Stop();
            listener.Close();
        }
        catch {
        }
    }
}
function runFileMailboxProbe() {
    const File = CS.System.IO.File;
    const Directory = CS.System.IO.Directory;
    const objsPath = CS.FairyEditor.App.project?.objsPath || "";
    const mailboxDir = `${objsPath}/fgui-mcp-probe/mailbox`;
    const reqPath = `${mailboxDir}/req_test.json`;
    const respPath = `${mailboxDir}/resp_test.json`;
    try {
        Directory.CreateDirectory(mailboxDir);
        const payload = JSON.stringify({ id: 1, method: "ping", params: {} });
        File.WriteAllText(reqPath, payload);
        const readBack = File.ReadAllText(reqPath);
        const same = readBack === payload;
        File.WriteAllText(respPath, JSON.stringify({ id: 1, ok: true }));
        result_1.ProbeResultWriter.record("file-mailbox", {
            status: "pass",
            writeReadRoundTrip: same,
            mailboxDir,
        });
        (0, result_1.probeLog)(`文件邮箱读写闭环成功 roundTrip=${same}`);
    }
    catch (e) {
        result_1.ProbeResultWriter.record("file-mailbox", {
            status: "error",
            error: String(e && e.message ? e.message : e),
        });
    }
}
//# sourceMappingURL=http-listener.js.map