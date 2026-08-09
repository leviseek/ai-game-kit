/**
 * FGUI 工程与邮箱目录定位。
 * 与 tools/fgui 的 locateProject 同源约定：默认工程 ui/demo，*.fairy 判定工程根。
 * 邮箱目录复用编辑器插件探针已验证的 .objs/fgui-mcp-probe/mailbox 布局。
 */

import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** 仓库根：lib/paths.ts → lib → tools → tools/fgui-mcp → tools → 仓库根 */
export const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");

export class FguiMcpError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FguiMcpError";
    }
}

export interface FguiProjectInfo {
    readonly root: string;
    readonly projectDir: string;
    /** 工程名（如 demo） */
    readonly name: string;
    /** 邮箱根目录（探针布局：<objs>/fgui-mcp-probe/mailbox） */
    readonly mailboxDir: string;
    /** 编辑器插件握手/结果目录 */
    readonly probeDir: string;
}

/** 定位 FGUI 工程目录：默认 ui/demo；显式传入时以项目根为基准。 */
export function locateProject(projectArg?: string): FguiProjectInfo {
    const projectDir = projectArg ? resolve(PROJECT_ROOT, projectArg) : join(PROJECT_ROOT, "ui", "demo");
    if (!existsSync(projectDir)) throw new FguiMcpError(`FGUI 工程目录不存在: ${projectDir}`);
    const fairies = readdirSync(projectDir, { withFileTypes: true }).filter(
        (entry) => entry.isFile() && entry.name.endsWith(".fairy"),
    );
    if (fairies.length === 0) throw new FguiMcpError(`FGUI 工程目录缺少 *.fairy: ${projectDir}`);
    const objsDir = join(projectDir, ".objs");
    const probeDir = join(objsDir, "fgui-mcp-probe");
    return {
        root: PROJECT_ROOT,
        projectDir,
        name: fairies[0]!.name.replace(/\.fairy$/, ""),
        mailboxDir: join(probeDir, "mailbox"),
        probeDir,
    };
}
