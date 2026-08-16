/**
 * fgui-sprite 适配器：既有像素生成能力（tools/fgui sprite，ASCII + 调色板 → PNG + FGUI 包登记）
 * 的生成器接口统一入口。说明：fgui sprite 面向 FGUI 包登记流程（写 ui/demo/assets 并登记
 * package.xml），与 assetgen 的 staging 契约（temp/ 暂存 → 管线校验 → ingest）不同——
 * 像素 UI 资产继续走既有 `bun run fgui sprite` 主链路，本适配器引导调用方选择正确通道。
 */
import type { GeneratorAdapter, GeneratorParams, GeneratorResult } from "../lib/generator";

export function createFguiSpriteGenerator(): GeneratorAdapter {
    return {
        id: "fgui-sprite",
        describe: "复用 tools/fgui sprite（像素 UI 资产主链路：ASCII+palette → PNG + FGUI 包登记）",
        async generate(_stagingDir: string, _params: GeneratorParams): Promise<GeneratorResult> {
            throw new Error(
                "像素 UI 资产请直接使用 `bun run fgui sprite`（含调色板锁定与 package.xml 登记）；assetgen 面向外部生成器产物（ComfyUI/音频等），非 FGUI 登记流程",
            );
        },
    };
}
