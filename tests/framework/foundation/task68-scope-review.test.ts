import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { describe, expect, test } from "bun:test";

const projectRoot = resolve(import.meta.dir, "../../..");
const sceneFile = resolve(projectRoot, "assets/boot/startup.scene");
const appRootFile = resolve(projectRoot, "assets/boot/AppRoot.ts");

/** 递归收集目录下的 .ts 文件。 */
function collectTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectTypeScriptFiles(full));
        } else if (entry.name.endsWith(".ts")) {
            files.push(full);
        }
    }
    return files;
}

/** 收集目录下（可排除子目录）的全部 .ts 文件源码。 */
function collectSources(
    dir: string,
    excludeSubdir?: string,
): Array<{ file: string; source: string }> {
    return collectTypeScriptFiles(dir)
        .filter((file) => !excludeSubdir || !file.includes(`${sep}${excludeSubdir}${sep}`))
        .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

/**
 * 断言源码对 game bundle 的 import 全部为 `import type`（编译期擦除，无运行时
 * bundle 依赖）。逐语句跟踪 import 声明起点，兼容多行 `import type { ... }`。
 */
function assertTypeOnlyGameImports(source: string, file: string): void {
    let importStart = "";
    for (const rawLine of source.split("\n")) {
        const line = rawLine.trim();
        if (line.startsWith("import ")) {
            importStart = line;
        }
        if (importStart !== "" && /from\s+["'][^"']*game[^"']*["']/.test(line)) {
            expect(
                importStart.startsWith("import type"),
                `${file} 不允许运行时 import game bundle: ${line}`,
            ).toBe(true);
            importStart = "";
        }
        if (line.endsWith(";")) {
            importStart = "";
        }
    }
}

describe("6.8 scope review: startup.scene", () => {
    test("contains no business UI components", () => {
        const content = readFileSync(sceneFile, "utf8");

        const forbiddenUI = [
            "cc.Sprite",
            "cc.Label",
            "cc.Button",
            "cc.RichText",
            "cc.EditBox",
            "cc.Layout",
            "cc.ScrollView",
            "cc.ProgressBar",
            "cc.Slider",
            "cc.Toggle",
            "cc.ToggleContainer",
            "cc.PageView",
            "cc.PageViewIndicator",
            "cc.WebView",
            "cc.VideoPlayer",
            "cc.Mask",
            "cc.Graphics",
        ];

        for (const component of forbiddenUI) {
            expect(content).not.toMatch(
                new RegExp(`"__type__"\\s*:\\s*"${component.replace(".", "\\.")}"`),
            );
        }
    });

    test("contains no FairyGUI components", () => {
        const content = readFileSync(sceneFile, "utf8");

        expect(content).not.toMatch(/fairygui/i);
        expect(content).not.toMatch(/FairyGUI/i);
    });

    test("contains no resource loading references", () => {
        const content = readFileSync(sceneFile, "utf8");

        expect(content).not.toMatch(/"__type__"\s*:\s*"cc\.(Asset|Prefab|SpriteFrame|Texture2D|AnimationClip|AudioClip|Font|Material|Mesh|Skeleton|EffectAsset)"/);
    });

    test("contains only infrastructure components", () => {
        const content = readFileSync(sceneFile, "utf8");
        const scene = JSON.parse(content) as Array<{ __type__?: string }>;

        const allowedTypes = [
            "cc.SceneAsset",
            "cc.Scene",
            "cc.Node",
            "cc.Camera",
            "cc.UITransform",
            "cc.Canvas",
            "cc.Widget",
            "cc.SceneGlobals",
            "cc.AmbientInfo",
            "cc.ShadowsInfo",
            "cc.SkyboxInfo",
            "cc.FogInfo",
            "cc.OctreeInfo",
            "cc.SkinInfo",
            "cc.LightProbeInfo",
            "cc.PostSettingsInfo",
            "cc.Vec3",
            "cc.Quat",
            "cc.Vec2",
            "cc.Vec4",
            "cc.Size",
            "cc.Color",
            "cc.Rect",
        ];

        for (const entry of scene) {
            const type = entry.__type__;
            if (type === undefined) continue;

            const isAllowed =
                allowedTypes.includes(type) ||
                type.startsWith("fa179") ||
                type.startsWith("cc.") === false;

            expect(isAllowed).toBe(true);
        }
    });
});

describe("6.8 scope review: AppRoot.ts", () => {
    test("does not import the game bundle at runtime (type-only imports allowed)", () => {
        const source = readFileSync(appRootFile, "utf8");

        // 组合根不得有 game bundle 的运行时 import（game 已是独立 Asset Bundle，
        // 静态运行时 import 会把 game 代码打进 main）；`import type` 编译期擦除、
        // 不产生 bundle 依赖，允许。业务规则留在 game bundle 内，组合根经注册桥访问。
        assertTypeOnlyGameImports(source, appRootFile);
        expect(source).not.toMatch(/from\s+["']@game/);
        // AppRoot 只经框架适配器工厂组装资源提供者，不直接引用引擎资源/场景对象；
        // director 用于 Cocos 官方推荐的持久化根节点 API（game.addPersistRootNode 已废弃），
        // 但 director.loadScene / assetManager 等场景切换与资源加载仍经适配器，见下方断言
        expect(source).not.toMatch(/import\s*\{[^}]*\b(assetManager|Asset|resources)\b[^}]*\}\s*from\s+["']cc["']/);
    });

    test("composes resource and scene flow only through framework adapter factories", () => {
        const source = readFileSync(appRootFile, "utf8");

        // 本 Change 为冒烟组合引入框架适配器工厂，但 AppRoot 不得直接调用引擎
        // 场景/资源 API，也不得手动实例化引擎管理器
        expect(source).toMatch(/createCocosResourceProvider/);
        expect(source).toMatch(/createCocosSceneAdapter/);
        expect(source).toMatch(/createSceneFlow/);
        expect(source).not.toMatch(/director\s*\.\s*loadScene/);
        expect(source).not.toMatch(/assetManager\s*\.\s*loadBundle/);
        expect(source).not.toMatch(/\binstantiate\b/);
    });

    test("does not directly handle Cocos hide/show events", () => {
        const source = readFileSync(appRootFile, "utf8");

        expect(source).not.toMatch(/EVENT_HIDE/);
        expect(source).not.toMatch(/EVENT_SHOW/);
        expect(source).not.toMatch(/game\.(on|off)\s*\(\s*Game\./);
    });

    test("imports only framework and engine modules (no game bundle)", () => {
        const source = readFileSync(appRootFile, "utf8");

        // 组合根只允许导入框架与引擎模块；game bundle 与 fgui 不允许进入组合根
        // （game 经注册桥运行时读取，类型经 `import type` 在编译期擦除）
        const forbiddenImports = [
            "/boot/",
            "fairygui",
        ];

        for (const pattern of forbiddenImports) {
            const lines = source.split("\n");
            for (const line of lines) {
                if (line.startsWith("import ") && line.includes(pattern)) {
                    throw new Error(`Forbidden import found: ${line.trim()}`);
                }
            }
        }
    });

    test("does not create Module instances manually", () => {
        const source = readFileSync(appRootFile, "utf8");

        expect(source).toContain("export function createModules");
        // new Error/URLSearchParams 是通用构造，不属于 Module 实例化；WallClock 是
        // 注册表演示服务而非 Module，与既有豁免词并列排除；Touch/EventTouch/Vec3
        // 为 cc 引擎输入/向量对象（冒烟触摸注入用），同样非业务 Module
        expect(source).not.toMatch(/\bnew\s+(?!ConsoleLogger|CocosApplicationAdapter|Application|Error|URLSearchParams|WallClock|Touch|EventTouch|Vec3)\w+\b/);
    });
});

describe("6.8 scope review: boot bundle boundary", () => {
    test("boot (non-smoke) does not statically import the game bundle at runtime", () => {
        // 冒烟模块（boot/smoke/**）仍静态 import game，由 Task 7 迁移进 game/samples
        // bundle（已知中间态），本断言仅覆盖非冒烟的 boot 模块
        const bootSources = collectSources(resolve(projectRoot, "assets/boot"), "smoke");
        expect(bootSources.length).toBeGreaterThan(0);

        for (const { file, source } of bootSources) {
            assertTypeOnlyGameImports(source, file);
        }
    });

    test("game/samples bundles do not statically import the boot host", () => {
        // game/samples 只经注册桥（lookupBundle/registerBundle）与 `import type` 访问
        // 宿主能力，静态 import boot 会形成宿主依赖倒置并破坏 bundle 边界
        const gameSources = collectSources(resolve(projectRoot, "assets/game"));
        const samplesSources = collectSources(resolve(projectRoot, "assets/samples"));

        for (const { file, source } of [...gameSources, ...samplesSources]) {
            const bootImportLines = source
                .split("\n")
                .filter((line) => /from\s+["'][^"']*\/boot\//.test(line));
            expect(bootImportLines, `${file} 不允许静态 import boot 宿主`).toHaveLength(0);
        }
    });
});
