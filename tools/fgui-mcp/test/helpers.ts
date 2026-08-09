/**
 * 测试共用工具：返回基于系统临时目录的唯一邮箱目录路径。
 * 修正历史缺陷：`(import.meta.dir, "name")` 是逗号表达式恒返回字面量（相对 cwd 路径），
 * 会在工作区残留目录；这里统一用 os.tmpdir 生成绝对路径。
 */

import { join } from "node:path";
import { tmpdir } from "node:os";

/** 生成唯一临时邮箱目录（含调用方标识）。 */
export function tempMailboxDir(label: string): string {
    return join(tmpdir(), `fgui-mcp-${label}-${process.pid}`);
}
