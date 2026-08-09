import FairyEditor = CS.FairyEditor;
import type { MailboxHandler } from "./server";

const App = FairyEditor.App;

/** 只读字段白名单：切换发布配置时禁止覆写（与 MenuMain_Publish.CopySetting 一致）。 */
const READONLY_KEYS = new Set(["fileName"]);

/** 递归拷贝可写字段；对象字段递归，标量直接赋值。 */
function copySetting(target: any, source: any): void {
    for (const key of Object.keys(source)) {
        if (READONLY_KEYS.has(key)) continue;
        if (!(key in target)) continue;
        const element = source[key];
        if (element === null || element === undefined) continue;
        if (typeof element === "object") {
            copySetting(target[key], element);
        } else {
            target[key] = element;
        }
    }
}

/** 深拷贝一个可序列化的设置快照（用于回滚）。 */
function snapshotSettings(obj: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        if (READONLY_KEYS.has(key)) continue;
        const value = obj[key];
        if (typeof value === "function") continue;
        out[key] = value;
    }
    return out;
}

/** 写入全局发布设置快照（可同时用于切换与回滚）。 */
function applySettingsSnapshot(settings: any, snapshot: Record<string, unknown>): void {
    for (const key of Object.keys(snapshot)) {
        if (READONLY_KEYS.has(key)) continue;
        if (!(key in settings)) continue;
        settings[key] = snapshot[key];
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

    // 应用参数覆盖（仅限参数中出现且非只读的字段）
    const appliedKeys: string[] = [];
    const overrides = (params["settings"] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(overrides)) {
        if (READONLY_KEYS.has(key)) {
            throw new Error(`只读字段不可覆写: ${key}`);
        }
        if (!(key in settings)) continue;
        settings[key] = overrides[key];
        appliedKeys.push(key);
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
