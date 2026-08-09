"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCaptureProbe = runCaptureProbe;
var FairyEditor = CS.FairyEditor;
const result_1 = require("../common/result");
function runCaptureProbe() {
    const App = FairyEditor.App;
    const project = App.project;
    if (!project) {
        result_1.ProbeResultWriter.record("capture", { status: "blocked", reason: "无打开工程" });
        return;
    }
    const outDir = `${project.objsPath}/fgui-mcp-probe/capture`;
    try {
        CS.System.IO.Directory.CreateDirectory(outDir);
    }
    catch (e) {
        result_1.ProbeResultWriter.record("capture", { status: "error", error: `创建截图目录失败: ${e}` });
        return;
    }
    const outPng = `${outDir}/capture_getshot_${Date.now()}.png`;
    const mainResult = {};
    try {
        const activeDoc = App.activeDoc;
        if (!activeDoc)
            throw new Error("无活动文档");
        const content = activeDoc.content;
        if (!content)
            throw new Error("文档无 content");
        const displayObj = content.displayObject;
        if (!displayObj)
            throw new Error("文档 displayObject 为空");
        mainResult["doc"] = activeDoc.docURL;
        mainResult["contentSize"] = `${content.width}x${content.height}`;
        mainResult["displayObjSize"] = displayObj.width != null ? `${displayObj.width}x${displayObj.height}` : "unknown";
        const texture = displayObj.GetScreenShot(null, 1);
        if (!texture)
            throw new Error("GetScreenShot 返回空 Texture2D");
        mainResult["textureSize"] = `${texture.width}x${texture.height}`;
        const ImageConversion = CS.UnityEngine.ImageConversion;
        if (!ImageConversion || typeof ImageConversion.EncodeToPNG !== "function") {
            throw new Error("UnityEngine.ImageConversion.EncodeToPNG 不可用");
        }
        const pngBytes = ImageConversion.EncodeToPNG(texture);
        if (!pngBytes)
            throw new Error("EncodeToPNG 返回空");
        mainResult["pngBytesLength"] = Number(pngBytes.Length ?? 0);
        CS.System.IO.File.WriteAllBytes(outPng, pngBytes);
        const exists = CS.System.IO.File.Exists(outPng);
        mainResult["exists"] = exists;
        mainResult["sizeBytes"] = exists ? Number(new CS.System.IO.FileInfo(outPng).Length) : 0;
        try {
            CS.UnityEngine.Object.Destroy(texture);
        }
        catch {
        }
        (0, result_1.probeLog)(`GetScreenShot 截图 ${outPng} exists=${exists} bytes=${mainResult["sizeBytes"]}`);
    }
    catch (e) {
        mainResult["error"] = String(e && e.message ? e.message : e);
    }
    const works = mainResult["exists"] === true && mainResult["sizeBytes"] > 0;
    result_1.ProbeResultWriter.record("capture", {
        status: works ? "pass" : "fail",
        mainResult,
        conclusion: works
            ? "doc.content.displayObject.GetScreenShot + EncodeToPNG 可用，fgui_capture_preview 用此实现"
            : `GetScreenShot 截图不可用: ${mainResult["error"] ?? "未知原因"}`,
    });
}
//# sourceMappingURL=capture.js.map