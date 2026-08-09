import FairyEditor = CS.FairyEditor;
import { ProbeResultWriter, probeLog } from "../common/result";

/**
 * 探针 D4：编辑器截图采集能力实机行为（FairyGUI 官方方案）。
 * 参考 FairyGUI-MCP（git-clone）实测路径：doc.content.displayObject.GetScreenShot(extend, scale)
 * → Texture2D.EncodeToPNG() → File.WriteAllBytes。editor.d.ts 已声明 GetScreenShot（L12622），
 * EncodeToPNG 未声明但为 Unity 原生 Texture2D 方法（运行时可用，以 any 访问）。
 * 安全约束：只读操作，截图写 .objs/fgui-mcp-probe/ 临时目录；不触碰真实产物。
 * 记录项：GetScreenShot 返回 Texture2D、EncodeToPNG 字节数、PNG 文件存在与大小。
 */
export function runCaptureProbe(): void {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        ProbeResultWriter.record("capture", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const outDir = `${project.objsPath}/fgui-mcp-probe/capture`;
    try {
        CS.System.IO.Directory.CreateDirectory(outDir);
    } catch (e: any) {
        ProbeResultWriter.record("capture", { status: "error", error: `创建截图目录失败: ${e}` });
        return;
    }

    // 主路径：doc.content.displayObject.GetScreenShot → EncodeToPNG → WriteAllBytes
    const outPng = `${outDir}/capture_getshot_${Date.now()}.png`;
    const mainResult: Record<string, unknown> = {};
    try {
        const activeDoc = App.activeDoc as any;
        if (!activeDoc) throw new Error("无活动文档");
        const content = activeDoc.content as any;
        if (!content) throw new Error("文档无 content");
        const displayObj = content.displayObject as any;
        if (!displayObj) throw new Error("文档 displayObject 为空");

        mainResult["doc"] = activeDoc.docURL;
        mainResult["contentSize"] = `${content.width}x${content.height}`;
        mainResult["displayObjSize"] = displayObj.width != null ? `${displayObj.width}x${displayObj.height}` : "unknown";

        const texture = displayObj.GetScreenShot(null, 1);
        if (!texture) throw new Error("GetScreenShot 返回空 Texture2D");
        mainResult["textureSize"] = `${texture.width}x${texture.height}`;

        // EncodeToPNG 用 UnityEngine.ImageConversion 静态方法（FairyGUI-MCP 实测路径；d.ts 未声明，以 any 访问）
        const ImageConversion = (CS.UnityEngine as any).ImageConversion;
        if (!ImageConversion || typeof ImageConversion.EncodeToPNG !== "function") {
            throw new Error("UnityEngine.ImageConversion.EncodeToPNG 不可用");
        }
        const pngBytes: any = ImageConversion.EncodeToPNG(texture);
        if (!pngBytes) throw new Error("EncodeToPNG 返回空");
        // .Length 是 C# long → Puerts BigInt，JSON.stringify 无法序列化，须转 Number
        mainResult["pngBytesLength"] = Number(pngBytes.Length ?? 0);

        CS.System.IO.File.WriteAllBytes(outPng, pngBytes);
        const exists = CS.System.IO.File.Exists(outPng);
        mainResult["exists"] = exists;
        mainResult["sizeBytes"] = exists ? Number(new CS.System.IO.FileInfo(outPng).Length) : 0;
        try {
            CS.UnityEngine.Object.Destroy(texture);
        } catch {
            /* 释放失败不影响结论 */
        }
        probeLog(`GetScreenShot 截图 ${outPng} exists=${exists} bytes=${mainResult["sizeBytes"]}`);
    } catch (e: any) {
        mainResult["error"] = String(e && e.message ? e.message : e);
    }

    const works = mainResult["exists"] === true && (mainResult["sizeBytes"] as number) > 0;
    ProbeResultWriter.record("capture", {
        status: works ? "pass" : "fail",
        mainResult,
        conclusion: works
            ? "doc.content.displayObject.GetScreenShot + EncodeToPNG 可用，fgui_capture_preview 用此实现"
            : `GetScreenShot 截图不可用: ${mainResult["error"] ?? "未知原因"}`,
    });
}
