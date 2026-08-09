"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleClearLogs = exports.handleCloseDocument = exports.handleSelectElement = exports.handleShowPreview = exports.handleOpenComponent = exports.handleSwitchBranch = exports.handleListBranches = exports.handleCopyItems = exports.handleCreateComponent = exports.handleDeleteResource = exports.handleMoveResource = exports.handleRenameResource = exports.handleCreateFolder = exports.handleDeletePackage = exports.handleCreatePackage = exports.handleRemoveRelation = exports.handleSetRelation = exports.handleSwitchPage = exports.handleRemoveController = exports.handleUpdateController = exports.handleAddController = exports.handleSetObjectProperty = exports.handleDeleteChild = exports.handleAddChild = exports.handleInsertComponent = exports.handleSaveDocuments = exports.handleRefreshProject = exports.handleRestorePublishSettings = exports.handleSwitchPublishSettings = exports.handleReloadPackage = void 0;
exports.assertForbiddenObjectType = assertForbiddenObjectType;
exports.saveAllDocuments = saveAllDocuments;
exports.createImportResourceHandler = createImportResourceHandler;
exports.isValidSidePair = isValidSidePair;
exports.createCapturePreviewHandler = createCapturePreviewHandler;
var FairyEditor = CS.FairyEditor;
const App = FairyEditor.App;
const READONLY_KEYS = new Set(["fileName"]);
const FORBIDDEN_OBJECT_TYPES = new Set(["graph"]);
function assertForbiddenObjectType(type) {
    if (FORBIDDEN_OBJECT_TYPES.has(type.toLowerCase())) {
        throw new Error(`禁止创建/修改 ${type} 对象：项目禁止 <graph> 节点，纯色视觉必须用 sprite 图片（bun run fgui sprite）生成像素图并以 <image> 引用`);
    }
}
function openDocForWrite(pkg, componentName) {
    const item = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!item)
        throw new Error(`组件不存在: ${pkg.name}/${componentName}`);
    const url = item.GetURL();
    const doc = App.docView.OpenDocument(url, true);
    if (!doc)
        throw new Error(`打开文档失败: ${url}`);
    if (App.docView.activeDoc !== doc) {
        App.docView.activeDoc = doc;
    }
    return { doc, url };
}
function findObjectInDoc(doc, idOrName) {
    const content = doc.content;
    if (!content)
        throw new Error("文档无 content");
    return content.GetChildById(idOrName) || content.GetChild(idOrName);
}
function findResourceItem(pkg, ref) {
    return pkg.GetItem(ref)
        || pkg.FindItemByName(ref)
        || pkg.FindItemByName(`${ref}.xml`)
        || pkg.GetItemByFileName(null, ref)
        || pkg.GetItemByFileName(null, `${ref}.png`)
        || pkg.GetItemByFileName(null, `${ref}.jpg`);
}
const handleReloadPackage = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    if (params["full"] === true) {
        App.RefreshProject();
        return { reloaded: true, full: true, message: "已全量刷新工程（App.RefreshProject）" };
    }
    const packageName = params["package"];
    if (!packageName)
        throw new Error("缺少参数 package");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const methodsSucceeded = [];
    const methodsFailed = [];
    try {
        pkg.Touch();
        methodsSucceeded.push("pkg.Touch()");
    }
    catch (e) {
        methodsFailed.push(`pkg.Touch()(${e && e.message ? e.message : e})`);
    }
    try {
        const items = pkg.items;
        let touched = 0;
        if (items) {
            for (let i = 0; i < items.Count; i++) {
                const it = items.get_Item(i);
                try {
                    if (it && typeof it.Touch === "function") {
                        it.Touch();
                        touched++;
                    }
                }
                catch {
                }
            }
        }
        methodsSucceeded.push(`item.Touch() x${touched}`);
    }
    catch (e) {
        methodsFailed.push(`item.Touch()(${e && e.message ? e.message : e})`);
    }
    try {
        CS.FairyGUI.Timers.inst.Add(0.2, 1, () => {
            try {
                pkg.Touch();
            }
            catch {
            }
        });
        methodsSucceeded.push("delayed pkg.Touch()");
    }
    catch (e) {
        methodsFailed.push(`delayed pkg.Touch()(${e && e.message ? e.message : e})`);
    }
    return {
        reloaded: methodsSucceeded.length > 0,
        package: packageName,
        methodsSucceeded,
        methodsFailed,
        note: "已标记包刷新，编辑器应在下一帧感知源 XML/PNG 变更",
    };
};
exports.handleReloadPackage = handleReloadPackage;
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
function saveAllDocuments() {
    if (!App.project)
        throw new Error("无打开工程");
    const docView = App.docView;
    const hadUnsaved = docView.HasUnsavedDocuments ? docView.HasUnsavedDocuments() : false;
    const saved = hadUnsaved ? 1 : 0;
    if (hadUnsaved) {
        docView.SaveAllDocuments();
        if (docView.HasUnsavedDocuments()) {
            throw new Error("存在未保存文档且 SaveAllDocuments 未能全部保存，请人工处理");
        }
    }
    return { saved, hadUnsaved };
}
const handleSaveDocuments = (params) => {
    if (!App.project)
        throw new Error("无打开工程");
    const docView = App.docView;
    const mode = params["mode"];
    if (mode === "active") {
        const doc = docView.activeDoc;
        if (!doc)
            throw new Error("无活动文档可保存");
        docView.SaveDocument(doc);
        return { mode, saved: [doc.docURL], isModified: doc.isModified };
    }
    const result = saveAllDocuments();
    return { mode: "all", ...result };
};
exports.handleSaveDocuments = handleSaveDocuments;
function createImportResourceHandler(server) {
    return (params) => {
        const project = App.project;
        if (!project)
            throw new Error("无打开工程");
        const packageName = params["package"];
        const files = params["files"];
        if (!packageName)
            throw new Error("缺少参数 package");
        if (!Array.isArray(files) || files.length === 0)
            throw new Error("缺少参数 files（至少一个文件路径）");
        for (const f of files) {
            if (!CS.System.IO.File.Exists(f)) {
                throw new Error(`文件不存在: ${f}`);
            }
        }
        const pkg = project.GetPackageByName(packageName);
        if (!pkg)
            throw new Error(`包不存在: ${packageName}`);
        const targetPath = params["path"] ?? "/";
        const resName = params["resName"];
        const reqId = params["__requestId"];
        if (!reqId)
            throw new Error("缺少请求 id（内部错误）");
        const queue = FairyEditor.ResourceImportQueue.Create(pkg);
        for (const file of files) {
            queue.Add(file, targetPath, resName);
        }
        try {
            queue.Process((items) => {
                const imported = [];
                const failed = [];
                if (items) {
                    for (let i = 0; i < items.Count; i++) {
                        const item = items.get_Item(i);
                        if (item) {
                            imported.push({ id: item.id, name: item.name, path: item.path, type: item.type });
                        }
                    }
                }
                pkg.Save();
                server.writeResponse(reqId, {
                    ok: true,
                    result: {
                        package: packageName,
                        requested: files.length,
                        importedCount: imported.length,
                        imported,
                        failed,
                        note: "部分失败项已列在 failed（成功项保持已登记，不整体回滚）",
                    },
                });
            });
        }
        catch (e) {
            server.writeResponse(reqId, { ok: false, error: String(e && e.message ? e.message : e) });
        }
        return { deferred: true, id: reqId };
    };
}
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
const handleAddChild = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const type = params["type"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc（目标文档组件名）");
    if (!type)
        throw new Error("缺少参数 type（对象类型）");
    assertForbiddenObjectType(type);
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const content = doc.content;
    if (!content)
        throw new Error("文档无 content");
    const src = params["src"];
    let item = null;
    if (src && (type === "image" || type === "component" || type === "loader")) {
        item = findResourceItem(pkg, src);
        if (!item)
            throw new Error(`资源不存在: ${packageName}/${src}（可按 id/name/文件名引用）`);
    }
    const index = params["index"];
    const beforeChildren = content.children ? content.children.Count : -1;
    let added;
    if (item) {
        doc.UnselectAll();
        added = doc.InsertObject(item.GetURL(), null, index ?? 0);
    }
    else {
        const obj = FairyEditor.FObjectFactory.NewObject(pkg, type);
        if (!obj)
            throw new Error(`FObjectFactory 创建对象失败: ${type}`);
        const name = params["name"];
        if (name)
            obj.name = name;
        added = index !== undefined && index >= 0 ? content.AddChildAt(obj, index) : content.AddChild(obj);
    }
    const name = params["name"];
    if (name && added && added.name !== name) {
        try {
            added.name = name;
        }
        catch {
        }
    }
    const afterChildren = content.children ? content.children.Count : -1;
    doc.SetModified(true);
    return {
        added: added != null,
        id: added ? added.id : null,
        name: added ? added.name : null,
        objectType: added ? added.objectType : null,
        index: index ?? beforeChildren,
        childrenDelta: afterChildren - beforeChildren,
        isModified: doc.isModified,
        visibleHint: "内存态操作，需 fgui_save_documents 持久化；可见性请截图确认",
    };
};
exports.handleAddChild = handleAddChild;
const handleDeleteChild = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const target = params["target"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!target)
        throw new Error("缺少参数 target（对象 id 或 name）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj)
        throw new Error(`文档中未找到对象: ${target}`);
    const warnings = [];
    const content = doc.content;
    if (content && content.children) {
        for (let i = 0; i < content.children.Count; i++) {
            const sibling = content.children.get_Item(i);
            if (sibling === obj)
                continue;
            const relations = sibling.relations;
            if (relations && relations.items) {
                for (let r = 0; r < relations.items.Count; r++) {
                    const item = relations.items.get_Item(r);
                    if (item && item.target === obj) {
                        warnings.push(`对象 ${sibling.name || sibling.id} 的关系指向 ${target}`);
                    }
                }
            }
        }
    }
    const beforeChildren = content.children ? content.children.Count : -1;
    doc.RemoveObject(obj);
    const afterChildren = content.children ? content.children.Count : -1;
    doc.SetModified(true);
    return {
        removed: true,
        id: obj.id,
        childrenDelta: afterChildren - beforeChildren,
        isModified: doc.isModified,
        referenceWarnings: warnings,
        note: warnings.length ? "存在引用该对象的其他对象，删除后相关引用将失效，请人工确认" : "无引用，可安全删除",
    };
};
exports.handleDeleteChild = handleDeleteChild;
const SETTABLE_PROPERTIES = new Set([
    "x", "y", "width", "height", "scaleX", "scaleY", "rotation", "alpha", "visible",
    "name", "text", "icon", "tooltips", "grayed", "enabled", "pivotX", "pivotY", "skewX", "skewY",
]);
const handleSetObjectProperty = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const target = params["target"];
    const properties = params["properties"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!target)
        throw new Error("缺少参数 target");
    if (!properties || typeof properties !== "object" || Object.keys(properties).length === 0) {
        throw new Error("缺少参数 properties（至少一个键值）");
    }
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj)
        throw new Error(`文档中未找到对象: ${target}`);
    if (obj.objectType)
        assertForbiddenObjectType(String(obj.objectType));
    const applied = {};
    const rejected = [];
    for (const key of Object.keys(properties)) {
        if (!SETTABLE_PROPERTIES.has(key)) {
            rejected.push(key);
            continue;
        }
        try {
            obj[key] = properties[key];
            applied[key] = obj[key];
        }
        catch (e) {
            rejected.push(`${key}(${e && e.message ? e.message : e})`);
        }
    }
    doc.SetModified(true);
    if (applied["x"] !== undefined || applied["y"] !== undefined || applied["width"] !== undefined || applied["height"] !== undefined) {
        try {
            obj.UpdateGear(0);
        }
        catch {
        }
    }
    return {
        applied,
        rejected,
        isModified: doc.isModified,
        note: rejected.length
            ? `以下属性未应用: ${rejected.join(", ")}（不在白名单或写入失败）`
            : "属性已应用，需 fgui_save_documents 持久化",
    };
};
exports.handleSetObjectProperty = handleSetObjectProperty;
const SIDE_PAIR_BASE = new Set([
    "left", "right", "top", "bottom", "middle", "center", "width", "height",
    "leftext", "rightext", "topext", "bottomext",
]);
function isValidSidePair(pair) {
    const trimmed = pair.trim();
    const normalized = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
    const parts = normalized.split("-");
    if (parts.length !== 2)
        return false;
    const targetSide = parts[0];
    const selfSide = parts[1];
    return SIDE_PAIR_BASE.has(targetSide) && SIDE_PAIR_BASE.has(selfSide);
}
function validateSidePair(sidePair) {
    const pairs = sidePair.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (pairs.length === 0)
        throw new Error("sidePair 不能为空");
    if (pairs.length > 2)
        throw new Error(`sidePair 最多 2 项（单个 relation 最多两个约束），收到 ${pairs.length} 项: ${sidePair}`);
    for (const pair of pairs) {
        if (!isValidSidePair(pair)) {
            throw new Error(`非法 sidePair 项: ${pair}（格式 目标side-自身side，自身侧可加 % 百分比；合法 side: left/right/top/bottom/middle/center/width/height + ext 后缀）`);
        }
    }
}
function buildControllerXml(name, pages, selected) {
    if (pages.length === 0)
        throw new Error("控制器页面不能为空");
    const flat = [];
    for (let i = 0; i < pages.length; i++) {
        const pageName = pages[i] ?? "";
        if (!pageName.trim())
            throw new Error(`控制器页面 ${i} 名称为空，validate --strict 会拒绝（项目要求非空页面名）`);
        flat.push(String(i), pageName);
    }
    const xml = CS.FairyGUI.Utils.XML.Create("controller");
    xml.SetAttribute("name", name);
    xml.SetAttribute("pages", flat.join(","));
    if (selected < 0 || selected >= pages.length)
        throw new Error(`selected 越界: ${selected}（页面数 ${pages.length}）`);
    xml.SetAttribute("selected", String(selected));
    return xml;
}
const handleAddController = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const name = params["name"];
    const pages = params["pages"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!name)
        throw new Error("缺少参数 name（控制器名称）");
    if (!Array.isArray(pages) || pages.length === 0)
        throw new Error("缺少参数 pages（页面名数组）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const selected = params["selected"] ?? 0;
    const xml = buildControllerXml(name, pages, selected);
    doc.AddController(xml);
    doc.SetModified(true);
    const ctrl = doc.content ? doc.content.GetController(name) : null;
    return {
        added: ctrl != null,
        name,
        pages,
        selected,
        isModified: doc.isModified,
        note: "需 fgui_save_documents 持久化",
    };
};
exports.handleAddController = handleAddController;
const handleUpdateController = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const name = params["name"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!name)
        throw new Error("缺少参数 name");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const pages = params["pages"];
    const selected = params["selected"];
    if (!pages && selected === undefined) {
        throw new Error("至少提供 pages 或 selected 之一");
    }
    const existing = doc.content ? doc.content.GetController(name) : null;
    if (!existing)
        throw new Error(`控制器不存在: ${name}`);
    let pagesFlat = [];
    if (pages) {
        pagesFlat = pages;
    }
    else {
        const list = existing.GetPages();
        for (let i = 0; i < list.Count; i++) {
            const p = list.get_Item(i);
            pagesFlat.push(p.name ?? "");
        }
    }
    const sel = selected ?? existing.selectedIndex ?? 0;
    const xml = buildControllerXml(name, pagesFlat, sel);
    doc.UpdateController(name, xml);
    doc.SetModified(true);
    return { updated: true, name, pages: pagesFlat, selected: sel, isModified: doc.isModified, note: "需 fgui_save_documents 持久化" };
};
exports.handleUpdateController = handleUpdateController;
const handleRemoveController = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const name = params["name"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!name)
        throw new Error("缺少参数 name");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const content = doc.content;
    if (!content)
        throw new Error("文档无 content");
    const existing = content.GetController(name);
    if (!existing)
        throw new Error(`控制器不存在: ${name}`);
    const warnings = [];
    const children = content.children;
    if (children) {
        for (let i = 0; i < children.Count; i++) {
            const child = children.get_Item(i);
            try {
                if (child && typeof child.CheckGearsController === "function" && child.CheckGearsController(existing)) {
                    warnings.push(`对象 ${child.name || child.id} 的 gear 绑定控制器 ${name}`);
                }
            }
            catch {
            }
        }
    }
    doc.RemoveController(name);
    doc.SetModified(true);
    return {
        removed: !(doc.content && doc.content.GetController(name)),
        name,
        referenceWarnings: warnings,
        isModified: doc.isModified,
        note: warnings.length ? `删除后 ${warnings.length} 个对象的 gear 引用将失效，请人工确认` : "无引用，可安全删除",
    };
};
exports.handleRemoveController = handleRemoveController;
const handleSwitchPage = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const name = params["name"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!name)
        throw new Error("缺少参数 name");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const content = doc.content;
    if (!content)
        throw new Error("文档无 content");
    const ctrl = content.GetController(name);
    if (!ctrl)
        throw new Error(`控制器不存在: ${name}`);
    let index;
    const pageArg = params["page"];
    const indexArg = params["index"];
    if (pageArg !== undefined) {
        const pageCount = ctrl.pageCount;
        let found = -1;
        const names = ctrl.GetPageNames();
        if (names) {
            for (let i = 0; i < names.Count; i++) {
                if (names.get_Item(i) === pageArg) {
                    found = i;
                    break;
                }
            }
        }
        if (found < 0)
            throw new Error(`页面不存在: ${pageArg}（可用页面: ${pageCount} 个）`);
        index = found;
    }
    else if (indexArg !== undefined) {
        if (indexArg < 0 || indexArg >= ctrl.pageCount)
            throw new Error(`索引越界: ${indexArg}（页面数 ${ctrl.pageCount}）`);
        index = indexArg;
    }
    else {
        throw new Error("缺少参数 index 或 page（目标页）");
    }
    const newIndex = doc.SwitchPage(name, index);
    doc.SetModified(true);
    return { controller: name, switched: true, newIndex, isModified: doc.isModified, note: "需 fgui_save_documents 持久化" };
};
exports.handleSwitchPage = handleSwitchPage;
const handleSetRelation = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const target = params["target"];
    const sidePair = params["sidePair"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!target)
        throw new Error("缺少参数 target（被设置关系的对象）");
    if (!sidePair)
        throw new Error("缺少参数 sidePair");
    validateSidePair(sidePair);
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj)
        throw new Error(`文档中未找到对象: ${target}`);
    const relationTargetName = params["targetRelation"];
    let relationTarget;
    if (relationTargetName === undefined || relationTargetName === "") {
        relationTarget = doc.content;
    }
    else {
        relationTarget = findObjectInDoc(doc, relationTargetName);
        if (!relationTarget)
            throw new Error(`关系目标对象未找到: ${relationTargetName}`);
    }
    const docElement = obj.docElement;
    if (!docElement || typeof docElement.SetRelation !== "function") {
        throw new Error(`对象无 docElement 无法设置关系: ${target}`);
    }
    docElement.SetRelation(relationTarget, sidePair);
    doc.SetModified(true);
    return {
        target,
        relationTarget: relationTargetName === undefined || relationTargetName === "" ? "(父级)" : relationTargetName,
        sidePair,
        isModified: doc.isModified,
        note: "需 fgui_save_documents 持久化；validate --strict 可复核 sidePair 合法性",
    };
};
exports.handleSetRelation = handleSetRelation;
const handleRemoveRelation = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const target = params["target"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!target)
        throw new Error("缺少参数 target");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj)
        throw new Error(`文档中未找到对象: ${target}`);
    const relationTargetName = params["targetRelation"];
    let relationTarget;
    if (relationTargetName === undefined || relationTargetName === "") {
        relationTarget = doc.content;
    }
    else {
        relationTarget = findObjectInDoc(doc, relationTargetName);
        if (!relationTarget)
            throw new Error(`关系目标对象未找到: ${relationTargetName}`);
    }
    const docElement = obj.docElement;
    if (!docElement || typeof docElement.RemoveRelation !== "function") {
        throw new Error(`对象无 docElement 无法移除关系: ${target}`);
    }
    docElement.RemoveRelation(relationTarget);
    doc.SetModified(true);
    return {
        removed: true,
        target,
        relationTarget: relationTargetName === undefined || relationTargetName === "" ? "(父级)" : relationTargetName,
        isModified: doc.isModified,
        note: "需 fgui_save_documents 持久化",
    };
};
exports.handleRemoveRelation = handleRemoveRelation;
const handleCreatePackage = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const name = params["name"];
    if (!name)
        throw new Error("缺少参数 name（包名）");
    const existing = project.GetPackageByName(name);
    if (existing)
        throw new Error(`包已存在: ${name}`);
    const pkg = project.CreatePackage(name);
    if (!pkg)
        throw new Error(`CreatePackage 失败: ${name}`);
    pkg.Save();
    project.Save();
    return { created: true, id: pkg.id, name: pkg.name };
};
exports.handleCreatePackage = handleCreatePackage;
const handleDeletePackage = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    if (!packageName)
        throw new Error("缺少参数 package");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const confirm = params["confirm"] === true;
    const itemCount = pkg.items ? pkg.items.Count : 0;
    if (!confirm) {
        return {
            confirmed: false,
            reason: "破坏性操作需二次确认",
            impact: { package: packageName, itemCount },
            nextStep: `确认删除请重试并传 confirm: true`,
        };
    }
    project.DeletePackage(pkg.id);
    project.Save();
    return { deleted: true, package: packageName, itemCount };
};
exports.handleDeletePackage = handleDeletePackage;
const handleCreateFolder = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const name = params["name"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!name)
        throw new Error("缺少参数 name（文件夹名）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const path = params["path"] ?? "/";
    const folder = pkg.CreateFolder(name, path);
    if (!folder)
        throw new Error(`CreateFolder 失败: ${name}@${path}`);
    pkg.Save();
    return { created: true, id: folder.id, name: folder.name, path: folder.path };
};
exports.handleCreateFolder = handleCreateFolder;
const handleRenameResource = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const name = params["name"];
    const newName = params["newName"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!name)
        throw new Error("缺少参数 name（资源名）");
    if (!newName)
        throw new Error("缺少参数 newName");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(name) || pkg.FindItemByName(`${name}.xml`);
    if (!item)
        throw new Error(`资源不存在: ${packageName}/${name}`);
    pkg.RenameItem(item, newName);
    pkg.Save();
    return { renamed: true, id: item.id, name: item.name, oldName: name };
};
exports.handleRenameResource = handleRenameResource;
const handleMoveResource = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const name = params["name"];
    const path = params["path"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!name)
        throw new Error("缺少参数 name");
    if (!path)
        throw new Error("缺少参数 path（目标目录）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(name) || pkg.FindItemByName(`${name}.xml`);
    if (!item)
        throw new Error(`资源不存在: ${packageName}/${name}`);
    pkg.MoveItem(item, path);
    pkg.Save();
    return { moved: true, id: item.id, name: item.name, path: item.path };
};
exports.handleMoveResource = handleMoveResource;
const handleDeleteResource = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const name = params["name"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!name)
        throw new Error("缺少参数 name");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const item = findResourceItem(pkg, name);
    if (!item)
        throw new Error(`资源不存在: ${packageName}/${name}（可按 id/name/文件名引用）`);
    const references = [];
    try {
        const query = new FairyEditor.DependencyQuery();
        query.QueryReferences(project, item.GetURL());
        const refs = query.references;
        if (refs) {
            for (let i = 0; i < refs.Count; i++) {
                const ref = refs.get_Item(i);
                const owner = ref.ownerPkg;
                references.push(`${owner ? owner.name : "?"}/${ref.itemId}`);
            }
        }
    }
    catch {
    }
    const confirm = params["confirm"] === true;
    if (references.length > 0 && !confirm) {
        return {
            confirmed: false,
            reason: `资源被 ${references.length} 处引用，删除会导致引用失效`,
            references,
            nextStep: "确认删除请重试并传 confirm: true",
        };
    }
    pkg.DeleteItem(item);
    pkg.Save();
    return { deleted: true, package: packageName, name, references, note: references.length ? "已确认删除（相关引用失效，请人工复核）" : "无引用，可安全删除" };
};
exports.handleDeleteResource = handleDeleteResource;
const handleCreateComponent = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const name = params["name"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!name)
        throw new Error("缺少参数 name（组件名）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const width = params["width"] ?? 100;
    const height = params["height"] ?? 100;
    const path = params["path"] ?? "/";
    const item = pkg.CreateComponentItem(name, width, height, path);
    if (!item)
        throw new Error(`CreateComponentItem 失败: ${name}`);
    pkg.Save();
    return { created: true, id: item.id, name: item.name, path: item.path, type: item.type };
};
exports.handleCreateComponent = handleCreateComponent;
const handleCopyItems = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const sourcePackage = params["sourcePackage"];
    const name = params["name"];
    const targetPackage = params["targetPackage"];
    if (!sourcePackage)
        throw new Error("缺少参数 sourcePackage");
    if (!name)
        throw new Error("缺少参数 name");
    if (!targetPackage)
        throw new Error("缺少参数 targetPackage");
    if (sourcePackage === targetPackage)
        throw new Error("源包与目标包不能相同");
    const srcPkg = project.GetPackageByName(sourcePackage);
    if (!srcPkg)
        throw new Error(`源包不存在: ${sourcePackage}`);
    const targetPkg = project.GetPackageByName(targetPackage);
    if (!targetPkg)
        throw new Error(`目标包不存在: ${targetPackage}`);
    const item = srcPkg.FindItemByName(name) || srcPkg.FindItemByName(`${name}.xml`);
    if (!item)
        throw new Error(`资源不存在: ${sourcePackage}/${name}`);
    const targetPath = params["targetPath"] ?? "/";
    const doc = App.docView.OpenDocument(item.GetURL(), false);
    if (!doc)
        throw new Error(`打开源文档失败: ${item.GetURL()}`);
    const xml = doc.Serialize();
    if (!xml)
        throw new Error("源文档 Serialize 返回空 XML");
    const handler = new FairyEditor.CopyHandler();
    handler.InitWithObject(srcPkg, xml, targetPkg, targetPath, false);
    handler.Copy(targetPkg, FairyEditor.CopyHandler.OverrideOption.RENAME, false);
    let copied = null;
    try {
        targetPkg.Open();
        copied = targetPkg.FindItemByName(`${name}.xml`) || targetPkg.FindItemByName(name);
    }
    catch {
    }
    const idMapping = { [item.id]: copied ? copied.id : "" };
    targetPkg.Save();
    return {
        copied: copied != null,
        sourcePackage,
        targetPackage,
        name,
        idMapping,
        existsItemCount: handler.existsItemCount,
        dependencyCount: handler.resultList ? handler.resultList.Count : 0,
        note: copied ? "复制成功，需 fgui_save_documents 持久化" : "依赖项已复制但主组件未在目标包枚举到，请人工确认",
        crossPackageNote: targetPackage.startsWith("Common")
            ? "目标包为 Common 通用包，符合跨包引用约定"
            : "警告：目标包非 Common 通用包，跨包引用应只指向 Common/Common_xxx，请复核是否符合项目约定",
    };
};
exports.handleCopyItems = handleCopyItems;
const handleListBranches = () => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const branches = [];
    const all = project.allBranches;
    if (all) {
        for (let i = 0; i < all.Count; i++)
            branches.push(all.get_Item(i));
    }
    return { activeBranch: project.activeBranch, branches };
};
exports.handleListBranches = handleListBranches;
const handleSwitchBranch = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const branch = params["branch"];
    if (!branch)
        throw new Error("缺少参数 branch");
    const branches = [];
    const all = project.allBranches;
    if (all) {
        for (let i = 0; i < all.Count; i++)
            branches.push(all.get_Item(i));
    }
    if (!branches.includes(branch)) {
        throw new Error(`分支不存在: ${branch}（可用分支: ${branches.join(",") || "无（仅主干）"}）`);
    }
    project.activeBranch = branch;
    project.Save();
    return { switched: true, activeBranch: project.activeBranch, branches };
};
exports.handleSwitchBranch = handleSwitchBranch;
function createCapturePreviewHandler(server) {
    return (params) => {
        const project = App.project;
        if (!project)
            throw new Error("无打开工程");
        const outDir = `${project.objsPath}/fgui-mcp-probe/capture`;
        try {
            CS.System.IO.Directory.CreateDirectory(outDir);
        }
        catch (e) {
            throw new Error(`创建截图目录失败: ${e && e.message ? e.message : e}`);
        }
        const reqId = params["__requestId"];
        if (!reqId)
            throw new Error("缺少请求 id（内部错误）");
        const outPng = `${outDir}/capture_${Date.now()}.png`;
        const doCapture = () => {
            try {
                const docArg = params["doc"];
                let activeDoc = App.activeDoc;
                if (docArg) {
                    const pkg = project.GetPackageByName(params["package"] ?? "Demo");
                    if (!pkg)
                        throw new Error(`包不存在: ${params["package"]}`);
                    const item = pkg.FindItemByName(docArg) || pkg.FindItemByName(`${docArg}.xml`);
                    if (!item)
                        throw new Error(`组件不存在: ${docArg}`);
                    activeDoc = App.docView.FindDocument(item.GetURL()) || App.docView.OpenDocument(item.GetURL(), false);
                }
                if (!activeDoc)
                    throw new Error("无活动文档可截图（或组件未打开）");
                const content = activeDoc.content;
                if (!content)
                    throw new Error("文档无 content");
                const displayObj = content.displayObject;
                if (!displayObj)
                    throw new Error("文档 displayObject 为空");
                const texture = displayObj.GetScreenShot(null, 1);
                if (!texture)
                    throw new Error("GetScreenShot 返回空 Texture2D");
                const ImageConversion = CS.UnityEngine.ImageConversion;
                if (!ImageConversion || typeof ImageConversion.EncodeToPNG !== "function") {
                    throw new Error("UnityEngine.ImageConversion.EncodeToPNG 不可用");
                }
                const pngBytes = ImageConversion.EncodeToPNG(texture);
                if (!pngBytes)
                    throw new Error("EncodeToPNG 返回空");
                CS.System.IO.File.WriteAllBytes(outPng, pngBytes);
                try {
                    CS.UnityEngine.Object.Destroy(texture);
                }
                catch {
                }
                if (!CS.System.IO.File.Exists(outPng)) {
                    throw new Error(`截图失败：未产出 PNG: ${outPng}`);
                }
                const sizeBytes = Number(new CS.System.IO.FileInfo(outPng).Length);
                server.writeResponse(reqId, {
                    ok: true,
                    result: {
                        captured: true,
                        path: outPng,
                        sizeBytes,
                        doc: activeDoc.docURL,
                        note: "GetScreenShot + EncodeToPNG（FairyGUI 官方截图路径），可用于 visual-verifier 视觉核对（mode=fgui）",
                    },
                });
            }
            catch (e) {
                server.writeResponse(reqId, { ok: false, error: `截图失败: ${e && e.message ? e.message : e}` });
            }
        };
        try {
            CS.FairyGUI.Timers.inst.Add(0.2, 1, doCapture);
        }
        catch {
            doCapture();
        }
        return { deferred: true, id: reqId };
    };
}
const handleOpenComponent = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["component"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 component");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!item)
        throw new Error(`组件不存在: ${packageName}/${componentName}`);
    const url = item.GetURL();
    const doc = App.docView.OpenDocument(url, true);
    if (!doc)
        throw new Error(`打开文档失败: ${url}`);
    return { opened: true, url, name: item.name, path: item.path, displayTitle: doc.displayTitle };
};
exports.handleOpenComponent = handleOpenComponent;
const handleShowPreview = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["component"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 component");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!item)
        throw new Error(`组件不存在: ${packageName}/${componentName}`);
    App.ShowPreview(item);
    return { previewing: true, url: item.GetURL(), name: item.name };
};
exports.handleShowPreview = handleShowPreview;
const handleSelectElement = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    const componentName = params["doc"];
    const target = params["target"];
    if (!packageName)
        throw new Error("缺少参数 package");
    if (!componentName)
        throw new Error("缺少参数 doc");
    if (!target)
        throw new Error("缺少参数 target");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj)
        throw new Error(`文档中未找到对象: ${target}`);
    doc.UnselectAll();
    doc.SelectObject(obj, true, true);
    const selected = doc.GetSelection ? doc.GetSelection() : null;
    const count = selected && typeof selected.Count === "number" ? selected.Count : 0;
    return { selected: count > 0, target, id: obj.id, name: obj.name, selectionCount: count };
};
exports.handleSelectElement = handleSelectElement;
const handleCloseDocument = (params) => {
    if (!App.project)
        throw new Error("无打开工程");
    const docArg = params["doc"];
    let doc;
    if (docArg) {
        const project = App.project;
        const packageName = params["package"];
        if (!packageName)
            throw new Error("缺少参数 package（关闭指定文档时必填）");
        const pkg = project.GetPackageByName(packageName);
        if (!pkg)
            throw new Error(`包不存在: ${packageName}`);
        const item = pkg.FindItemByName(docArg) || pkg.FindItemByName(`${docArg}.xml`);
        if (!item)
            throw new Error(`组件不存在: ${packageName}/${docArg}`);
        doc = App.docView.FindDocument(item.GetURL());
        if (!doc)
            throw new Error(`文档未打开: ${docArg}`);
    }
    else {
        doc = App.activeDoc;
        if (!doc)
            throw new Error("无活动文档可关闭");
    }
    App.docView.CloseDocument(doc);
    return { closed: true, doc: doc.docURL };
};
exports.handleCloseDocument = handleCloseDocument;
const handleClearLogs = () => {
    if (!App.project)
        throw new Error("无打开工程");
    try {
        App.consoleView.Clear();
        return { cleared: true };
    }
    catch (e) {
        throw new Error(`清空控制台失败: ${e && e.message ? e.message : e}`);
    }
};
exports.handleClearLogs = handleClearLogs;
//# sourceMappingURL=handlers-write.js.map