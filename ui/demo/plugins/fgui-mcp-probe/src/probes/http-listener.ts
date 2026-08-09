import { ProbeResultWriter, probeLog } from "../common/result";

/**
 * 探针 C：Puerts 下 HttpListener 可行性 + 回调线程模型。
 * 目标：验证插件能否启动本地 HTTP 服务并响应请求——这是 MCP 桥接主通道的技术基础。
 * 线程模型探测：WebClient.DownloadString 阻塞调用线程，若 BeginGetContext 回调能完成响应，
 * 证明回调运行在独立线程（非调用线程），进而验证"回调线程能否安全调用编辑器 API"。
 * 安全约束：仅绑定 127.0.0.1 + 高位随机端口；探测完成后立即 Stop/Close/Dispose。
 */
export function runHttpListenerProbe(): void {
    const HttpListener = (CS.System.Net.HttpListener as any) as { new (): any };

    // 候选端口：.NET HttpListener 不支持端口 0，必须显式端口。扫描高位随机端口，绑定失败则换下一个
    const findFreePort = (): number => {
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
            } catch {
                try {
                    probe.Close();
                } catch {
                    /* 忽略清理异常 */
                }
            }
        }
        return 0;
    };

    const port = findFreePort();
    if (!port) {
        ProbeResultWriter.record("http-listener", { status: "error", error: "64 次端口探测均失败" });
        return;
    }

    const prefix = `http://127.0.0.1:${port}/`;
    const listener: any = new HttpListener();

    try {
        listener.Prefixes.Add(prefix);
        listener.Start();
        const isListening = listener.IsListening;
        probeLog(`HttpListener Start() 成功 port=${port} IsListening=${isListening}`);

        // 主线程阻塞式发起请求；回调在独立线程响应
        const WebClient = (CS.System.Net.WebClient as any) as { new (): any };
        const client = new WebClient();
        let callbackThreadIsEditorThread: unknown = null;
        let callbackEditorApiTouch = "";

        const callback = (ar: any): void => {
            // 尝试在回调线程触碰编辑器 API，判定线程安全（包装异常，不影响主探测）
            try {
                const name = (CS.FairyEditor.App as any).project?.name;
                callbackEditorApiTouch = `ok:${name}`;
            } catch (e: any) {
                callbackEditorApiTouch = `error:${e && e.message ? e.message : e}`;
            }
            try {
                const context = listener.EndGetContext(ar);
                const response = context.Response;
                response.StatusCode = 200;
                response.Close();
            } catch (e: any) {
                callbackEditorApiTouch += `|respond-error:${e && e.message ? e.message : e}`;
            }
        };

        // 用 IAsyncResult 模式：BeginGetContext 不阻塞，回调在监听线程池执行
        let roundTrip: string;
        try {
            const AsyncCallback = CS.System.AsyncCallback as any;
            listener.BeginGetContext(new AsyncCallback(callback), null);
            roundTrip = client.DownloadString(prefix + "ping");
        } catch (e: any) {
            roundTrip = `error:${e && e.message ? e.message : e}`;
        } finally {
            client.Dispose();
        }

        ProbeResultWriter.record("http-listener", {
            status: roundTrip === "" ? "pass" : "warn",
            isListening,
            port,
            prefix,
            roundTrip,
            callbackEditorApiTouch,
            note: "roundTrip 空串即 HTTP 200 空响应闭环成功；callbackEditorApiTouch 记录回调线程触碰编辑器 API 的成败",
        });
        probeLog(`HttpListener 请求-响应 roundTrip=${roundTrip === "" ? "200 ok" : roundTrip} 回调触碰编辑器API=${callbackEditorApiTouch}`);
    } catch (e: any) {
        ProbeResultWriter.record("http-listener", {
            status: "error",
            error: String(e && e.message ? e.message : e),
            stack: String(e && e.stack ? e.stack : ""),
            prefix,
        });
        probeLog(`HttpListener 异常: ${e && e.message ? e.message : e}`);
    } finally {
        try {
            listener.Stop();
            listener.Close();
        } catch {
            /* 忽略清理异常 */
        }
    }
}

/**
 * 探针 D：文件邮箱模式可行性——MCP 写 requests/*.json、插件轮询处理写 responses/*.json。
 * 该模式不依赖网络栈，是 HttpListener 探针失败时的兜底通道。
 */
export function runFileMailboxProbe(): void {
    const File = CS.System.IO.File;
    const Directory = CS.System.IO.Directory;
    const objsPath = (CS.FairyEditor.App.project?.objsPath as string) || "";
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
        ProbeResultWriter.record("file-mailbox", {
            status: "pass",
            writeReadRoundTrip: same,
            mailboxDir,
        });
        probeLog(`文件邮箱读写闭环成功 roundTrip=${same}`);
    } catch (e: any) {
        ProbeResultWriter.record("file-mailbox", {
            status: "error",
            error: String(e && e.message ? e.message : e),
        });
    }
}
