# ADR-041: Generator Asset Ingestion — External Generator Pipeline with Contract Gate

## Status

Accepted

## Context

「AI 全流程产出」的最后瓶颈是美术/音频等非代码资产——AI 无法在可校验管线里直接产出商业级资产。P2 前瞻（落地 change：`2026-08-16-generator-asset-ingestion`）：AI 调用外部生成器（ComfyUI/音频模型/像素工具），产物经确定性闸门校验后登记进内容管线。

环境事实（初始）：本机无 ComfyUI/ffmpeg、有 Python 3.13；`fgui sprite` 是唯一像素生成器；内容管线（tools/content）已有 schema/引用/资源帧校验，缺「外部产物接入」通道。

环境事实（真实联调后更新，2026-08-16）：ComfyUI 0.33.0 安装于 `D:\dev\ComfyUI`（venv + CPU torch 2.13.0），`sd_turbo.safetensors`（5.2GB，hf-mirror 多线程下载）放 `models/checkpoints/`；服务以 `python main.py --cpu --port 8188` 启动。**真实联调完成**：`assetgen generate comfyui --workflow-file tools/content/examples/comfyui-sd-turbo.json --id battle_splash` 经真实 `POST /prompt → 轮询 /history → /view` 全协议产出 512x512 PNG，`validate` 契约校验（PNG 魔数 + 命名）通过，`ingest` 登记 `generated-assets.json`（`battle_splash → assets/game-content/generated/battle_splash_0.png`）。

## Decision

### 1. 生成器接口抽象（lib/generator.ts）

`GeneratorAdapter { id, describe, generate(stagingDir, params) → 产物集, validate? }` + 注册表（register/list/get）。生成器只负责写 staging 并声明契约（kind/尺寸/时长），管线不感知具体实现（外部进程/Python/既有 CLI 均可替换）。

### 2. staging 管线与产物契约闸门（assetgen）

`bun run content assetgen generate|validate|ingest`：

- **generate**：产物落 `temp/assetgen/staging/<run>/` + 写 `.assetgen.json` 契约清单；
- **validate**：管线级契约校验（生成器无关，ingest 前强制）——存在性、PNG/WAV 魔数签名、PNG 尺寸（IHDR）、WAV 时长（data chunk 推算，±10ms）、语义化命名；任一 error 拒绝 ingest；
- **ingest**：校验通过后复制进 `assets/<target>`（限 assets/ 内、拒 `..`）、更新登记表 `assets/game-content/generated-assets.json`（id → file/kind/generator/paramsHash/尺寸/时长）、清 staging（`--keep` 保留）；同 id 参数哈希不一致 warning。

**闸门职责边界**：管线只判「产物合法/契约一致」，质量（观感/听感）由 `visual-verifier` 与人工主观流程把关——确定性闸门与质检分离。

### 3. 参考适配器分层

- `python-wave`：Python 3 标准库生成 WAV（正弦/噪声 + 包络），**实跑验证**外部进程生成器接入可行；Python 缺失抛环境错误（exit 2 语义）。
- `comfyui`：HTTP 契约（POST /prompt + 轮询 /history 取图 + /view 下载），**完整实装并经真实 ComfyUI 0.33.0 联调验证**（sd-turbo 工作流，见上文环境事实）；端点 `options.endpoint ?? env COMFYUI_ENDPOINT`，未配置抛明确错误；契约声明不带 width/height（ComfyUI 输出尺寸由工作流决定），管线校验对该产物只查存在性 + PNG 魔数。
- `fgui-sprite`：像素 UI 资产的主链路是 `bun run fgui sprite`（含调色板锁定与 FGUI 包登记），与 assetgen 的 staging 契约不同，适配器引导调用方选择正确通道，不伪造产物。

## Consequences

- **tools/content**：新增 lib/generator.ts、lib/artifact-validation.ts、commands/assetgen.ts、generators/（python-wave/comfyui/fgui-sprite）；`content assetgen` 三子命令。
- **登记表**：`generated-assets.json` 作为生成产物索引（文件侧），与配置表（引用侧）由 `content validate` 的资源声明衔接。
- **资产**：示例产物 `assets/audio/sfx/sfx_test_hit.wav`（python-wave 实跑 ingest 登记）与 `assets/game-content/generated/battle_splash_0.png`（comfyui 真实联调 ingest 登记）。
- **文档**：AGENTS.md 内容管线章节补「生成器接入」纪律（禁止绕过管线手放产物进 assets/）；README 门禁表增补 assetgen。
- **Non-Goals（记录）**：生成器远程编排/队列；产物版本化与回滚；新增运行时依赖（无，Python 参考生成器仅标准库；ComfyUI 本体与模型权重在仓库外 `D:\dev\ComfyUI`，不随仓库分发）。
