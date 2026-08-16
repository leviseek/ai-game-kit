# Design: 2026-08-16-generator-asset-ingestion

## Context

现状（详见 proposal.md - Why）：美术/音频无 AI 产出通道；`fgui sprite` 是唯一像素生成器；本机无 ComfyUI/ffmpeg、有 Python 3.13。内容管线（tools/content）已有 schema/引用/资源帧校验，缺「外部产物接入」通道。设计目标：把「外部生成器产物 → 确定性闸门 → 登记 → 可引用」做成本文可验证的骨架，具体生成器留待环境。

## Goals / Non-Goals

**Goals:**
- 统一生成器接口 + staging 管线（generate/validate/ingest）+ 产物契约校验。
- `python-wave` 参考生成器（Python 3 无依赖）证明外部进程接入；`comfyui` 适配器定义 HTTP 契约（占位）。
- 登记表（generated-assets.json）与内容管线复用（资源声明可引用新产物）。
- 零新增运行时依赖（第 3 条）；Python 参考生成器仅用标准库。

**Non-Goals:**
- ComfyUI/音频模型实装（需环境 + 权重）。
- 生成器远程编排/队列/并行调度。
- 产物版本化与回滚。
- 不引入第三方 npm/python 依赖。

## Decisions

### D1: 生成器接口与注册（tools/content/lib/generator.ts）

```ts
export interface GeneratedArtifact { readonly relPath: string; readonly kind: "png" | "wav"; readonly width?: number; readonly height?: number; readonly durationSec?: number; }
export interface GeneratorParams { readonly [key: string]: string | number | boolean | undefined; }
export interface GeneratorResult { readonly artifacts: readonly GeneratedArtifact[]; }
export interface GeneratorAdapter {
    readonly id: string;
    readonly describe: string;
    generate(stagingDir: string, params: GeneratorParams): Promise<GeneratorResult>;
    validate(stagingDir: string, artifacts: readonly GeneratedArtifact[]): ContentIssue[];
}
export function registerGenerator(adapter): void;
export function listGenerators(): readonly GeneratorAdapter[];
export function getGenerator(id: string): GeneratorAdapter | undefined;
```

- 生成器通过 `registerGenerator` 注册（命令层与测试都可注入）；`assetgen generate` 按 id 查表，未知 id 拒绝并列出已注册。
- 生成器 `generate` 负责把产物写到 staging；`validate` 做生成器自有校验（可选，默认空）。

### D2: 产物契约校验（lib/artifact-validation.ts）

管线级校验（与生成器无关，登记前强制）：
- **存在性**：声明的每个产物文件在 staging 存在；
- **格式签名**：PNG 魔数 `89 50 4E 47 0D 0A 1A 0A`、WAV 魔数 `RIFF....WAVE`；
- **尺寸**：PNG 读取 IHDR 的宽高，与声明（width/height）一致；
- **时长**：WAV 由 data chunk 长度 + 采样率/声道/位深推算，与声明（durationSec）一致（±容差）；
- **命名**：文件 basename 语义化前缀（复用 `content-config-validation` 的命名约定思路：`{用途}_{状态}` 风格，如 `fx_boom`、`sfx_hit`）。

校验器为纯函数（读文件头/字节），可单测（构造假 PNG/WAV 头）。

### D3: staging 管线与登记（commands/assetgen.ts）

```
assetgen generate <generator> [--k v ...]  → 产物写 temp/assetgen/staging/<run>/ + 输出清单
assetgen validate <staging-dir>            → 管线契约校验（存在/签名/尺寸/时长/命名），error 非零退出
assetgen ingest <staging-dir> --target assets/audio <--id <id>> <--kind wav>
                                           → 校验通过后复制进 assets/ + 更新登记表
```

- staging 在 `temp/assetgen/`（gitignore）；ingest 是唯一写 `assets/` 的通道（校验门禁）。
- 登记表 `assets/game-content/generated-assets.json`：`{ id: { file, kind, generator, paramsHash, width?, height?, durationSec? } }`；同 id 参数哈希不一致 → warning。
- ingest 的 `--target` 限 `assets/` 内（防越界）；产物登记后可被后续「资源声明」引用（现行动画帧校验模式）。

### D4: 参考适配器

- `generators/python-wave.ts`：`spawn("python", [python-wave.py, ...])`，stdout 无依赖；`python-wave.py`（标准库 `wave/math/struct`）生成 WAV：正弦/噪声/包络可选，`--duration`/`--freq`/`--out` 参数。`generate` 写 staging，`validate` 调用管线校验（尺寸/时长由结果声明）。
- `generators/comfyui.ts`：定义 HTTP 契约（`POST /prompt` 提交工作流 + 轮询 `/history` 取图）——接口与参数结构就位，实装抛「未配置 ComfyUI 端点」占位错误（待环境接入）。
- `fgui-sprite`：适配既有 `fgui sprite` 命令（复用像素生成），作为已存在生成器的统一入口。

## Risks / Trade-offs

- [生成器产物质量不可控（外部模型）] → 管线的确定性闸门只管「产物合法/契约一致」，质量由 `visual-verifier`（视觉）与人工/主观流程把关——闸门与质检职责分离。
- [Python 进程依赖（python-wave）] → 仅参考实现；接口抽象允许任意生成器（Node/CLI/HTTP），无 Python 时该适配器报环境缺失错误（exit 2 语义）。
- [staging 产物堆积] → `temp/` gitignore；ingest 成功后清 staging（`--keep` 可选保留调试）。
- [登记表与配置表双写] → 登记表是产物索引（文件侧），配置表（game-content JSON）是引用侧；`content validate` 的资源声明校验衔接两者。

## Migration Plan

1. `lib/generator.ts` 接口 + 注册表 + `lib/artifact-validation.ts` 契约校验（纯函数）。
2. `commands/assetgen.ts` 三子命令 + 登记表读写 + staging 清理。
3. `python-wave` 适配器 + `.py` 脚本；`comfyui` 占位适配器。
4. 单测（接口注册/契约校验/ingest 登记/未知生成器）；门禁接线。
5. 全门禁绿；提交；ADR 检查（见 tasks 末尾）。

## Open Questions

- 生成器远程编排（队列/并行）是否并入未来批次：默认不并入（Non-Goal），后续按需另立。
