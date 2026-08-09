import FairyEditor = CS.FairyEditor;
import { listToArray, type MailboxHandler } from "./server";

const App = FairyEditor.App;

/** 返回工程所有包（name/id/opened）。 */
export const handleListPackages: MailboxHandler = () => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    return listToArray(project.allPackages).map((pkg) => ({
        name: pkg.name,
        id: pkg.id,
        opened: pkg.opened,
    }));
};

/** 返回指定包的资源清单（与 tools/fgui list-resources 对齐：kind/id/name/path/exported/branch）。 */
export const handleListResources: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);

    const rows = listToArray(pkg.items).map((item) => ({
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

/** 返回指定资源的依赖引用（DependencyQuery，SeekLevel.ALL）。 */
export const handleQueryDependencies: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const url = params["url"] as string | undefined;
    if (!url) throw new Error("缺少参数 url（ui://...）");

    const query = new FairyEditor.DependencyQuery();
    query.QueryDependencies(project, url, FairyEditor.DependencyQuery.SeekLevel.ALL);
    return {
        url,
        resultList: listToArray(query.resultList).map((dep) => ({
            targetUrl: dep.item ? dep.item.GetURL() : null,
            targetName: dep.item ? dep.item.name : null,
            isSource: dep.isSource,
            refCount: dep.refCount,
        })),
        references: listToArray(query.references as any).map((ref: any) => ({
            pkgId: ref.pkgId,
            itemId: ref.itemId,
            url: ref.url,
        })),
    };
};

/** 返回全局发布设置（GetSettings("Publish") 的公开字段快照）。 */
export const handleReadPublishSettings: MailboxHandler = () => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const settings = project.GetSettings("Publish") as any;
    if (!settings) throw new Error("读取发布设置失败（GetSettings('Publish') 为空）");

    const snapshot: Record<string, unknown> = {};
    for (const key of Object.keys(settings)) {
        const value = settings[key];
        if (typeof value === "function") continue;
        snapshot[key] = value;
    }
    return {
        projectType: project.type,
        settings: snapshot,
    };
};

/** 返回活动文档与活动文件夹。 */
export const handleGetActiveContext: MailboxHandler = () => {
    const activeDoc = App.activeDoc as any;
    const activeFolder = App.GetActiveFolder();
    return {
        activeDoc: activeDoc
            ? { url: activeDoc.docURL, isModified: activeDoc.isModified, displayTitle: activeDoc.displayTitle }
            : null,
        activeFolder: activeFolder ? { url: activeFolder.GetURL(), name: activeFolder.name, path: activeFolder.path } : null,
    };
};
