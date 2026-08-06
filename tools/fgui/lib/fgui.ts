/**
 * FGUI 确定性操作核心：定位 FGUI 项目、解析 package.xml 资源清单、
 * 解析组件 XML、引用完整性校验、短 id 分配。
 * 所有输入输出均为纯数据，供 CLI 与测试复用。
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { findChild, parseXml, type XmlElement } from "./xml";

/** 仓库根：lib/fgui.ts → lib → tools → tools/fgui → tools → 仓库根 */
export const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");

export interface FguiProject {
  readonly root: string;
  /** FGUI 工程目录，含 *.fairy */
  readonly projectDir: string;
  /** 工程名（如 demo） */
  readonly name: string;
  /** assets 目录 */
  readonly assetsDir: string;
}

export interface PackageResource {
  readonly kind: "component" | "image" | "movieclip";
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly exported: boolean;
  readonly scale9grid?: string;
}

export interface FguiPackage {
  readonly id: string;
  readonly name: string;
  readonly dir: string;
  readonly resources: readonly PackageResource[];
}

export interface ObjectIndex {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly xy?: string;
  readonly size?: string;
  readonly src?: string;
  readonly fileName?: string;
  readonly pkg?: string;
  readonly visible?: string;
}

export interface ComponentInfo {
  readonly file: string;
  readonly root: XmlElement;
  readonly objects: readonly ObjectIndex[];
}

export class FguiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FguiError";
  }
}

/** 定位 FGUI 工程目录：默认 ui/demo；显式传入时以项目根为基准。 */
export function locateProject(projectArg?: string): FguiProject {
  const projectDir = projectArg
    ? resolve(PROJECT_ROOT, projectArg)
    : join(PROJECT_ROOT, "ui", "demo");

  if (!existsSync(projectDir)) throw new FguiError(`FGUI 工程目录不存在: ${projectDir}`);
  const fairies = findFairyFiles(projectDir);
  if (fairies.length === 0) throw new FguiError(`FGUI 工程目录缺少 *.fairy: ${projectDir}`);

  return {
    root: PROJECT_ROOT,
    projectDir,
    name: basename(projectDir),
    assetsDir: join(projectDir, "assets"),
  };
}

function findFairyFiles(dir: string): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const entries = readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".fairy")) out.push(entry.name);
  }
  return out;
}

/** 列出工程下所有包（含 package.xml 的 assets 子目录）。 */
export function listPackages(project: FguiProject): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  if (!existsSync(project.assetsDir)) return [];
  const names = readdirSync(project.assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return names.filter((name) => existsSync(join(project.assetsDir, name, "package.xml")));
}

/** 解析包目录，返回包信息与资源清单。 */
export function readPackage(project: FguiProject, packageName: string): FguiPackage {
  const dir = join(project.assetsDir, packageName);
  const packageXmlPath = join(dir, "package.xml");
  if (!existsSync(packageXmlPath)) {
    throw new FguiError(`包不存在或无 package.xml: ${packageName}`);
  }

  const root = parseXml(readFileSync(packageXmlPath, "utf8"));
  const resourcesNode = findChild(root, "resources");
  const resources: PackageResource[] = (resourcesNode?.children ?? [])
    .map((node): PackageResource | undefined => {
      const kind = node.name;
      if (kind !== "component" && kind !== "image" && kind !== "movieclip") return undefined;
      return {
        kind,
        id: node.attrs.id ?? "",
        name: node.attrs.name ?? "",
        path: node.attrs.path ?? "/",
        exported: node.attrs.exported === "true",
        ...(node.attrs.scale9grid ? { scale9grid: node.attrs.scale9grid } : {}),
      };
    })
    .filter((r): r is PackageResource => r !== undefined && r.id.length > 0);

  return { id: root.attrs.id ?? "", name: packageName, dir, resources };
}

/** 校验包内资源 id 是否唯一，返回冲突项。 */
export function findResourceIdConflicts(pkg: FguiPackage): string[] {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const r of pkg.resources) {
    if (seen.has(r.id)) dup.push(r.id);
    seen.add(r.id);
  }
  return dup;
}

/**
 * 读取组件 XML 并建立对象索引。
 * componentName 可传文件名（Foo.xml）或不带扩展名（Foo）。
 * 组件文件可能位于包内子目录（package.xml 的 path 属性），按名称递归定位。
 */
export function readComponent(
  project: FguiProject,
  packageName: string,
  componentName: string,
): ComponentInfo {
  const pkgDir = join(project.assetsDir, packageName);
  const fileName = componentName.endsWith(".xml") ? componentName : `${componentName}.xml`;
  const file = resolveComponentFile(pkgDir, fileName);
  if (file === undefined) throw new FguiError(`组件不存在: ${packageName}/${fileName}`);

  const root = parseXml(readFileSync(file, "utf8"));
  const objects = collectObjects(root);
  return { file, root, objects };
}

/** 在包目录内按文件名递归定位组件（兼容 path 子目录）。 */
function resolveComponentFile(pkgDir: string, fileName: string): string | undefined {
  const direct = join(pkgDir, fileName);
  if (existsSync(direct)) return direct;
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const entries = readdirSync(pkgDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hit = resolveComponentFile(join(pkgDir, entry.name), fileName);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** 收集组件内所有带 id 的对象（含 displayList 内的嵌套），用于索引。 */
function collectObjects(root: XmlElement): ObjectIndex[] {
  const displayList = findChild(root, "displayList");
  if (!displayList) return [];
  const out: ObjectIndex[] = [];
  for (const node of displayList.children) {
    collectNode(node, out);
  }
  return out;
}

function collectNode(node: XmlElement, out: ObjectIndex[]): void {
  const id = node.attrs.id;
  if (id) {
    out.push({
      id,
      name: node.attrs.name ?? "",
      type: node.name,
      ...(node.attrs.xy ? { xy: node.attrs.xy } : {}),
      ...(node.attrs.size ? { size: node.attrs.size } : {}),
      ...(node.attrs.src ? { src: node.attrs.src } : {}),
      ...(node.attrs.fileName ? { fileName: node.attrs.fileName } : {}),
      ...(node.attrs.pkg ? { pkg: node.attrs.pkg } : {}),
      ...(node.attrs.visible !== undefined ? { visible: node.attrs.visible } : {}),
    });
  }
  // displayList 与 group 内的子对象继续收集
  for (const child of node.children) {
    if (child.name === "displayList" || child.name === "group" || isDisplayObject(child)) {
      collectNode(child, out);
    }
  }
}

const DISPLAY_TYPES = new Set([
  "image", "graph", "text", "loader", "component", "list", "movieclip",
]);

function isDisplayObject(node: XmlElement): boolean {
  return DISPLAY_TYPES.has(node.name);
}

/** 校验组件引用完整性，返回问题列表（空 = 全部通过）。 */
export interface ValidationIssue {
  readonly severity: "error" | "warning";
  readonly message: string;
}

export function validateComponent(
  project: FguiProject,
  pkg: FguiPackage,
  component: ComponentInfo,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pkgId = new Map(pkg.resources.map((r) => [r.id, r]));

  // 1. 对象 id 唯一
  const seenIds = new Map<string, string>();
  for (const obj of component.objects) {
    const existing = seenIds.get(obj.id);
    if (existing) {
      issues.push({ severity: "error", message: `对象 id 重复: "${obj.id}"（${existing} 与 ${obj.name}）` });
    } else {
      seenIds.set(obj.id, obj.name);
    }
  }

  // 2. 资源引用有效（src 指向本包或跨包）
  for (const obj of component.objects) {
    if (!obj.src) continue;
    if (obj.pkg) {
      // 跨包引用 ui://pkgid...：无法在本包校验目标，仅提示人工确认
      issues.push({
        severity: "warning",
        message: `跨包引用 ${obj.name} → pkg=${obj.pkg} src=${obj.src}，请在目标包确认资源存在`,
      });
      continue;
    }
    if (!pkgId.has(obj.src)) {
      issues.push({
        severity: "error",
        message: `资源引用不存在: ${obj.name} → src="${obj.src}"（package.xml 未登记）`,
      });
    }
  }

  // 3. relation target 指向存在对象（target 非空时）
  for (const node of collectAllDisplayNodes(component.root)) {
    for (const relation of node.children.filter((c) => c.name === "relation")) {
      const target = relation.attrs.target;
      if (!target) continue;
      if (target === "0") continue; // 0 表示根
      if (!seenIds.has(target)) {
        issues.push({
          severity: "error",
          message: `relation target 不存在: "${target}"（节点 ${node.attrs.id ?? node.attrs.name ?? "?"}）`,
        });
      }
    }
  }

  return issues;
}

function collectAllDisplayNodes(root: XmlElement): XmlElement[] {
  const displayList = findChild(root, "displayList");
  if (!displayList) return [];
  const out: XmlElement[] = [];
  const walk = (node: XmlElement): void => {
    out.push(node);
    for (const child of node.children) walk(child);
  };
  for (const child of displayList.children) walk(child);
  return out;
}

interface ControllerInfo {
  readonly name: string;
  readonly pageIds: readonly string[];
  readonly pageNames: readonly string[];
}

/** 解析组件内所有 <controller> 声明。 */
function collectControllers(root: XmlElement): ControllerInfo[] {
  const out: ControllerInfo[] = [];
  for (const node of root.children) {
    if (node.name !== "controller") continue;
    const pagesRaw = node.attrs.pages ?? "";
    const parts = pagesRaw.split(",");
    const pageIds: string[] = [];
    const pageNames: string[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      pageIds.push(parts[i]!);
      pageNames.push(parts[i + 1]!);
    }
    out.push({ name: node.attrs.name ?? "", pageIds, pageNames });
  }
  return out;
}

const VALID_RELATION_SIDES = new Set([
  "left", "right", "top", "bottom", "middle", "center", "width", "height",
  "leftext", "rightext", "topext", "bottomext",
]);

/** 校验单个 sidePair 项（如 "width-width%" / "leftext-right"），合法返回 undefined，否则返回问题描述。 */
function validateSidePair(pair: string): string | undefined {
  const normalized = pair.endsWith("%") ? pair.slice(0, -1) : pair;
  const parts = normalized.split("-");
  if (parts.length !== 2) return `sidePair 项 "${pair}" 不是 "目标side-自身side" 形式`;
  const [targetSide, selfSide] = parts as [string, string];
  if (!VALID_RELATION_SIDES.has(targetSide)) return `sidePair 含非法目标 side "${targetSide}"（项 "${pair}"）`;
  if (!VALID_RELATION_SIDES.has(selfSide)) return `sidePair 含非法自身 side "${selfSide}"（项 "${pair}"）`;
  return undefined;
}

/** 校验组件语义（controller/gear/扩展节点/list/graph/relation），返回问题列表。 */
export function validateComponentSemantics(
  project: FguiProject,
  pkg: FguiPackage,
  component: ComponentInfo,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const root = component.root;

  // 0. 禁止 <graph>
  for (const node of collectAllDisplayNodes(root)) {
    if (node.name === "graph") {
      issues.push({
        severity: "error",
        message: `组件含 <graph> 节点（id="${node.attrs.id ?? ""}" name="${node.attrs.name ?? ""}"），项目禁止使用，纯色视觉必须用 sprite 图片替代`,
      });
    }
  }

  const controllers = collectControllers(root);
  const controllerMap = new Map(controllers.map((c) => [c.name, c]));

  // 1. controller pages 必须是完整 pageId,pageName 对
  for (const c of controllers) {
    const raw = c.pageIds.length + c.pageNames.length;
    if (raw === 0) continue; // 无 pages 视为合法
    const parts = (root.children.find((n) => n.name === "controller" && n.attrs.name === c.name)?.attrs.pages ?? "").split(",");
    if (parts.length % 2 !== 0) {
      issues.push({
        severity: "error",
        message: `controller "${c.name}" 的 pages 不是完整 pageId,pageName 对: "${parts.join(",")}"`,
      });
    }
  }

  // 2. gear 引用检查：controller 存在、pages 值 ∈ pageIds、values 数量一致
  for (const node of collectAllDisplayNodes(root)) {
    for (const gear of node.children.filter((c) => c.name.startsWith("gear"))) {
      const controllerName = gear.attrs.controller;
      if (!controllerName) continue;
      const controller = controllerMap.get(controllerName);
      if (!controller) {
        issues.push({
          severity: "error",
          message: `gear 引用不存在的 controller "${controllerName}"（节点 ${node.attrs.id ?? ""}）`,
        });
        continue;
      }
      const gearPages = (gear.attrs.pages ?? "").split(",").filter((s) => s.length > 0);
      const validIds = new Set(controller.pageIds);
      for (const page of gearPages) {
        if (!validIds.has(page)) {
          issues.push({
            severity: "error",
            message: `gear (controller="${controllerName}") 的 pages 含不存在页面 "${page}"（可用: ${controller.pageIds.join("/")}）`,
          });
        }
      }
      // values 数量 == pages 数量（gearColor/XY/Size/Text 等）
      const valuesRaw = gear.attrs.values;
      if (valuesRaw !== undefined) {
        const valuesCount = valuesRaw.split("|").length;
        const pagesCount = gearPages.length;
        if (valuesCount !== pagesCount) {
          issues.push({
            severity: "error",
            message: `gear (controller="${controllerName}") values 数量(${valuesCount})与 pages 数量(${pagesCount})不一致`,
          });
        }
      }
    }
  }

  // 2b. relation sidePair 校验：target 存在（validateComponent 已查）+ sidePair 格式合法
  for (const node of collectAllDisplayNodes(root)) {
    for (const relation of node.children.filter((c) => c.name === "relation")) {
      const sidePair = relation.attrs.sidePair;
      if (!sidePair) continue;
      for (const pair of sidePair.split(",")) {
        const problem = validateSidePair(pair.trim());
        if (problem !== undefined) {
          issues.push({
            severity: "error",
            message: `relation sidePair 非法: ${problem}（节点 ${node.attrs.id ?? ""}）`,
          });
        }
      }
    }
  }

  // 3. 扩展组件必备结构
  const extention = root.attrs.extention;
  const nodeNames = new Set(component.objects.map((o) => o.name));
  const hasExtensionNode = (name: string) => root.children.some((c) => c.name === name);

  if (extention === "Slider") {
    if (!nodeNames.has("bar")) issues.push({ severity: "error", message: "extention=Slider 缺少 name=\"bar\" 的进度条节点" });
    if (!nodeNames.has("grip")) issues.push({ severity: "error", message: "extention=Slider 缺少 name=\"grip\" 的滑块节点" });
    if (!hasExtensionNode("Slider")) issues.push({ severity: "error", message: "extention=Slider 缺少 <Slider/> 扩展节点" });
  }
  if (extention === "ProgressBar") {
    if (!nodeNames.has("bar")) issues.push({ severity: "error", message: "extention=ProgressBar 缺少 name=\"bar\" 的进度节点" });
    if (!hasExtensionNode("ProgressBar")) issues.push({ severity: "error", message: "extention=ProgressBar 缺少 <ProgressBar/> 扩展节点" });
  }
  if (extention === "ComboBox") {
    const combo = root.children.find((c) => c.name === "ComboBox");
    if (!combo || !combo.attrs.dropdown) {
      issues.push({ severity: "error", message: "extention=ComboBox 缺少 <ComboBox dropdown=\"ui://...\"/> 扩展节点" });
    }
  }

  // 4. <list> 的 defaultItem 必须指向已登记组件
  const pkgId = new Map(pkg.resources.map((r) => [r.id, r]));
  for (const node of collectAllDisplayNodes(root)) {
    if (node.name !== "list") continue;
    const defaultItem = node.attrs.defaultItem;
    if (!defaultItem) continue;
    // ui://<pkgid><resid> 或裸资源 id（本包）。裸 id 整体作为本包资源 id。
    let resId: string;
    if (defaultItem.startsWith("ui://")) {
      const target = defaultItem.slice(5);
      // 形如 pkgidresid；本包可能也用 ui://pkgidresid，去掉包前缀取后 5 位为资源 id
      resId = target.length > 5 ? target.slice(-5) : target;
    } else {
      resId = defaultItem;
    }
    if (!pkgId.has(resId)) {
      issues.push({
        severity: "error",
        message: `list "${node.attrs.name ?? ""}" 的 defaultItem "${defaultItem}" 未指向已登记组件`,
      });
    }
  }

  return issues;
}

/** 分配不与现有资源冲突的短 id（5 位小写字母数字，FGUI 资源 id 约定长度）。 */
export function nextResourceId(pkg: FguiPackage, prefix?: string): string {
  const used = new Set(pkg.resources.map((r) => r.id));
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const targetLength = 5;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const base = prefix ?? "";
    let candidate = base;
    while (candidate.length < targetLength) {
      candidate += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!used.has(candidate)) return candidate;
  }
  throw new FguiError("无法分配不冲突资源 id（命名空间耗尽）");
}

/**
 * 校验包登记的文件是否真实存在（组件 XML 与图片资源）。
 * 用于拦截"package.xml 已登记但文件缺失"的脏状态——这正是 FGUI 编辑器
 * 在加载包时读文件越界/报错的常见根因。
 */
export function validatePackageFileIntegrity(
  project: FguiProject,
  pkg: FguiPackage,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const resource of pkg.resources) {
    if (resource.kind === "component") {
      const file = resolveComponentFile(pkg.dir, resource.name);
      if (file === undefined) {
        issues.push({
          severity: "error",
          message: `组件文件缺失: ${resource.name}（package.xml 已登记但文件不存在）`,
        });
      }
      continue;
    }
    // image 资源：path + name 相对包目录
    const rel = `${resource.path.replace(/^\/+/, "")}${resource.name}`;
    if (!existsSync(join(pkg.dir, rel))) {
      issues.push({
        severity: "error",
        message: `图片文件缺失: ${rel}（package.xml 已登记但文件不存在）`,
      });
    }
  }
  return issues;
}
