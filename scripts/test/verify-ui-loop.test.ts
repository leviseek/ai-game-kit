import { describe, expect, it } from "bun:test";
import { verifyUiLoop, type RunResult, type VerifyLoopDeps } from "../verify-ui-loop";
import type { BridgeCallResult } from "../../tools/fgui-mcp/lib/bridge";
import type { CheckPublishResult } from "../../tools/fgui-mcp/lib/check-publish";
import type { FguiProjectInfo } from "../../tools/fgui-mcp/lib/paths";

const PROJECT: FguiProjectInfo = {
    root: "C:\\proj",
    projectDir: "C:\\proj\\ui\\demo",
    name: "demo",
    mailboxDir: "C:\\proj\\ui\\demo\\.objs\\fgui-mcp-probe\\mailbox",
    probeDir: "C:\\proj\\ui\\demo\\.objs\\fgui-mcp-probe",
};

const OK = (): RunResult => ({ code: 0, output: "ok" });
const FAIL = (output = "boom"): RunResult => ({ code: 1, output });

function okCheck(): CheckPublishResult {
    return {
        ok: true,
        evidence: { signal: { present: true, fresh: true, packages: ["Demo"], isSuccess: true }, artifactsFresh: { present: true, stale: [] }, validate: { passed: true, details: "ok" } },
        mismatches: [],
    };
}

function reachable(result: Partial<BridgeCallResult> = {}): BridgeCallResult {
    return { reached: true, ok: true, result: { isSuccess: true, exportPath: "assets/ui/Demo" }, ...result };
}

function makeDeps(overrides: Partial<VerifyLoopDeps> = {}): VerifyLoopDeps {
    const calls: string[] = [];
    const deps: VerifyLoopDeps = {
        locateProject: () => PROJECT,
        isBridgeReachable: () => true,
        createBridge: () => ({ call: async () => reachable() }),
        checkPublish: () => okCheck(),
        findCreatorHome: () => "C:\\creator",
        ...overrides, // 先应用 override，runBun 最后统一包装记录
        runBun: (script, args) => {
            calls.push(script);
            return (overrides.runBun ?? ((_s: string, _a: readonly string[]) => OK()))(script, args);
        },
    };
    (deps as { calls: string[] }).calls = calls;
    return deps;
}

describe("verifyUiLoop 全通过", () => {
    it("四阶段全部成功返回 0", async () => {
        const deps = makeDeps();
        expect(await verifyUiLoop("Demo", deps)).toBe(0);
        const calls = (deps as { calls: string[] }).calls;
        expect(calls).toEqual(["fgui", "ccc"]); // 阶段 1 validate + 阶段 4 ui-smoke
    });
});

describe("环境缺失（退出码 2）", () => {
    it("FGUI 工程不可定位 → 2", async () => {
        const deps = makeDeps({
            locateProject: () => {
                throw new Error("FGUI 工程目录不存在");
            },
        });
        expect(await verifyUiLoop("Demo", deps)).toBe(2);
    });

    it("编辑器探针不可达 → 2", async () => {
        const deps = makeDeps({ isBridgeReachable: () => false });
        expect(await verifyUiLoop("Demo", deps)).toBe(2);
    });

    it("发布桥接不可达（reached=false）→ 2", async () => {
        const deps = makeDeps({
            createBridge: () => ({ call: async () => ({ reached: false, ok: false, error: "编辑器桥接超时" }) }),
        });
        expect(await verifyUiLoop("Demo", deps)).toBe(2);
    });

    it("Creator 不可定位 → 2（且跳过 ui-smoke）", async () => {
        const deps = makeDeps({
            findCreatorHome: () => {
                throw new Error("无法定位 Cocos Creator");
            },
        });
        expect(await verifyUiLoop("Demo", deps)).toBe(2);
        expect((deps as { calls: string[] }).calls).toEqual(["fgui"]); // 未进入 ui-smoke
    });
});

describe("阶段失败（退出码 1）", () => {
    it("validate 失败 → 1（阻断，不发布）", async () => {
        const deps = makeDeps({ runBun: () => FAIL("validate error") });
        expect(await verifyUiLoop("Demo", deps)).toBe(1);
        expect((deps as { calls: string[] }).calls).toEqual(["fgui"]);
    });

    it("发布 ok=false → 1", async () => {
        const deps = makeDeps({
            createBridge: () => ({ call: async () => ({ reached: true, ok: false, error: "publish failed" }) }),
        });
        expect(await verifyUiLoop("Demo", deps)).toBe(1);
    });

    it("发布 isSuccess=false → 1", async () => {
        const deps = makeDeps({
            createBridge: () => ({ call: async () => reachable({ ok: true, result: { isSuccess: false, exportPath: "assets/ui/Demo" } }) }),
        });
        expect(await verifyUiLoop("Demo", deps)).toBe(1);
    });

    it("三重证据不一致 → 1", async () => {
        const deps = makeDeps({
            checkPublish: () => ({ ...okCheck(), ok: false, mismatches: ["产物过期"] }),
        });
        expect(await verifyUiLoop("Demo", deps)).toBe(1);
    });

    it("ui-smoke 失败 → 1", async () => {
        const deps = makeDeps({
            runBun: (script) => (script === "ccc" ? FAIL("smoke failed") : OK()),
        });
        expect(await verifyUiLoop("Demo", deps)).toBe(1);
    });
});
