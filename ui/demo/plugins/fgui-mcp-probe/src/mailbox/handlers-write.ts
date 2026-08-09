import FairyEditor = CS.FairyEditor;
import type { MailboxHandler } from "./server";

const App = FairyEditor.App;

/** 只读字段白名单：切换发布配置时禁止覆写（与 MenuMain_Publish.CopySetting 一致）。 */
const READONLY_KEYS = new Set(["fileName"]);

/** 全局发布设置的可写字段（来自 editor.d.ts GlobalPublishSettings 声明）。 */
const PUBLISH_SETTINGS_FIELDS = [
    "path", "branchPath", "fileExtension", "packageCount", "compressDesc", "binaryFormat",
    "jpegQuality", "compressPNG", "codeGeneration", "includeHighResolution", "branchProcessing",
    "seperatedAtlasForBranch", "atlasSetting", "include2x", "include3x", "include4x",
] as const;

/** 深拷贝一个可序列化的设置快照（用于回滚）。obj 为 C# 对象时按声明字段读取。 */
function snapshotSettings(obj: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of PUBLISH_SETTINGS_FIELDS) {
        if (READONLY_KEYS.has(key)) continue;
        const value = obj[key];
        if (value === undefined || typeof value === "function") continue;
        out[key] = value;
    }
    return out;
}

/** 写入全局发布设置快照（可同时用于切换与回滚）。只读属性（如 codeGeneration/atlasSetting 嵌套对象）赋值失败时跳过，不中断整体。 */
function applySettingsSnapshot(settings: any, snapshot: Record<string, unknown>): void {
    for (const key of Object.keys(snapshot)) {
        if (READONLY_KEYS.has(key)) continue;
        if (!(key in settings)) continue;
        try {
            settings[key] = snapshot[key];
        } catch {
            /* 只读属性（C# getter）赋值失败，跳过该字段 */
        }
    }
}

/** 发布配置切换：应用参数中的字段覆盖 → Save → 设置工程类型 → Save → 刷新全部包设置。 */
export const handleSwitchPublishSettings: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const settings = project.GetSettings("Publish") as any;
    if (!settings) throw new Error("读取发布设置失败（GetSettings('Publish') 为空）");

    // 快照（用于返回给 MCP 侧留存回滚用）
    const before = snapshotSettings(settings);
    const projectTypeBefore = project.type;

    // 应用参数覆盖（仅限参数中出现且非只读的字段；只读属性赋值失败时跳过）
    const appliedKeys: string[] = [];
    const overrides = (params["settings"] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(overrides)) {
        if (READONLY_KEYS.has(key)) {
            throw new Error(`只读字段不可覆写: ${key}`);
        }
        if (!(key in settings)) continue;
        try {
            settings[key] = overrides[key];
            appliedKeys.push(key);
        } catch {
            /* 只读属性（C# getter）赋值失败，跳过该字段 */
        }
    }
    if (params["projectType"] !== undefined) {
        project.type = params["projectType"] as string;
    }

    settings.Save();
    project.Save();

    // 包设置刷新：包设置是"一开始就设置好的"，发布时才用全局配置，需 Open 刷新（MenuMain_Publish 注释）
    const all = project.allPackages;
    for (let i = 0; i < all.Count; i++) all.get_Item(i).Open();

    return {
        appliedKeys,
        projectType: project.type,
        before: { settings: before, projectType: projectTypeBefore },
        sideEffects: ["包设置已刷新（allPackages.Open），编辑区会闪烁一下"],
    };
};

/** 发布配置回滚：基于切换前快照恢复。 */
export const handleRestorePublishSettings: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const settings = project.GetSettings("Publish") as any;
    if (!settings) throw new Error("读取发布设置失败（GetSettings('Publish') 为空）");

    const snapshot = (params["snapshot"] ?? {}) as Record<string, unknown>;
    const projectType = params["projectType"] as string | undefined;
    if (Object.keys(snapshot).length === 0) throw new Error("缺少回滚快照（snapshot）");

    applySettingsSnapshot(settings, snapshot);
    if (projectType !== undefined) project.type = projectType;

    settings.Save();
    project.Save();
    const all = project.allPackages;
    for (let i = 0; i < all.Count; i++) all.get_Item(i).Open();

    return {
        restored: true,
        projectType: project.type,
        sideEffects: ["包设置已刷新（allPackages.Open），编辑区会闪烁一下"],
    };
};

/** 刷新工程（App.RefreshProject）：供写操作后编辑器感知源 XML/PNG 变更。 */
export const handleRefreshProject: MailboxHandler = () => {
    if (!App.project) throw new Error("无打开工程");
    App.RefreshProject();
    return { refreshed: true };
};

/**
 * 组件插入：FindItemByName → GetURL → OpenDocument(activate) → 激活校验 → InsertObject → SetModified。
 * 与 fguiPlugin EditorUtils.AddComponent 语义对齐，并吸收探针"前台未激活"教训。
 */
export const handleInsertComponent: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["component"] as string | undefined;
    const targetDoc = params["doc"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 component（要插入的组件名，如 StartButton 或 StartButton.xml）");
    if (!targetDoc) throw new Error("缺少参数 doc（目标文档组件名，如 DemoView 或 DemoView.xml）");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);

    const insertItem = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!insertItem) throw new Error(`组件不存在: ${packageName}/${componentName}`);
    const insertUrl = insertItem.GetURL();

    const docItem = pkg.FindItemByName(targetDoc) || pkg.FindItemByName(`${targetDoc}.xml`);
    if (!docItem) throw new Error(`目标文档不存在: ${packageName}/${targetDoc}`);
    const docUrl = docItem.GetURL();

    // 打开目标文档并激活
    const doc: any = App.docView.OpenDocument(docUrl, true);
    if (!doc) throw new Error(`打开文档失败: ${docUrl}`);

    // 强制激活（探针 v1 教训：插入可能落在非前台文档）
    if ((App.docView.activeDoc as any) !== doc) {
        App.docView.activeDoc = doc;
    }
    const opDoc: any = App.activeDoc || doc;

    const beforeChildren = opDoc.content ? opDoc.content.children.Count : -1;
    opDoc.UnselectAll();
    const inserted = opDoc.InsertObject(insertUrl, null, 0);
    const afterChildren = opDoc.content ? opDoc.content.children.Count : -1;
    opDoc.SetModified(true);

    const opDocIsActive = (App.activeDoc as any) === opDoc;
    return {
        inserted: inserted != null,
        insertUrl,
        docUrl,
        isModified: opDoc.isModified,
        childrenDelta: afterChildren - beforeChildren,
        opDocIsActive,
        visibleHint: opDocIsActive ? "已激活前台，应可见；请人工/截图确认" : "警告：操作对象非前台文档，插入可能不可见",
    };
};
