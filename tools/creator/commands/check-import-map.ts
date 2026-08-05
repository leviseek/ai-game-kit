import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasHelp, parseArgs } from "../lib/args";
import { getProjectRoot } from "../lib/env";

export const help = "check-import-map —— 校验 importMap 配置（防绝对路径静默降级）";

/**
 * 校验 settings/v2/packages/project.json 的 script.importMap 为 project:// 形式，
 * 且 import-map.json 中每个映射目标文件存在。
 * 背景：script.importMap 写成绝对路径时 Creator 静默降级（foo:/bar），
 * 裸包名解析失败且构建不报错——必须静态前置拦截。
 */
export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  const projectRoot = getProjectRoot();
  const settingsPath = join(projectRoot, "settings", "v2", "packages", "project.json");
  const importMapPath = join(projectRoot, "import-map.json");
  const failures: string[] = [];

  if (!existsSync(settingsPath)) {
    failures.push(`缺少 settings 配置: ${settingsPath}`);
  } else {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      script?: { importMap?: string };
    };
    const importMap = settings.script?.importMap;
    if (importMap !== "project://import-map.json") {
      failures.push(
        `script.importMap 应为 "project://import-map.json"，当前为 ${JSON.stringify(importMap)}` +
          "（绝对路径会静默降级导致裸包名解析失败）",
      );
    }
  }

  if (!existsSync(importMapPath)) {
    failures.push(`缺少 import-map.json: ${importMapPath}`);
  } else {
    const importMap = JSON.parse(readFileSync(importMapPath, "utf8")) as {
      imports?: Record<string, string>;
    };
    for (const [key, target] of Object.entries(importMap.imports ?? {})) {
      if (!target.startsWith("./")) {
        failures.push(`import-map 映射 ${key} 目标应为相对路径 ./ 开头: ${target}`);
        continue;
      }
      const resolved = join(projectRoot, target);
      if (!existsSync(resolved)) {
        failures.push(`import-map 映射 ${key} → ${target} 目标文件不存在`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("[ccc:check-import-map] 配置校验失败");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    return 1;
  }

  console.log("[ccc:check-import-map] 配置校验通过（project:// 形式 + 映射目标均存在）");
  return 0;
}
