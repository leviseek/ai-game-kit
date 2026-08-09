"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetActiveContext = exports.handleReadPublishSettings = exports.handleQueryDependencies = exports.handleListResources = exports.handleListPackages = void 0;
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
const handleReadPublishSettings = () => {
    const project = App.project;
    if (!project)
        throw new Error("无打开工程");
    const settings = project.GetSettings("Publish");
    if (!settings)
        throw new Error("读取发布设置失败（GetSettings('Publish') 为空）");
    const snapshot = {};
    for (const key of Object.keys(settings)) {
        const value = settings[key];
        if (typeof value === "function")
            continue;
        snapshot[key] = value;
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
//# sourceMappingURL=handlers.js.map