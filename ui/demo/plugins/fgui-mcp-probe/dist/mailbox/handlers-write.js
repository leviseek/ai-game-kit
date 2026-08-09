"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInsertComponent = exports.handleRefreshProject = exports.handleRestorePublishSettings = exports.handleSwitchPublishSettings = void 0;
var FairyEditor = CS.FairyEditor;
const App = FairyEditor.App;
const READONLY_KEYS = new Set(["fileName"]);
const PUBLISH_SETTINGS_FIELDS = [
    "path", "branchPath", "fileExtension", "packageCount", "compressDesc", "binaryFormat",
    "jpegQuality", "compressPNG", "codeGeneration", "includeHighResolution", "branchProcessing",
    "seperatedAtlasForBranch", "atlasSetting", "include2x", "include3x", "include4x",
];
function snapshotSettings(obj) {
    const out = {};
    for (const key of PUBLISH_SETTINGS_FIELDS) {
        if (READONLY_KEYS.has(key))
            continue;
        const value = obj[key];
        if (value === undefined || typeof value === "function")
            continue;
        out[key] = value;
    }
    return out;
}
function applySettingsSnapshot(settings, snapshot) {
    for (const key of Object.keys(snapshot)) {
        if (READONLY_KEYS.has(key))
            continue;
        if (!(key in settings))
            continue;
        try {
            settings[key] = snapshot[key];
        }
        catch {
        }
    }
}
const handleSwitchPublishSettings = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const settings = project.GetSettings("Publish");
    if (!settings)
        throw new Error("读取发布设置失败（GetSettings('Publish') 为空）");
    const before = snapshotSettings(settings);
    const projectTypeBefore = project.type;
    const appliedKeys = [];
    const overrides = (params["settings"] ?? {});
    for (const key of Object.keys(overrides)) {
        if (READONLY_KEYS.has(key)) {
            throw new Error(`只读字段不可覆写: ${key}`);
        }
        if (!(key in settings))
            continue;
        try {
            settings[key] = overrides[key];
            appliedKeys.push(key);
        }
        catch {
        }
    }
    if (params["projectType"] !== undefined) {
        project.type = params["projectType"];
    }
    settings.Save();
    project.Save();
    const all = project.allPackages;
    for (let i = 0; i < all.Count; i++)
        all.get_Item(i).Open();
    return {
        appliedKeys,
        projectType: project.type,
        before: { settings: before, projectType: projectTypeBefore },
        sideEffects: ["包设置已刷新（allPackages.Open），编辑区会闪烁一下"],
    };
};
exports.handleSwitchPublishSettings = handleSwitchPublishSettings;
const handleRestorePublishSettings = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const settings = project.GetSettings("Publish");
    if (!settings)
        throw new Error("读取发布设置失败（GetSettings('Publish') 为空）");
    const snapshot = (params["snapshot"] ?? {});
    const projectType = params["projectType"];
    if (Object.keys(snapshot).length === 0)
        throw new Error("缺少回滚快照（snapshot）");
    applySettingsSnapshot(settings, snapshot);
    if (projectType !== undefined)
        project.type = projectType;
    settings.Save();
    project.Save();
    const all = project.allPackages;
    for (let i = 0; i < all.Count; i++)
        all.get_Item(i).Open();
    return {
        restored: true,
        projectType: project.type,
        sideEffects: ["包设置已刷新（allPackages.Open），编辑区会闪烁一下"],
    };
};
exports.handleRestorePublishSettings = handleRestorePublishSettings;
const handleRefreshProject = () => {
    if (!App.project)
        throw new Error("无打开工程");
    App.RefreshProject();
    return { refreshed: true };
};
exports.handleRefreshProject = handleRefreshProject;
const handleInsertComponent = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["component"];
    const targetDoc = params["doc"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 component（要插入的组件名，如 StartButton 或 StartButton.xml）");
    if (!targetDoc)
        throw new Error("缺少参数 doc（目标文档组件名，如 DemoView 或 DemoView.xml）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const insertItem = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!insertItem)
        throw new Error(`组件不存在: ${packageName}/${componentName}`);
    const insertUrl = insertItem.GetURL();
    const docItem = pkg.FindItemByName(targetDoc) || pkg.FindItemByName(`${targetDoc}.xml`);
    if (!docItem)
        throw new Error(`目标文档不存在: ${packageName}/${targetDoc}`);
    const docUrl = docItem.GetURL();
    const doc = App.docView.OpenDocument(docUrl, true);
    if (!doc)
        throw new Error(`打开文档失败: ${docUrl}`);
    if (App.docView.activeDoc !== doc) {
        App.docView.activeDoc = doc;
    }
    const opDoc = App.activeDoc || doc;
    const beforeChildren = opDoc.content ? opDoc.content.children.Count : -1;
    opDoc.UnselectAll();
    const inserted = opDoc.InsertObject(insertUrl, null, 0);
    const afterChildren = opDoc.content ? opDoc.content.children.Count : -1;
    opDoc.SetModified(true);
    const opDocIsActive = App.activeDoc === opDoc;
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
exports.handleInsertComponent = handleInsertComponent;
//# sourceMappingURL=handlers-write.js.map