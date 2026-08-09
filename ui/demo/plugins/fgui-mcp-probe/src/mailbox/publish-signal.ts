import FairyEditor = CS.FairyEditor;

/**
 * 发布信号邮箱：半自动发布闭环的「编辑器发布信号」证据源。
 * onPublishEnd 钩子把发布结果（包列表/时间戳/exportPath/isSuccess）写入
 * <objs>/fgui-mcp-probe/publish-signal.json，MCP 侧 fgui_check_publish 据此判定"发布动作已发生"。
 */

export interface PublishSignalPayload {
    readonly ok: boolean;
    readonly ts: string;
    readonly packages: string[];
    readonly exportPath: string;
    readonly isSuccess: boolean;
    /** 发布是否重定向到 scratch（true=未触碰真实产物，check_publish 应提示真实产物可能陈旧） */
    readonly redirectToScratch?: boolean;
}

/** 写入发布信号文件（内容先写 tmp 再改名，避免 MCP 侧读到半写文件）。 */
export function writePublishSignal(payload: PublishSignalPayload): string {
    const project = FairyEditor.App.project;
    if (!project) return "";
    const File = CS.System.IO.File;
    const dir = `${project.objsPath}/fgui-mcp-probe`;
    CS.System.IO.Directory.CreateDirectory(dir);
    const path = `${dir}/publish-signal.json`;
    const tmp = `${path}.tmp`;
    File.WriteAllText(tmp, JSON.stringify(payload));
    if (File.Exists(path)) File.Delete(path);
    File.Move(tmp, path);
    return path;
}
