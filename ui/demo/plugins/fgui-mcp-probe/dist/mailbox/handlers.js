"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetLogs = exports.handleGetComponentInfo = exports.handleGetSelection = exports.handleListControllers = exports.handleReadDocument = exports.handleFullSearch = exports.handleReadProjectSettings = exports.handleGetActiveContext = exports.handleReadPublishSettings = exports.handleQueryDependencies = exports.handleListResources = exports.handleListPackages = void 0;
exports.createFindResourcesHandler = createFindResourcesHandler;
var FairyEditor = CS.FairyEditor;
const server_1 = require("./server");
const App = FairyEditor.App;
const handleListPackages = () => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    return (0, server_1.listToArray)(project.allPackages).map((pkg) => ({
        name: pkg.name,
        id: pkg.id,
        opened: pkg.opened,
    }));
};
exports.handleListPackages = handleListPackages;
const handleListResources = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const packageName = params["package"];
    if (!packageName)
        throw new Error("缺少参数 package");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg)
        throw new Error(`包不存在: ${packageName}`);
    const rows = (0, server_1.listToArray)(pkg.items).map((item) => ({
        kind: item.type,
        id: item.id,
        name: item.name,
        path: item.path,
        exported: item.exported,
        branch: item.branch,
        file: item.file,
    }));
    return {
        package: pkg.name,
        packageId: pkg.id,
        count: rows.length,
        resources: rows,
    };
};
exports.handleListResources = handleListResources;
const handleQueryDependencies = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const url = params["url"];
    if (!url)
        throw new Error("缺少参数 url（ui://...）");
    const query = new FairyEditor.DependencyQuery();
    query.QueryDependencies(project, url, FairyEditor.DependencyQuery.SeekLevel.ALL);
    return {
        url,
        resultList: (0, server_1.listToArray)(query.resultList).map((dep) => ({
            targetUrl: dep.item ? dep.item.GetURL() : null,
            targetName: dep.item ? dep.item.name : null,
            isSource: dep.isSource,
            refCount: dep.refCount,
        })),
        references: (0, server_1.listToArray)(query.references).map((ref) => ({
            pkgId: ref.pkgId,
            itemId: ref.itemId,
            url: ref.url,
        })),
    };
};
exports.handleQueryDependencies = handleQueryDependencies;
const PUBLISH_SETTINGS_FIELDS = [
    "path", "branchPath", "fileExtension", "packageCount", "compressDesc", "binaryFormat",
    "jpegQuality", "compressPNG", "codeGeneration", "includeHighResolution", "branchProcessing",
    "seperatedAtlasForBranch", "atlasSetting", "include2x", "include3x", "include4x",
];
const handleReadPublishSettings = () => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const settings = project.GetSettings("Publish");
    if (!settings)
        throw new Error("读取发布设置失败（GetSettings('Publish') 为空）");
    const snapshot = {};
    for (const key of PUBLISH_SETTINGS_FIELDS) {
        snapshot[key] = settings[key];
    }
    return {
        projectType: project.type,
        settings: snapshot,
    };
};
exports.handleReadPublishSettings = handleReadPublishSettings;
const handleGetActiveContext = () => {
    const activeDoc = App.activeDoc;
    const activeFolder = App.GetActiveFolder();
    return {
        activeDoc: activeDoc
            ? { url: activeDoc.docURL, isModified: activeDoc.isModified, displayTitle: activeDoc.displayTitle }
            : null,
        activeFolder: activeFolder ? { url: activeFolder.GetURL(), name: activeFolder.name, path: activeFolder.path } : null,
    };
};
exports.handleGetActiveContext = handleGetActiveContext;
const SETTINGS_FIELDS = {
    Adaptation: ["scaleMode", "screenMathMode", "designResolutionX", "designResolutionY"],
    Common: ["font", "fontSize", "textColor", "fontAdjustment", "pivot", "listClearOnPublish", "buttonClickSound", "tipsRes"],
    I18n: ["langFiles", "lang"],
    PackageGroup: ["groups"],
};
const handleReadProjectSettings = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const section = params["section"];
    const sections = section ? [section] : Object.keys(SETTINGS_FIELDS);
    const result = {};
    for (const key of sections) {
        const fields = SETTINGS_FIELDS[key];
        if (!fields) {
            throw new Error(`未知设置段: ${key}（可用: ${Object.keys(SETTINGS_FIELDS).join(",")}）`);
        }
        const settings = safeGetSettings(project, key);
        if (!settings) {
            result[key] = null;
            continue;
        }
        const snapshot = {};
        for (const field of fields) {
            const value = settings[field];
            snapshot[field] = serializeSettingValue(value);
        }
        result[key] = snapshot;
    }
    return { projectType: project.type, sections: result };
};
exports.handleReadProjectSettings = handleReadProjectSettings;
function safeGetSettings(project, key) {
    try {
        return project.GetSettings(key);
    }
    catch {
        return null;
    }
}
function serializeSettingValue(value) {
    if (value == null)
        return value;
    if (typeof value !== "object")
        return value;
    const anyValue = value;
    if (typeof anyValue.Count === "number" && typeof anyValue.get_Item === "function") {
        return (0, server_1.listToArray)(anyValue).map(serializeSettingValue);
    }
    const out = {};
    try {
        for (const key of Object.keys(anyValue)) {
            const v = anyValue[key];
            if (typeof v === "function")
                continue;
            out[key] = typeof v === "object" && v != null ? serializeSettingValue(v) : v;
        }
    }
    catch {
        return String(value);
    }
    return out;
}
function createFindResourcesHandler(kind, server) {
    return (params) => {
        const project = App.project;
        if (!project)
            throw new Error("无打开工程");
        const packageName = params["package"];
        const pkgs = packageName
            ? [project.GetPackageByName(packageName)].filter(Boolean)
            : (0, server_1.listToArray)(project.allPackages);
        if (pkgs.length === 0)
            throw new Error(`包不存在: ${packageName}`);
        const reqId = params["__requestId"];
        if (!reqId)
            throw new Error("缺少请求 id（内部错误）");
        const finder = kind === "unused"
            ? new FairyEditor.FindUnusedResource()
            : new FairyEditor.FindDuplicateResource();
        const started = { fired: false };
        const report = () => {
            const rows = [];
            if (kind === "duplicate") {
                const finderAny = finder;
                const result = finderAny.result;
                const count = result ? result.Count : 0;
                for (let g = 0; g < count; g++) {
                    const group = [];
                    finderAny.GetGroup(g, group);
                    rows.push({ group: g, items: group.map((item) => ({
                            id: item.id, name: item.name, path: item.path, pkg: item.owner ? item.owner.name : null,
                        })) });
                }
            }
            else {
                const result = finder.result;
                const list = result && typeof result.Count === "number" ? (0, server_1.listToArray)(result) : [];
                for (const raw of list) {
                    const item = raw;
                    rows.push({ id: item.id, name: item.name, path: item.path, pkg: item.owner ? item.owner.name : null });
                }
            }
            server.writeResponse(reqId, {
                ok: true,
                result: { kind, count: rows.length, items: rows },
            });
        };
        try {
            finder.Start(pkgs, () => { }, () => {
                started.fired = true;
                report();
            });
        }
        catch (e) {
            server.writeResponse(reqId, { ok: false, error: String(e && e.message ? e.message : e) });
        }
        return { deferred: true, id: reqId };
    };
}
const handleFullSearch = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const keyword = params["keyword"];
    if (!keyword)
        throw new Error("缺少参数 keyword");
    const maxResults = params["maxResults"];
    const search = maxResults ? new FairyEditor.FullSearch(maxResults) : new FairyEditor.FullSearch();
    search.Start(keyword, "", true);
    const rows = (0, server_1.listToArray)(search.result).map((item) => ({
        id: item.id,
        name: item.name,
        path: item.path,
        pkg: item.owner ? item.owner.name : null,
    }));
    return { keyword, count: rows.length, results: rows };
};
exports.handleFullSearch = handleFullSearch;
const handleReadDocument = (params) => {
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
    const doc = App.docView.FindDocument(url) || App.docView.OpenDocument(url, false);
    if (!doc)
        throw new Error(`打开文档失败: ${url}`);
    const content = doc.content;
    if (!content)
        throw new Error(`文档无 content: ${url}`);
    const children = (0, server_1.listToArray)(content.children).map((obj) => ({
        id: obj.id,
        name: obj.name,
        objectType: obj.objectType,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
    }));
    const controllers = (0, server_1.listToArray)(content.controllers).map((c) => ({
        name: c.name,
        pages: (0, server_1.listToArray)(c.GetPages()).map((p) => ({ id: p.id, name: p.name })),
        selectedIndex: c.selectedIndex,
    }));
    const relations = (0, server_1.listToArray)(content.relations ? content.relations.items : null).map((r) => ({
        targetId: r ? (r.target ? r.target.id : null) : null,
        desc: r ? r.desc : null,
    }));
    const transitions = content.transitions && content.transitions.items
        ? (0, server_1.listToArray)(content.transitions.items).map((t) => ({ name: t.name, autoPlay: t.autoPlay }))
        : [];
    return {
        url,
        size: { width: content.width, height: content.height },
        children,
        controllers,
        relations,
        transitions,
    };
};
exports.handleReadDocument = handleReadDocument;
const handleListControllers = (params) => {
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
    const doc = App.docView.FindDocument(url) || App.docView.OpenDocument(url, false);
    if (!doc)
        throw new Error(`打开文档失败: ${url}`);
    const content = doc.content;
    if (!content)
        throw new Error(`文档无 content: ${url}`);
    const controllers = (0, server_1.listToArray)(content.controllers).map((c) => ({
        name: c.name,
        pages: (0, server_1.listToArray)(c.GetPages()).map((p) => ({ id: p.id, name: p.name })),
        selectedIndex: c.selectedIndex,
        selectedPage: c.selectedPage,
    }));
    return { package: packageName, component: componentName, count: controllers.length, controllers };
};
exports.handleListControllers = handleListControllers;
const handleGetSelection = () => {
    const doc = App.activeDoc;
    if (!doc) {
        return { selection: [], count: 0, message: "无活动文档" };
    }
    const selection = doc.GetSelection ? doc.GetSelection() : null;
    const result = [];
    if (selection && typeof selection.Count === "number") {
        for (let i = 0; i < selection.Count; i++) {
            const obj = selection.get_Item(i);
            if (obj) {
                result.push({ id: obj.id ?? "", name: obj.name ?? "", objectType: obj.objectType ?? "unknown" });
            }
        }
    }
    return { selection: result, count: result.length, doc: doc.docURL };
};
exports.handleGetSelection = handleGetSelection;
const handleGetComponentInfo = (params) => {
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
    return {
        name: item.name,
        id: item.id,
        type: item.type,
        width: item.width,
        height: item.height,
        path: item.path,
        url: item.GetURL(),
        exported: item.exported,
    };
};
exports.handleGetComponentInfo = handleGetComponentInfo;
const handleGetLogs = (params) => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const lines = params["lines"] ?? 100;
    const path = CS.UnityEngine.Application.consoleLogPath;
    if (!path || !CS.System.IO.File.Exists(path)) {
        return { logs: [], source: path ?? "", message: "控制台日志文件不存在" };
    }
    try {
        const IO = CS.System.IO;
        const stream = new IO.FileStream(path, IO.FileMode.Open, IO.FileAccess.Read, IO.FileShare.ReadWrite);
        const reader = new IO.StreamReader(stream);
        const raw = reader.ReadToEnd();
        reader.Close();
        stream.Close();
        const parts = raw.split("\n");
        const tail = parts.slice(Math.max(0, parts.length - lines));
        return { logs: tail, count: tail.length, source: path };
    }
    catch (e) {
        throw new Error(`读取控制台日志失败: ${e && e.message ? e.message : e}`);
    }
};
exports.handleGetLogs = handleGetLogs;
//# sourceMappingURL=handlers.js.map