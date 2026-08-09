import FairyEditor = CS.FairyEditor;
import type { MailboxHandler } from "./server";

const App = FairyEditor.App;

/** 只读字段白名单：切换发布配置时禁止覆写（与 MenuMain_Publish.CopySetting 一致）。 */
const READONLY_KEYS = new Set(["fileName"]);

/** graph 组件禁令：项目禁止在组件源 XML 中使用 <graph>，纯色视觉必须走 sprite 图片。 */
const FORBIDDEN_OBJECT_TYPES = new Set(["graph"]);

/**
 * 禁止路径统一守卫：任何对象创建/写入前调用，屏蔽项目禁止的编辑路径。
 * 当前覆盖 graph 对象；transition XML 写入（Document.AddTransition）不在 handler 暴露面（8.2），
 * 读/播放能力保留在 read_document / fgui_list_transitions 对应读工具。
 */
export function assertForbiddenObjectType(type: string): void {
    if (FORBIDDEN_OBJECT_TYPES.has(type.toLowerCase())) {
        throw new Error(
            `禁止创建/修改 ${type} 对象：项目禁止 <graph> 节点，纯色视觉必须用 sprite 图片（bun run fgui sprite）生成像素图并以 <image> 引用`,
        );
    }
}

/** 打开组件文档并强制激活（与 insert_component 一致：操作对象必须是前台文档）。 */
function openDocForWrite(pkg: FairyEditor.FPackage, componentName: string): { doc: any; url: string } {
    const item = pkg.FindItemByName(componentName) || pkg.FindItemByName(`${componentName}.xml`);
    if (!item) throw new Error(`组件不存在: ${pkg.name}/${componentName}`);
    const url = item.GetURL();
    const doc: any = App.docView.OpenDocument(url, true);
    if (!doc) throw new Error(`打开文档失败: ${url}`);
    if ((App.docView.activeDoc as any) !== doc) {
        App.docView.activeDoc = doc;
    }
    return { doc, url };
}

/** 按对象 id 或 name 在文档 content 中查找子对象。 */
function findObjectInDoc(doc: any, idOrName: string): any {
    const content = doc.content;
    if (!content) throw new Error("文档无 content");
    return content.GetChildById(idOrName) || content.GetChild(idOrName);
}

/**
 * 按 id/name/文件名查找包内资源（FairyGUI-MCP reload 经验：FindItemByName 对带扩展名 image 名匹配不可靠）。
 * 优先 GetItem(id)，再 FindItemByName，最后 GetItemByFileName。
 */
function findResourceItem(pkg: FairyEditor.FPackage, ref: string): FairyEditor.FPackageItem | null {
    return pkg.GetItem(ref)
        || pkg.FindItemByName(ref)
        || pkg.FindItemByName(`${ref}.xml`)
        || pkg.GetItemByFileName(null, ref)
        || pkg.GetItemByFileName(null, `${ref}.png`)
        || pkg.GetItemByFileName(null, `${ref}.jpg`);
}

/**
 * 刷新包内容（FairyGUI-MCP reload 方案固化）：pkg.Touch() + 遍历 item.Touch() + 延迟 Touch，
 * 让编辑器感知源 XML/PNG 变更，比 App.RefreshProject 全量刷新更精准、不阻塞。参数: package、可选 full（全量刷新）。
 */
export const handleReloadPackage: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    if (params["full"] === true) {
        App.RefreshProject();
        return { reloaded: true, full: true, message: "已全量刷新工程（App.RefreshProject）" };
    }
    const packageName = params["package"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);

    const methodsSucceeded: string[] = [];
    const methodsFailed: string[] = [];
    // 方式1：pkg.Touch() 标记包刷新
    try {
        pkg.Touch();
        methodsSucceeded.push("pkg.Touch()");
    } catch (e: any) {
        methodsFailed.push(`pkg.Touch()(${e && e.message ? e.message : e})`);
    }
    // 方式2：遍历 item.Touch()（让每个资源项感知变更）
    try {
        const items = pkg.items;
        let touched = 0;
        if (items) {
            for (let i = 0; i < items.Count; i++) {
                const it = items.get_Item(i) as any;
                try {
                    if (it && typeof it.Touch === "function") {
                        it.Touch();
                        touched++;
                    }
                } catch {
                    /* 单项 Touch 失败跳过 */
                }
            }
        }
        methodsSucceeded.push(`item.Touch() x${touched}`);
    } catch (e: any) {
        methodsFailed.push(`item.Touch()(${e && e.message ? e.message : e})`);
    }
    // 方式3：延迟 0.2s 再 Touch 一次（给编辑器处理时间）
    try {
        CS.FairyGUI.Timers.inst.Add(0.2, 1, () => {
            try {
                pkg.Touch();
            } catch {
                /* 延迟 Touch 失败忽略 */
            }
        });
        methodsSucceeded.push("delayed pkg.Touch()");
    } catch (e: any) {
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
 * 保存全部未保存文档（写闭环必备）：任何内存态写操作后调用，保证磁盘 XML 与内存一致。
 * 供 publish 流程复用：发布前强制保存，避免 fgui_check_publish 因脏文档失真。
 */
export function saveAllDocuments(): { saved: number; hadUnsaved: boolean } {
    if (!App.project) throw new Error("无打开工程");
    const docView = App.docView as any;
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

/** 保存活动文档或全部未保存文档。参数: mode（active|all，默认 all）。 */
export const handleSaveDocuments: MailboxHandler = (params) => {
    if (!App.project) throw new Error("无打开工程");
    const docView = App.docView as any;
    const mode = params["mode"] as string | undefined;
    if (mode === "active") {
        const doc = docView.activeDoc as any;
        if (!doc) throw new Error("无活动文档可保存");
        docView.SaveDocument(doc);
        return { mode, saved: [doc.docURL], isModified: doc.isModified };
    }
    const result = saveAllDocuments();
    return { mode: "all", ...result };
};

/**
 * 资源导入：把外部文件（如 sprite CLI 生成的 PNG）导入包内并登记为资源。
 * 使用 ResourceImportQueue 批量语义（Create → Add → Process），不走对话框版 API（AI 无法点击）。
 * 部分失败语义：成功项保持已登记，错误项在结果中列出，不整体回滚。
 * 参数: package（目标包）、files（文件路径数组）、可选 path（目标目录，默认 /）、可选 resName（重命名）。
 */
export function createImportResourceHandler(server: import("./server").MailboxServer): MailboxHandler {
    return (params): { deferred: true; id: string } => {
        const project = App.project;
        if (!project) throw new Error("无打开工程");
        const packageName = params["package"] as string | undefined;
        const files = params["files"] as string[] | undefined;
        if (!packageName) throw new Error("缺少参数 package");
        if (!Array.isArray(files) || files.length === 0) throw new Error("缺少参数 files（至少一个文件路径）");
        for (const f of files) {
            if (!CS.System.IO.File.Exists(f)) {
                throw new Error(`文件不存在: ${f}`);
            }
        }
        const pkg = project.GetPackageByName(packageName);
        if (!pkg) throw new Error(`包不存在: ${packageName}`);

        const targetPath = (params["path"] as string | undefined) ?? "/";
        const resName = params["resName"] as string | undefined;
        const reqId = params["__requestId"] as string;
        if (!reqId) throw new Error("缺少请求 id（内部错误）");

        const queue = FairyEditor.ResourceImportQueue.Create(pkg);
        for (const file of files) {
            queue.Add(file, targetPath, resName);
        }
        try {
            queue.Process((items: any) => {
                const imported: unknown[] = [];
                const failed: string[] = [];
                if (items) {
                    for (let i = 0; i < items.Count; i++) {
                        const item = items.get_Item(i) as FairyEditor.FPackageItem;
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
        } catch (e: any) {
            server.writeResponse(reqId, { ok: false, error: String(e && e.message ? e.message : e) });
        }
        return { deferred: true, id: reqId };
    };
}

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

/**
 * 组件内创建并添加子对象。参数: package、doc（目标文档组件名）、type（image/text/component 等，graph 禁止）、
 * 可选 name、可选 src（资源 id/组件名）、可选 index（插入位置，默认 0）。返回新对象 id 与 childrenDelta。
 * 创建走 FObjectFactory.CreateObject(pkg, type)——内存态操作，需 fgui_save_documents 持久化。
 */
export const handleAddChild: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const type = params["type"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc（目标文档组件名）");
    if (!type) throw new Error("缺少参数 type（对象类型）");
    assertForbiddenObjectType(type);

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const content = doc.content;
    if (!content) throw new Error("文档无 content");

    // src 解析：兼容资源 id（pkg.GetItem）、资源名（FindItemByName）、文件名（GetItemByFileName）。image 通常用 id 最可靠。
    const src = params["src"] as string | undefined;
    let item: FairyEditor.FPackageItem | null = null;
    if (src && (type === "image" || type === "component" || type === "loader")) {
        item = findResourceItem(pkg, src);
        if (!item) throw new Error(`资源不存在: ${packageName}/${src}（可按 id/name/文件名引用）`);
    }

    // 有 src 时用 doc.InsertObject（编辑器自动建对象并挂资源，insert_component 已验证路径；resourceURL 只读 getter 无法手动挂载）
    const index = params["index"] as number | undefined;
    const beforeChildren = content.children ? content.children.Count : -1;
    let added: any;
    if (item) {
        doc.UnselectAll();
        added = doc.InsertObject(item.GetURL(), null, index ?? 0);
    } else {
        const obj = FairyEditor.FObjectFactory.NewObject(pkg, type);
        if (!obj) throw new Error(`FObjectFactory 创建对象失败: ${type}`);
        const name = params["name"] as string | undefined;
        if (name) obj.name = name;
        added = index !== undefined && index >= 0 ? content.AddChildAt(obj, index) : content.AddChild(obj);
    }
    // 命名：InsertObject 创建的对象 id 是自动的，按 name 参数设置
    const name = params["name"] as string | undefined;
    if (name && added && added.name !== name) {
        try {
            added.name = name;
        } catch {
            /* 重命名失败不影响结果 */
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

/**
 * 删除文档中的对象。参数: package、doc、target（对象 id 或 name）。
 * 返回 childrenDelta；被 relation/gear 引用的对象删除时返回引用警告。
 */
export const handleDeleteChild: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const target = params["target"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!target) throw new Error("缺少参数 target（对象 id 或 name）");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj) throw new Error(`文档中未找到对象: ${target}`);

    // 引用警告：检查其他子对象是否以 obj 为 relation target 或 gear 引用
    const warnings: string[] = [];
    const content = doc.content;
    if (content && content.children) {
        for (let i = 0; i < content.children.Count; i++) {
            const sibling = content.children.get_Item(i) as any;
            if (sibling === obj) continue;
            const relations = sibling.relations;
            if (relations && relations.items) {
                for (let r = 0; r < relations.items.Count; r++) {
                    const item = relations.items.get_Item(r) as any;
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

/** 对象属性白名单：只允许写可回滚的数值/字符串属性（避免破坏结构字段）。 */
const SETTABLE_PROPERTIES = new Set([
    "x", "y", "width", "height", "scaleX", "scaleY", "rotation", "alpha", "visible",
    "name", "text", "icon", "tooltips", "grayed", "enabled", "pivotX", "pivotY", "skewX", "skewY",
]);
/**
 * 修改已打开文档中对象的属性。参数: package、doc、target（对象 id 或 name）、properties（键值对象）。
 * 只允许白名单内属性；graph 类型对象拒绝（项目禁令）。返回更新后的属性快照。
 */
export const handleSetObjectProperty: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const target = params["target"] as string | undefined;
    const properties = params["properties"] as Record<string, unknown> | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!target) throw new Error("缺少参数 target");
    if (!properties || typeof properties !== "object" || Object.keys(properties).length === 0) {
        throw new Error("缺少参数 properties（至少一个键值）");
    }

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj) throw new Error(`文档中未找到对象: ${target}`);
    if (obj.objectType) assertForbiddenObjectType(String(obj.objectType));

    const applied: Record<string, unknown> = {};
    const rejected: string[] = [];
    for (const key of Object.keys(properties)) {
        if (!SETTABLE_PROPERTIES.has(key)) {
            rejected.push(key);
            continue;
        }
        try {
            obj[key] = properties[key];
            applied[key] = obj[key];
        } catch (e: any) {
            rejected.push(`${key}(${e && e.message ? e.message : e})`);
        }
    }
    doc.SetModified(true);

    if (applied["x"] !== undefined || applied["y"] !== undefined || applied["width"] !== undefined || applied["height"] !== undefined) {
        try {
            obj.UpdateGear(0);
        } catch {
            /* gear 同步失败不影响属性写入 */
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

/** sidePair 两侧合法值（与 tools/fgui validate 一致）：基础 side + ext 后缀。 */
const SIDE_PAIR_BASE = new Set([
    "left", "right", "top", "bottom", "middle", "center", "width", "height",
    "leftext", "rightext", "topext", "bottomext",
]);

/**
 * 校验单个 sidePair 项（如 "width-width%" / "leftext-right"），合法返回 true。
 * 语义与 tools/fgui validate 一致：仅当 pair 以 % 结尾时去掉末尾 %（百分比只允许在自身 side），
 * 然后按 "-" split；两侧都必须在合法集合内。target side 带 %（如 "width%-width"）非法。
 */
export function isValidSidePair(pair: string): boolean {
    const trimmed = pair.trim();
    const normalized = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
    const parts = normalized.split("-");
    if (parts.length !== 2) return false;
    const targetSide = parts[0]!;
    const selfSide = parts[1]!;
    return SIDE_PAIR_BASE.has(targetSide) && SIDE_PAIR_BASE.has(selfSide);
}

/** 校验 sidePair 描述串：以逗号分隔的 1-2 项，每项合法（同 CLI validate 语义）。 */
function validateSidePair(sidePair: string): void {
    const pairs = sidePair.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (pairs.length === 0) throw new Error("sidePair 不能为空");
    if (pairs.length > 2) throw new Error(`sidePair 最多 2 项（单个 relation 最多两个约束），收到 ${pairs.length} 项: ${sidePair}`);
    for (const pair of pairs) {
        if (!isValidSidePair(pair)) {
            throw new Error(`非法 sidePair 项: ${pair}（格式 目标side-自身side，自身侧可加 % 百分比；合法 side: left/right/top/bottom/middle/center/width/height + ext 后缀）`);
        }
    }
}

/**
 * 控制器管理：列出/新增/更新/删除/切页。
 * 新增走 Document.AddController(xml)；切页走 Document.SwitchPage(name, index)。
 * 页面列表与 selected 合法性在 handler 层校验（与 tools/fgui validate 语义一致）。
 */

/** 构造控制器 XML（name + pages 扁平串 + selected）。 */
function buildControllerXml(name: string, pages: string[], selected: number): any {
    if (pages.length === 0) throw new Error("控制器页面不能为空");
    // pages 扁平串：索引,名称 成对。页面名不能为空（tools/fgui validate 对空 page name 报错，见 fgui.ts validateControllerSemantics）
    const flat: string[] = [];
    for (let i = 0; i < pages.length; i++) {
        const pageName = pages[i] ?? "";
        if (!pageName.trim()) throw new Error(`控制器页面 ${i} 名称为空，validate --strict 会拒绝（项目要求非空页面名）`);
        flat.push(String(i), pageName);
    }
    const xml = CS.FairyGUI.Utils.XML.Create("controller");
    xml.SetAttribute("name", name);
    xml.SetAttribute("pages", flat.join(","));
    if (selected < 0 || selected >= pages.length) throw new Error(`selected 越界: ${selected}（页面数 ${pages.length}）`);
    xml.SetAttribute("selected", String(selected));
    return xml;
}

/** 新增控制器。参数: package、doc、name、pages（页面名数组）、可选 selected（默认 0）。 */
export const handleAddController: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const name = params["name"] as string | undefined;
    const pages = params["pages"] as string[] | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!name) throw new Error("缺少参数 name（控制器名称）");
    if (!Array.isArray(pages) || pages.length === 0) throw new Error("缺少参数 pages（页面名数组）");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const selected = params["selected"] as number | undefined ?? 0;
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

/** 更新控制器（整体替换页面与选中页）。参数: package、doc、name、可选 pages、可选 selected。 */
export const handleUpdateController: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const name = params["name"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!name) throw new Error("缺少参数 name");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);

    const pages = params["pages"] as string[] | undefined;
    const selected = params["selected"] as number | undefined;
    if (!pages && selected === undefined) {
        throw new Error("至少提供 pages 或 selected 之一");
    }
    // 基于现有控制器构造新 XML（页面可部分更新）
    const existing = doc.content ? doc.content.GetController(name) : null;
    if (!existing) throw new Error(`控制器不存在: ${name}`);
    let pagesFlat: string[] = [];
    if (pages) {
        pagesFlat = pages;
    } else {
        const list = existing.GetPages();
        for (let i = 0; i < list.Count; i++) {
            const p = list.get_Item(i) as any;
            pagesFlat.push(p.name ?? "");
        }
    }
    const sel = selected ?? existing.selectedIndex ?? 0;
    const xml = buildControllerXml(name, pagesFlat, sel);
    doc.UpdateController(name, xml);
    doc.SetModified(true);
    return { updated: true, name, pages: pagesFlat, selected: sel, isModified: doc.isModified, note: "需 fgui_save_documents 持久化" };
};

/** 删除控制器。参数: package、doc、name。被 gearDisplay/gearXY 等引用时返回引用警告，不静默破坏。 */
export const handleRemoveController: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const name = params["name"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!name) throw new Error("缺少参数 name");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const content = doc.content;
    if (!content) throw new Error("文档无 content");

    const existing = content.GetController(name);
    if (!existing) throw new Error(`控制器不存在: ${name}`);

    // 引用警告：子对象 CheckGearsController 是否绑定该控制器
    const warnings: string[] = [];
    const children = content.children;
    if (children) {
        for (let i = 0; i < children.Count; i++) {
            const child = children.get_Item(i) as any;
            try {
                if (child && typeof child.CheckGearsController === "function" && child.CheckGearsController(existing)) {
                    warnings.push(`对象 ${child.name || child.id} 的 gear 绑定控制器 ${name}`);
                }
            } catch {
                /* 个别对象无 gear 检查能力，跳过 */
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

/** 切换控制器页面。参数: package、doc、name、index（目标页索引）或 page（目标页名）。 */
export const handleSwitchPage: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const name = params["name"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!name) throw new Error("缺少参数 name");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const content = doc.content;
    if (!content) throw new Error("文档无 content");
    const ctrl = content.GetController(name);
    if (!ctrl) throw new Error(`控制器不存在: ${name}`);

    let index: number;
    const pageArg = params["page"] as string | undefined;
    const indexArg = params["index"] as number | undefined;
    if (pageArg !== undefined) {
        const pageCount = ctrl.pageCount;
        let found = -1;
        const names = ctrl.GetPageNames();
        if (names) {
            for (let i = 0; i < names.Count; i++) {
                if (names.get_Item(i) === pageArg) { found = i; break; }
            }
        }
        if (found < 0) throw new Error(`页面不存在: ${pageArg}（可用页面: ${pageCount} 个）`);
        index = found;
    } else if (indexArg !== undefined) {
        if (indexArg < 0 || indexArg >= ctrl.pageCount) throw new Error(`索引越界: ${indexArg}（页面数 ${ctrl.pageCount}）`);
        index = indexArg;
    } else {
        throw new Error("缺少参数 index 或 page（目标页）");
    }

    const newIndex = doc.SwitchPage(name, index);
    doc.SetModified(true);
    return { controller: name, switched: true, newIndex, isModified: doc.isModified, note: "需 fgui_save_documents 持久化" };
};

/**
 * 设置对象关系。参数: package、doc、target（对象 id 或 name）、targetRelation（目标对象 id/name 或空=父级）、
 * sidePair（如 "width-width,height-height"）。
 * 走 DocElement.SetRelation(target, desc)；内置 sidePair ≤2 与合法取值校验。
 */
export const handleSetRelation: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const target = params["target"] as string | undefined;
    const sidePair = params["sidePair"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!target) throw new Error("缺少参数 target（被设置关系的对象）");
    if (!sidePair) throw new Error("缺少参数 sidePair");
    validateSidePair(sidePair);

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj) throw new Error(`文档中未找到对象: ${target}`);

    const relationTargetName = params["targetRelation"] as string | undefined;
    let relationTarget: any;
    if (relationTargetName === undefined || relationTargetName === "") {
        relationTarget = doc.content; // 空 = 父组件
    } else {
        relationTarget = findObjectInDoc(doc, relationTargetName);
        if (!relationTarget) throw new Error(`关系目标对象未找到: ${relationTargetName}`);
    }

    const docElement = obj.docElement as any;
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

/** 删除对象关系。参数: package、doc、target、targetRelation（目标对象 id/name 或空=父级）。 */
export const handleRemoveRelation: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const target = params["target"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!target) throw new Error("缺少参数 target");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj) throw new Error(`文档中未找到对象: ${target}`);

    const relationTargetName = params["targetRelation"] as string | undefined;
    let relationTarget: any;
    if (relationTargetName === undefined || relationTargetName === "") {
        relationTarget = doc.content;
    } else {
        relationTarget = findObjectInDoc(doc, relationTargetName);
        if (!relationTarget) throw new Error(`关系目标对象未找到: ${relationTargetName}`);
    }

    const docElement = obj.docElement as any;
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

/** 新建包。参数: name（包名）。返回包 id/name。 */
export const handleCreatePackage: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const name = params["name"] as string | undefined;
    if (!name) throw new Error("缺少参数 name（包名）");
    const existing = project.GetPackageByName(name);
    if (existing) throw new Error(`包已存在: ${name}`);
    const pkg = project.CreatePackage(name);
    if (!pkg) throw new Error(`CreatePackage 失败: ${name}`);
    pkg.Save();
    project.Save();
    return { created: true, id: pkg.id, name: pkg.name };
};

/** 删除包（破坏性）：先返回影响范围（包内资源数 + 被引用项），调用方二次确认后才执行。参数: package。 */
export const handleDeletePackage: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);

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

/** 在包内创建文件夹。参数: package、name、可选 path（父目录，默认 /）。 */
export const handleCreateFolder: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const name = params["name"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!name) throw new Error("缺少参数 name（文件夹名）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const path = (params["path"] as string | undefined) ?? "/";
    const folder = pkg.CreateFolder(name, path);
    if (!folder) throw new Error(`CreateFolder 失败: ${name}@${path}`);
    pkg.Save();
    return { created: true, id: folder.id, name: folder.name, path: folder.path };
};

/** 重命名资源。参数: package、name（原资源名）、newName。 */
export const handleRenameResource: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const name = params["name"] as string | undefined;
    const newName = params["newName"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!name) throw new Error("缺少参数 name（资源名）");
    if (!newName) throw new Error("缺少参数 newName");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(name) || pkg.FindItemByName(`${name}.xml`);
    if (!item) throw new Error(`资源不存在: ${packageName}/${name}`);
    pkg.RenameItem(item, newName);
    pkg.Save();
    return { renamed: true, id: item.id, name: item.name, oldName: name };
};

/** 移动资源到目标路径。参数: package、name、path（目标路径，如 /SubFolder）。 */
export const handleMoveResource: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const name = params["name"] as string | undefined;
    const path = params["path"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!name) throw new Error("缺少参数 name");
    if (!path) throw new Error("缺少参数 path（目标目录）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const item = pkg.FindItemByName(name) || pkg.FindItemByName(`${name}.xml`);
    if (!item) throw new Error(`资源不存在: ${packageName}/${name}`);
    pkg.MoveItem(item, path);
    pkg.Save();
    return { moved: true, id: item.id, name: item.name, path: item.path };
};

/**
 * 删除资源（破坏性）：被其他组件引用时返回清单并拒绝。参数: package、name（id/name/文件名均可）、可选 confirm。
 */
export const handleDeleteResource: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const name = params["name"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!name) throw new Error("缺少参数 name");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const item = findResourceItem(pkg, name);
    if (!item) throw new Error(`资源不存在: ${packageName}/${name}（可按 id/name/文件名引用）`);

    // 引用检查：DependencyQuery 查谁引用该资源
    const references: string[] = [];
    try {
        const query = new FairyEditor.DependencyQuery();
        query.QueryReferences(project, item.GetURL());
        const refs = query.references;
        if (refs) {
            for (let i = 0; i < refs.Count; i++) {
                const ref = refs.get_Item(i) as any;
                const owner = ref.ownerPkg;
                references.push(`${owner ? owner.name : "?"}/${ref.itemId}`);
            }
        }
    } catch {
        /* 引用查询失败不阻塞删除（兜底：仍返回影响面提示） */
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

/** 创建空组件资源。参数: package、name、可选 width/height（默认 100x100）、可选 path。 */
export const handleCreateComponent: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const name = params["name"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!name) throw new Error("缺少参数 name（组件名）");
    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const width = params["width"] as number | undefined ?? 100;
    const height = params["height"] as number | undefined ?? 100;
    const path = (params["path"] as string | undefined) ?? "/";
    const item = pkg.CreateComponentItem(name, width, height, path);
    if (!item) throw new Error(`CreateComponentItem 失败: ${name}`);
    pkg.Save();
    return { created: true, id: item.id, name: item.name, path: item.path, type: item.type };
};

/**
 * 跨包复制组件（带依赖）。参数: sourcePackage、name、targetPackage、可选 targetPath（默认 /）。
 * 基于探针结论用 CopyHandler 实现；返回 id 映射（源→目标）。
 */
export const handleCopyItems: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const sourcePackage = params["sourcePackage"] as string | undefined;
    const name = params["name"] as string | undefined;
    const targetPackage = params["targetPackage"] as string | undefined;
    if (!sourcePackage) throw new Error("缺少参数 sourcePackage");
    if (!name) throw new Error("缺少参数 name");
    if (!targetPackage) throw new Error("缺少参数 targetPackage");
    if (sourcePackage === targetPackage) throw new Error("源包与目标包不能相同");

    const srcPkg = project.GetPackageByName(sourcePackage);
    if (!srcPkg) throw new Error(`源包不存在: ${sourcePackage}`);
    const targetPkg = project.GetPackageByName(targetPackage);
    if (!targetPkg) throw new Error(`目标包不存在: ${targetPackage}`);
    const item = srcPkg.FindItemByName(name) || srcPkg.FindItemByName(`${name}.xml`);
    if (!item) throw new Error(`资源不存在: ${sourcePackage}/${name}`);

    const targetPath = (params["targetPath"] as string | undefined) ?? "/";
    // 探针结论：InitWithItems 的 IList 互操作在 Puerts 不可用；用 InitWithObject（doc.Serialize XML）路径
    const doc: any = App.docView.OpenDocument(item.GetURL(), false);
    if (!doc) throw new Error(`打开源文档失败: ${item.GetURL()}`);
    const xml = doc.Serialize();
    if (!xml) throw new Error("源文档 Serialize 返回空 XML");
    const handler = new FairyEditor.CopyHandler();
    handler.InitWithObject(srcPkg, xml, targetPkg, targetPath, false);
    handler.Copy(targetPkg, FairyEditor.CopyHandler.OverrideOption.RENAME, false);

    // 复制后目标包可能未打开，Open 刷新再查找（探针取证经验）
    let copied: FairyEditor.FPackageItem | null = null;
    try {
        targetPkg.Open();
        copied = targetPkg.FindItemByName(`${name}.xml`) || targetPkg.FindItemByName(name);
    } catch {
        /* 刷新失败不影响结果 */
    }
    const idMapping: Record<string, string> = { [item.id]: copied ? copied.id : "" };
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

/** 返回分支清单（读侧能力，与 read 工具集一致但随写工具返回可编程上下文）。 */
export const handleListBranches: MailboxHandler = () => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const branches: string[] = [];
    const all = project.allBranches;
    if (all) {
        for (let i = 0; i < all.Count; i++) branches.push(all.get_Item(i));
    }
    return { activeBranch: project.activeBranch, branches };
};

/** 切换活动分支。参数: branch（目标分支名）。 */
export const handleSwitchBranch: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const branch = params["branch"] as string | undefined;
    if (!branch) throw new Error("缺少参数 branch");
    const branches: string[] = [];
    const all = project.allBranches;
    if (all) {
        for (let i = 0; i < all.Count; i++) branches.push(all.get_Item(i));
    }
    if (!branches.includes(branch)) {
        throw new Error(`分支不存在: ${branch}（可用分支: ${branches.join(",") || "无（仅主干）"}）`);
    }
    project.activeBranch = branch;
    project.Save();
    return { switched: true, activeBranch: project.activeBranch, branches };
};

/**
 * 截图采集（视觉验证通道）：FairyGUI 官方方案（参考 FairyGUI-MCP 实测路径）——
 * doc.content.displayObject.GetScreenShot(extend, scale) → ImageConversion.EncodeToPNG → File.WriteAllBytes。
 * editor.d.ts 已声明 GetScreenShot；EncodeToPNG 未声明但运行时可用（以 any 访问）。
 * GetScreenShot 在编辑器主线程执行可能耗时，故走 deferred：返回 {deferred:true}，用 Timers 延迟执行
 * 截图后 writeResponse 补写，避免阻塞邮箱 tick 轮询。
 */
export function createCapturePreviewHandler(server: import("./server").MailboxServer): MailboxHandler {
    return (params): { deferred: true; id: string } => {
        const project = App.project;
        if (!project) throw new Error("无打开工程");
        const outDir = `${project.objsPath}/fgui-mcp-probe/capture`;
        try {
            CS.System.IO.Directory.CreateDirectory(outDir);
        } catch (e: any) {
            throw new Error(`创建截图目录失败: ${e && e.message ? e.message : e}`);
        }
        const reqId = params["__requestId"] as string;
        if (!reqId) throw new Error("缺少请求 id（内部错误）");
        const outPng = `${outDir}/capture_${Date.now()}.png`;

        const doCapture = (): void => {
            try {
                const docArg = params["doc"] as string | undefined;
                let activeDoc: any = App.activeDoc;
                if (docArg) {
                    const pkg = project.GetPackageByName(params["package"] as string ?? "Demo");
                    if (!pkg) throw new Error(`包不存在: ${params["package"]}`);
                    const item = pkg.FindItemByName(docArg) || pkg.FindItemByName(`${docArg}.xml`);
                    if (!item) throw new Error(`组件不存在: ${docArg}`);
                    activeDoc = App.docView.FindDocument(item.GetURL()) || App.docView.OpenDocument(item.GetURL(), false);
                }
                if (!activeDoc) throw new Error("无活动文档可截图（或组件未打开）");
                const content = activeDoc.content as any;
                if (!content) throw new Error("文档无 content");
                const displayObj = content.displayObject as any;
                if (!displayObj) throw new Error("文档 displayObject 为空");

                const texture = displayObj.GetScreenShot(null, 1);
                if (!texture) throw new Error("GetScreenShot 返回空 Texture2D");

                // EncodeToPNG 用 UnityEngine.ImageConversion 静态方法（FairyGUI-MCP 实测路径；d.ts 未声明，以 any 访问）
                const ImageConversion = (CS.UnityEngine as any).ImageConversion;
                if (!ImageConversion || typeof ImageConversion.EncodeToPNG !== "function") {
                    throw new Error("UnityEngine.ImageConversion.EncodeToPNG 不可用");
                }
                const pngBytes: any = ImageConversion.EncodeToPNG(texture);
                if (!pngBytes) throw new Error("EncodeToPNG 返回空");
                CS.System.IO.File.WriteAllBytes(outPng, pngBytes);
                try {
                    CS.UnityEngine.Object.Destroy(texture);
                } catch {
                    /* 释放失败不影响结果 */
                }
                if (!CS.System.IO.File.Exists(outPng)) {
                    throw new Error(`截图失败：未产出 PNG: ${outPng}`);
                }
                // FileInfo.Length 是 C# long → Puerts BigInt，JSON.stringify 无法序列化，须转 Number
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
            } catch (e: any) {
                server.writeResponse(reqId, { ok: false, error: `截图失败: ${e && e.message ? e.message : e}` });
            }
        };

        // deferred：延迟一拍执行，避免 GetScreenShot 阻塞当前邮箱 tick
        try {
            CS.FairyGUI.Timers.inst.Add(0.2, 1, doCapture);
        } catch {
            // Timers 不可用时同步执行（可能阻塞 tick，但保证有响应）
            doCapture();
        }
        return { deferred: true, id: reqId };
    };
}

/** 独立打开组件文档并激活。参数: package、component。参考 FairyGUI-MCP handleOpenComponent。 */
export const handleOpenComponent: MailboxHandler = (params) => {
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
    const doc: any = App.docView.OpenDocument(url, true);
    if (!doc) throw new Error(`打开文档失败: ${url}`);
    return { opened: true, url, name: item.name, path: item.path, displayTitle: doc.displayTitle };
};

/** 预览组件（App.ShowPreview）。参数: package、component。 */
export const handleShowPreview: MailboxHandler = (params) => {
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
    App.ShowPreview(item);
    return { previewing: true, url: item.GetURL(), name: item.name };
};

/** 选中文档中的元素。参数: package、doc、target（对象 id 或 name）。参考 FairyGUI-MCP handleSelectElement。 */
export const handleSelectElement: MailboxHandler = (params) => {
    const project = App.project;
    if (!project) throw new Error("无打开工程");
    const packageName = params["package"] as string | undefined;
    const componentName = params["doc"] as string | undefined;
    const target = params["target"] as string | undefined;
    if (!packageName) throw new Error("缺少参数 package");
    if (!componentName) throw new Error("缺少参数 doc");
    if (!target) throw new Error("缺少参数 target");

    const pkg = project.GetPackageByName(packageName);
    if (!pkg) throw new Error(`包不存在: ${packageName}`);
    const { doc } = openDocForWrite(pkg, componentName);
    const obj = findObjectInDoc(doc, target);
    if (!obj) throw new Error(`文档中未找到对象: ${target}`);
    doc.UnselectAll();
    doc.SelectObject(obj, true, true);
    const selected = doc.GetSelection ? doc.GetSelection() : null;
    const count = selected && typeof selected.Count === "number" ? selected.Count : 0;
    return { selected: count > 0, target, id: obj.id, name: obj.name, selectionCount: count };
};

/** 关闭活动文档或指定文档。参数: 可选 doc（组件名）。参考 FairyGUI-MCP handleClose。 */
export const handleCloseDocument: MailboxHandler = (params) => {
    if (!App.project) throw new Error("无打开工程");
    const docArg = params["doc"] as string | undefined;
    let doc: any;
    if (docArg) {
        const project = App.project;
        const packageName = params["package"] as string | undefined;
        if (!packageName) throw new Error("缺少参数 package（关闭指定文档时必填）");
        const pkg = project.GetPackageByName(packageName);
        if (!pkg) throw new Error(`包不存在: ${packageName}`);
        const item = pkg.FindItemByName(docArg) || pkg.FindItemByName(`${docArg}.xml`);
        if (!item) throw new Error(`组件不存在: ${packageName}/${docArg}`);
        doc = App.docView.FindDocument(item.GetURL());
        if (!doc) throw new Error(`文档未打开: ${docArg}`);
    } else {
        doc = App.activeDoc;
        if (!doc) throw new Error("无活动文档可关闭");
    }
    App.docView.CloseDocument(doc);
    return { closed: true, doc: doc.docURL };
};

/** 清空编辑器控制台日志（ConsoleView.Clear）。 */
export const handleClearLogs: MailboxHandler = () => {
    if (!App.project) throw new Error("无打开工程");
    try {
        App.consoleView.Clear();
        return { cleared: true };
    } catch (e: any) {
        throw new Error(`清空控制台失败: ${e && e.message ? e.message : e}`);
    }
};
