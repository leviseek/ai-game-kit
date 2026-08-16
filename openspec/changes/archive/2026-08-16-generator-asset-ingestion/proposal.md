# 2026-08-16-generator-asset-ingestion

## Why

「AI 全流程产出」的最后瓶颈是美术/音频等非代码资产——AI 无法在可校验管线里直接产出商业级资产（质量主观、格式私有、工具封闭）。P2 前瞻：**AI 调用外部生成器（ComfyUI/音频模型/像素工具），生成产物经确定性闸门校验后登记进内容管线**——不要求 AI 直接画/作曲，而是让外部生成器的结果可校验、可引用、可回归。

现状：`assets/audio` 仅 placeholder；美术仅 `fgui sprite` 像素图（ASCII+palette→PNG）；无 ComfyUI/ffmpeg/音频模型。内容管线（tools/content）已具备 schema/引用/资源帧校验，但缺「外部产物接入」通道。

## What Changes

- 新增**生成器接口抽象**（`tools/content/lib/generator.ts`）：`GeneratorAdapter`（id/describe/generate/validate）——生成器以统一契约产出到 staging，产物校验与登记由管线承担，生成器本身可替换（ComfyUI/python 脚本/fgui sprite）。
- 新增 **staging 管线**（`bun run content assetgen`）：`generate <generator> [params]` → 产物落 `temp/assetgen/staging/` → `validate <staging-dir>`（产物契约：文件存在/尺寸/格式签名/命名）→ `ingest <staging-dir> <target>`（校验通过后复制进 `assets/` 并可选登记）。
- 新增**产物契约校验**：PNG 尺寸/格式签名、WAV 波形/时长、命名规范（`{用途}_{状态}.png` 风格）；复用资源存在性校验（登记后 `content validate` 的 assets 声明可引用新产物）。
- 新增**参考适配器**：`python-wave`（Python 3 生成 WAV 音效：正弦/噪声/包络，证明外部进程生成器可接入）；`fgui-sprite`（复用既有 sprite 命令）；`comfyui`（占位：HTTP API 契约定义，待环境接入）。
- 生成器产物登记：可选 `assets/game-content/generated-assets.json`（id → 文件/用途/生成器/参数哈希），供配置表引用与内容校验。

## Capabilities

### New Capabilities

- `generator-asset-ingestion`: 生成器注册、staging 管线（generate/validate/ingest）与产物契约校验。

### Modified Capabilities

- 无（生成器接入是全新通道；`content-config-validation` 的资源帧校验复用不变）。

## Impact

- `tools/content`：新增 `lib/generator.ts`、`commands/assetgen.ts`、`generators/python-wave.ts`（封装 Python 脚本）；产物契约校验器。
- 新增 `tools/content/generators/python-wave.py`（Python 参考生成器，无第三方依赖）。
- `temp/assetgen/` staging 目录（gitignore）。
- 文档：`AGENTS.md` 内容管线章节补生成器接入纪律；`README.md` 门禁命令表增补 `bun run content assetgen`。
- **Non-Goals（本 change 不做）**：具体生成器实装（ComfyUI 需要环境 + 模型权重，音频模型同理——只交付接口与参考实现）；生成器远程编排/队列（多任务调度）；产物版本化与回滚（后续阶段）。
