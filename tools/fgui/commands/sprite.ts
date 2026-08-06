import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { flagString, hasHelp, parseArgs, requireFlag } from "../lib/args";
import { locateProject, readPackage } from "../lib/fgui";
import { encodePng, parsePalette, renderAscii } from "../lib/pixel";
import { parseScale9grid, registerGeneratedImage } from "../lib/sprite";

export const help = "sprite —— 用 ASCII 画布 + 调色板生成像素 PNG 并登记到 package.xml";

/** 项目级默认调色板文件（相对工程目录）。 */
const DEFAULT_PALETTE_FILE = "palette.json";

export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  const packageName = requireFlag(parsed, "package", "sprite --package <包名> --name <文件名> --palette <调色板> --art <多行ASCII>");
  const fileName = requireFlag(parsed, "name", "sprite --package <包名> --name <文件名>");
  const paletteSpec = requireFlag(parsed, "palette", "sprite --palette 'B=#rrggbb,G=#rrggbbaa'");
  const artSpec = requireFlag(parsed, "art", "sprite --art '行1\n行2'");
  const pathArg = flagString(parsed, "path") ?? "/img/";
  const scale9 = flagString(parsed, "scale9grid");
  const projectArg = flagString(parsed, "project");

  if (!fileName.endsWith(".png")) {
    console.error("[fgui:sprite] 文件名必须以 .png 结尾");
    return 2;
  }
  if (scale9 !== undefined) {
    try {
      parseScale9grid(scale9);
    } catch (error) {
      console.error(`[fgui:sprite] ${error instanceof Error ? error.message : String(error)}`);
      return 2;
    }
  }

  const project = locateProject(projectArg);

  // 调色板锁定：显式 palette 的颜色值必须 ⊆ 工程 palette.json 允许集合
  const palette = parsePalette(paletteSpec);
  if (palette.size === 0) {
    console.error("[fgui:sprite] 调色板为空或全部非法（格式: 'B=#rrggbb,G=#rrggbbaa'）");
    return 2;
  }
  const paletteFile = join(project.projectDir, DEFAULT_PALETTE_FILE);
  const paletteData = loadPaletteFile(paletteFile);
  if (paletteData !== undefined) {
    const allowed = normalizePaletteColors(paletteData);
    for (const [key, color] of palette) {
      const c = colorKey(color);
      if (!allowed.has(c)) {
        console.error(`[fgui:sprite] 颜色 "${key}"=${c} 不在 ${DEFAULT_PALETTE_FILE} 允许范围内（如需新色先加入 palette.json）`);
        return 2;
      }
    }
  }

  const artLines = artSpec.split("\n");
  let rendered: { width: number; height: number; data: Uint8ClampedArray };
  try {
    rendered = renderAscii(artLines, palette);
  } catch (error) {
    console.error(`[fgui:sprite] ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const pkg = readPackage(project, packageName);

  // 九宫格参数需在画布范围内
  if (scale9 !== undefined) {
    const grid = parseScale9grid(scale9);
    if (grid.right >= rendered.width || grid.bottom >= rendered.height) {
      console.error(
        `[fgui:sprite] scale9grid ${scale9} 超出画布 ${rendered.width}x${rendered.height}（坐标从 0 起）`,
      );
      return 2;
    }
  }

  const dir = join(pkg.dir, pathArg.replace(/^\/+|\/+$/g, ""));
  mkdirSync(dir, { recursive: true });
  const pngPath = join(dir, fileName);
  const png = encodePng(rendered.width, rendered.height, rendered.data);
  writeFileSync(pngPath, png);

  const id = registerGeneratedImage(pkg, fileName, pathArg, scale9);

  console.log(`[fgui:sprite] 已生成 ${pngPath} (${rendered.width}x${rendered.height}) 资源 id=${id}`);
  if (scale9 !== undefined) {
    console.log(`[fgui:sprite] 已登记 scale9grid=${scale9}，请在 FGUI 编辑器中确认拉伸观感`);
  } else {
    console.log(`[fgui:sprite] 未登记九宫格；如需可拉伸请加 --scale9grid left,top,right,bottom`);
  }
  return 0;
}

type RgbaLike = { r: number; g: number; b: number; a: number };

/** 读取 palette.json（形如 {"key":"#rrggbb","key2":"#rrggbbaa"}）。 */
function loadPaletteFile(path: string): Record<string, string> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    if (typeof raw !== "object" || raw === null) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

/** 将 palette.json 的颜色值归一化为 set，供 ⊆ 校验。 */
function normalizePaletteColors(data: Record<string, string>): Set<string> {
  const set = new Set<string>();
  for (const value of Object.values(data)) {
    const parsed = parsePalette(`x=${value}`);
    const color = parsed.get("x");
    if (color !== undefined) set.add(colorKey(color));
  }
  return set;
}

function colorKey(color: RgbaLike): string {
  return `#${[color.r, color.g, color.b, color.a].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
