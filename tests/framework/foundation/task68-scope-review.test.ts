import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const projectRoot = resolve(import.meta.dir, "../../..");
const sceneFile = resolve(projectRoot, "assets/boot/startup.scene");
const appRootFile = resolve(projectRoot, "assets/boot/AppRoot.ts");

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
  test("does not import Game assets or business logic", () => {
    const source = readFileSync(appRootFile, "utf8");

    expect(source).not.toMatch(/from\s+["']\.\.\/game/);
    expect(source).not.toMatch(/from\s+["']@game/);
    expect(source).not.toMatch(/\bresources\b/);
    expect(source).not.toMatch(/\bassetManager\b/);
  });

  test("does not import resource loading or scene switching APIs", () => {
    const source = readFileSync(appRootFile, "utf8");

    expect(source).not.toMatch(/\bdirector\b/);
    expect(source).not.toMatch(/\bloadScene\b/);
    expect(source).not.toMatch(/\bloadBundle\b/);
    expect(source).not.toMatch(/\bBundle\b/);
    expect(source).not.toMatch(/\binstantiate\b/);
  });

  test("does not directly handle Cocos hide/show events", () => {
    const source = readFileSync(appRootFile, "utf8");

    expect(source).not.toMatch(/EVENT_HIDE/);
    expect(source).not.toMatch(/EVENT_SHOW/);
    expect(source).not.toMatch(/game\.(on|off)\s*\(\s*Game\./);
  });

  test("imports only framework and engine modules", () => {
    const source = readFileSync(appRootFile, "utf8");

    const forbiddenImports = [
      "/game/",
      "/boot/",
      "fairygui",
    ];

    for (const pattern of forbiddenImports) {
      const lines = source.split("\n");
      for (const line of lines) {
        if (line.startsWith("import ") && line.includes(pattern)) {
          expect.fail(`Forbidden import found: ${line.trim()}`);
        }
      }
    }
  });

  test("does not create Module instances manually", () => {
    const source = readFileSync(appRootFile, "utf8");

    expect(source).toContain("export function createModules");
    expect(source).not.toMatch(/\bnew\s+(?!ConsoleLogger|CocosApplicationAdapter|Application)\w+\b/);
  });
});
