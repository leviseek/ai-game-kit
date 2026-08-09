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

/** 全局发布设置的可读字段（来自 editor.d.ts GlobalPublishSettings 声明）。 */
const PUBLISH_SETTINGS_FIELDS = [
    "path", "branchPath", "fileExtension", "packageCount", "compressDesc", "binaryFormat",
    "jpegQuality", "compressPNG", "codeGeneration", "includeHighResolution", "branchProcessing",
    "seperatedAtlasForBranch", "atlasSetting", "include2x", "include3x", "include4x",
] as const;

/** 返回全局发布设置（GetSettings("Publish") 的公开字段快照）。 */
export const handleReadPublishSettings: MailboxHandler = () => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const settings = project.GetSettings("Publish") as any;
    if (!settings) throw new Error("读取发布设置失败（GetSettings('Publish') 为空）");

    // C# 属性是 getter，不在 Object.keys 内，必须显式按声明字段读取
    const snapshot: Record<string, unknown> = {};
    for (const key of PUBLISH_SETTINGS_FIELDS) {
        snapshot[key] = settings[key];
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

/** 工程设置的可读字段（按 SettingsBase 子类公开属性读取；Publish 已在 handlers-publish 覆盖）。 */
const SETTINGS_FIELDS: Record<string, string[]> = {
    Adaptation: ["scaleMode", "screenMathMode", "designResolutionX", "designResolutionY"],
    Common: ["font", "fontSize", "textColor", "fontAdjustment", "pivot", "listClearOnPublish", "buttonClickSound", "tipsRes"],
    I18n: ["langFiles", "lang"],
    PackageGroup: ["groups"],
};

/** 返回工程设置快照（Adaptation/Common/I18n/PackageGroup）。 */
export const handleReadProjectSettings: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const section = params["section"] as string | undefined;
    const sections = section ? [section] : Object.keys(SETTINGS_FIELDS);
    const result: Record<string, unknown> = {};
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
        const snapshot: Record<string, unknown> = {};
        for (const field of fields) {
            const value = settings[field];
            // 嵌套对象/列表需序列化为可 JSON 结构（Puerts 直接引用 C# 对象会 JSON.stringify 失败）
            snapshot[field] = serializeSettingValue(value);
        }
        result[key] = snapshot;
    }
    return { projectType: project.type, sections: result };
};

/** GetSettings 对不存在的设置段会抛异常（如无 I18n 的工程），容错返回 null。 */
function safeGetSettings(project: any, key: string): any {
    try {
        return project.GetSettings(key);
    } catch {
        return null;
    }
}

/** 把设置字段值转为可 JSON 序列化的结构。 */
function serializeSettingValue(value: unknown): unknown {
    if (value == null) return value;
    if (typeof value !== "object") return value;
    const anyValue = value as any;
    // List$1<T>：Count + get_Item
    if (typeof anyValue.Count === "number" && typeof anyValue.get_Item === "function") {
        return listToArray(anyValue).map(serializeSettingValue);
    }
    // 简单对象：枚举自身可读属性（递归一层防环）
    const out: Record<string, unknown> = {};
    try {
        for (const key of Object.keys(anyValue)) {
            const v = anyValue[key];
            if (typeof v === "function") continue;
            out[key] = typeof v === "object" && v != null ? serializeSettingValue(v) : v;
        }
    } catch {
        return String(value);
    }
    return out;
}

/** 返回未使用/重复资源报告（只读，不删除）。deferred：Start 异步完成后回写。 */
export function createFindResourcesHandler(
    kind: "unused" | "duplicate",
    server: import("./server").MailboxServer,
): MailboxHandler {
    return (params): { deferred: true; id: string } => {
        const project = App.project;
        if (!project) throw new Error("无打开工程");
        const packageName = params["package"] as string | undefined;
        const pkgs = packageName
            ? [project.GetPackageByName(packageName)].filter(Boolean) as FairyEditor.FPackage[]
            : listToArray(project.allPackages);
        if (pkgs.length === 0) throw new Error(`包不存在: ${packageName}`);

        const reqId = params["__requestId"] as string;
        if (!reqId) throw new Error("缺少请求 id（内部错误）");

        const finder = kind === "unused"
            ? new FairyEditor.FindUnusedResource()
            : new FairyEditor.FindDuplicateResource() as any;
        const started: { fired: boolean } = { fired: false };
        const report = (): void => {
            const rows: unknown[] = [];
            if (kind === "duplicate") {
                // 重复资源按组输出：GetGroup 分组
                const finderAny = finder as any;
                const result = finderAny.result as any;
                const count = result ? result.Count : 0;
                for (let g = 0; g < count; g++) {
                    const group: FairyEditor.FPackageItem[] = [];
                    finderAny.GetGroup(g, group as any);
                    rows.push({ group: g, items: group.map((item) => ({
                        id: item.id, name: item.name, path: item.path, pkg: item.owner ? (item.owner as any).name : null,
                    })) });
                }
            } else {
                const result = (finder as any).result as any;
                const list = result && typeof result.Count === "number" ? listToArray(result) : [];
                for (const raw of list) {
                    const item = raw as FairyEditor.FPackageItem;
                    rows.push({ id: item.id, name: item.name, path: item.path, pkg: item.owner ? (item.owner as any).name : null });
                }
            }
            server.writeResponse(reqId, {
                ok: true,
                result: { kind, count: rows.length, items: rows },
            });
        };
        try {
            (finder as any).Start(pkgs, () => { /* onProgress：记录进度已触发 */ }, () => {
                started.fired = true;
                report();
            });
        } catch (e: any) {
            server.writeResponse(reqId, { ok: false, error: String(e && e.message ? e.message : e) });
        }
        return { deferred: true, id: reqId };
    };
}

/** 返回全工程资源搜索（FullSearch）。 */
export const handleFullSearch: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const keyword = params["keyword"] as string | undefined;
    if (!keyword) throw new Error("缺少参数 keyword");
    const maxResults = params["maxResults"] as number | undefined;
    const search = maxResults ? new FairyEditor.FullSearch(maxResults) : new FairyEditor.FullSearch();
    search.Start(keyword, "", true);
    const rows = listToArray(search.result).map((item) => ({
        id: item.id,
        name: item.name,
        path: item.path,
        pkg: item.owner ? (item.owner as any).name : null,
    }));
    return { keyword, count: rows.length, results: rows };
};

/** 返回已打开文档的结构快照（子对象/控制器/关系/过渡）。 */
export const handleReadDocument: MailboxHandler = (params) => {    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["component"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 component");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!item) throw new Error(`组件不存在: ${packageName}/${componentName}`);
    const url = item.GetURL();

    const doc = App.docView.FindDocument(url) || App.docView.OpenDocument(url, false);
    if (!doc) throw new Error(`打开文档失败: ${url}`);
    const content = (doc as any).content as any;
    if (!content) throw new Error(`文档无 content: ${url}`);

    const children = listToArray(content.children).map((obj: any) => ({
        id: obj.id,
        name: obj.name,
        objectType: obj.objectType,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
    }));

    const controllers = listToArray(content.controllers).map((c: any) => ({
        name: c.name,
        pages: listToArray(c.GetPages()).map((p: any) => ({ id: p.id, name: p.name })),
        selectedIndex: c.selectedIndex,
    }));

    const relations = listToArray(content.relations ? content.relations.items : null).map((r: any) => ({
        targetId: r ? (r.target ? (r.target as any).id : null) : null,
        desc: r ? r.desc : null,
    }));

    const transitions = content.transitions && content.transitions.items
        ? listToArray(content.transitions.items).map((t: any) => ({ name: t.name, autoPlay: t.autoPlay }))
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

/** 返回组件控制器列表（名称/页面/选中索引）。与 read_document 的 controllers 段同源，独立暴露便于快速查询。 */
export const handleListControllers: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["component"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 component");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!item) throw new Error(`组件不存在: ${packageName}/${componentName}`);
    const url = item.GetURL();

    const doc = App.docView.FindDocument(url) || App.docView.OpenDocument(url, false);
    if (!doc) throw new Error(`打开文档失败: ${url}`);
    const content = (doc as any).content as any;
    if (!content) throw new Error(`文档无 content: ${url}`);

    const controllers = listToArray(content.controllers).map((c: any) => ({
        name: c.name,
        pages: listToArray(c.GetPages()).map((p: any) => ({ id: p.id, name: p.name })),
        selectedIndex: c.selectedIndex,
        selectedPage: c.selectedPage,
    }));
    return { package: packageName, component: componentName, count: controllers.length, controllers };
};

/** 返回活动文档的选中对象（GetSelection）。参考 FairyGUI-MCP handleGetSelection。 */
export const handleGetSelection: MailboxHandler = () => {
    const doc = App.activeDoc as any;
    if (!doc) {
        return { selection: [], count: 0, message: "无活动文档" };
    }
    const selection = doc.GetSelection ? doc.GetSelection() : null;
    const result: unknown[] = [];
    if (selection && typeof selection.Count === "number") {
        for (let i = 0; i < selection.Count; i++) {
            const obj = selection.get_Item(i) as any;
            if (obj) {
                result.push({ id: obj.id ?? "", name: obj.name ?? "", objectType: obj.objectType ?? "unknown" });
            }
        }
    }
    return { selection: result, count: result.length, doc: doc.docURL };
};

/** 返回组件元信息（宽高/url/exported/type）。参考 FairyGUI-MCP handleGetComponentInfo。 */
export const handleGetComponentInfo: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["component"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 component");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!item) throw new Error(`组件不存在: ${packageName}/${componentName}`);
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

/** 返回编辑器控制台日志尾部（Unity Application.consoleLogPath 读取最近 N 行）。参数: 可选 lines（默认 100）。 */
export const handleGetLogs: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const lines = params["lines"] as number | undefined ?? 100;
    const path = (CS.UnityEngine as any).Application.consoleLogPath as string;
    if (!path || !CS.System.IO.File.Exists(path)) {
        return { logs: [], source: path ?? "", message: "控制台日志文件不存在" };
    }
    try {
        // Player.log 被 Unity 进程独占（无 FileShare 读取会 Sharing violation），用 FileShare.ReadWrite 流式读
        // d.ts 对 FileStream 构造/ReadToEnd 声明不全，以 any 访问（运行时 API 稳定）
        const IO = CS.System.IO as any;
        const stream = new IO.FileStream(
            path,
            IO.FileMode.Open,
            IO.FileAccess.Read,
            IO.FileShare.ReadWrite,
        );
        const reader = new IO.StreamReader(stream);
        const raw: string = reader.ReadToEnd();
        reader.Close();
        stream.Close();
        const parts = raw.split("\n");
        const tail = parts.slice(Math.max(0, parts.length - lines));
        return { logs: tail, count: tail.length, source: path };
    } catch (e: any) {
        throw new Error(`读取控制台日志失败: ${e && e.message ? e.message : e}`);
    }
};
