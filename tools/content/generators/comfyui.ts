/**
 * ComfyUI 占位适配器：定义 HTTP 接入契约（POST /prompt 提交工作流 + 轮询 /history 取图），
 * 实装待环境（ComfyUI + 模型权重）。当前调用抛「未配置/未实装」占位错误，
 * 接口与参数结构就位后可直接补实装。
 */
import type { GeneratorAdapter, GeneratorParams, GeneratorResult } from "../lib/generator";

export function createComfyUiGenerator(endpoint?: string): GeneratorAdapter {
    return {
        id: "comfyui",
        describe: "ComfyUI HTTP 生成器（POST /prompt + 轮询 /history 取图）；需配置端点与工作流",
        async generate(_stagingDir: string, _params: GeneratorParams): Promise<GeneratorResult> {
            throw new Error(
                endpoint === undefined
                    ? "ComfyUI 未配置端点（适配器占位：需设置端点与工作流 JSON，见 design D4）"
                    : `ComfyUI 端点 ${endpoint} 尚未实装（适配器占位：接口就位，待环境接入）`,
            );
        },
    };
}
