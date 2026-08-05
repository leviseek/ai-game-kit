import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/**
 * Creator 路径与项目定位共享模块。
 * 探测链：COCOS_CREATOR_HOME 环境变量 → ~/.Cocos/profiles/editor.json 按版本匹配
 * → 默认安装目录。复用 tests/scripts/check-foundation-contracts.ts 的既有探测模式。
 */

export function getProjectRoot(): string {
  // lib/env.ts → tools/creator/lib → tools/creator → tools → 仓库根
  return resolve(import.meta.dirname, "../../..");
}

export function getProjectName(): string {
  return basename(getProjectRoot());
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function getCreatorVersion(): string {
  const pkg = readJson(join(getProjectRoot(), "package.json")) as {
    creator?: { version?: string };
  };
  return pkg.creator?.version ?? "unknown";
}

/** 解析 Creator 安装根目录（含 CocosCreator.exe 的目录），失败时抛明确错误。 */
export function findCreatorHome(): string {
  const fromEnv = process.env.COCOS_CREATOR_HOME;
  if (fromEnv !== undefined && existsSync(join(fromEnv, "CocosCreator.exe"))) {
    return fromEnv;
  }

  const version = getCreatorVersion();
  const editorJsonPath = join(homedir(), ".Cocos", "profiles", "editor.json");
  if (existsSync(editorJsonPath)) {
    const editor = readJson(editorJsonPath) as {
      editor?: { Creator3D?: Array<{ version?: string; file?: string }> };
    };
    const match = editor.editor?.Creator3D?.find(
      (entry) =>
        entry.version === version &&
        entry.file !== undefined &&
        existsSync(entry.file),
    );
    if (match?.file !== undefined) {
      return dirname(match.file);
    }
  }

  const fallback = join("D:\\engine\\cocos\\Creator", version);
  if (existsSync(join(fallback, "CocosCreator.exe"))) {
    return fallback;
  }

  throw new Error(
    `无法定位 Cocos Creator ${version}，请设置 COCOS_CREATOR_HOME 指向安装目录`,
  );
}

export function findCreatorExe(): string {
  return join(findCreatorHome(), "CocosCreator.exe");
}

/** 工具自身的日志/锁目录，位于 temp/ 下（已被 gitignore）。 */
export function getCreatorTempDir(): string {
  return join(getProjectRoot(), "temp", "creator");
}

export function findChrome(): string {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv !== undefined && existsSync(fromEnv)) {
    return fromEnv;
  }
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const hit = candidates.find((path) => existsSync(path));
  if (hit === undefined) {
    throw new Error("无法定位 Chrome，请设置 CHROME_PATH 指向 chrome.exe");
  }
  return hit;
}
