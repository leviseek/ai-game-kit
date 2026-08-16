# ADR-041: Generator Asset Ingestion — External Generator Pipeline with Contract Gate

## Status

Accepted

## Context

「AI 全流程产出」的最后瓶颈是美术/音频等非代码资产——AI 无法在可校验管线里直接产出商业级资产。P2 前瞻（落地 change：`2026-08-16-generator-asset-ingestion`）：AI 调用外部生成器（ComfyUI/音频模型/像素工具），产物经确定性闸门校验后登记进内容管线。

环境事实：本机无 ComfyUI/ffmpeg、有 Python 3.13；`fgui sprite` 是唯一像素生成器；内容管线（tools/content）已有 schema/引用/资源帧校验，缺「外部产物接入」通道。

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
- `comfyui`：HTTP 契约定义（POST /prompt + 轮询 /history 取图），接口与参数结构就位，实装抛「未配置端点」占位错误——待环境接入。
- `fgui-sprite`：像素 UI 资产的主链路是 `bun run fgui sprite`（含调色板锁定与 FGUI 包登记），与 assetgen 的 staging 契约不同，适配器引导调用方选择正确通道，不伪造产物。

## Consequences

- **tools/content**：新增 lib/generator.ts、lib/artifact-validation.ts、commands/assetgen.ts、generators/（python-wave/comfyui/fgui-sprite）；`content assetgen` 三子命令。
- **登记表**：`generated-assets.json` 作为生成产物索引（文件侧），与配置表（引用侧）由 `content validate` 的资源声明衔接。
- **资产**：示例产物 `assets/audio/sfx/sfx_test_hit.wav`（python-wave 实跑 ingest 登记）。
- **文档**：AGENTS.md 内容管线章节补「生成器接入」纪律（禁止绕过管线手放产物进 assets/）；README 门禁表增补 assetgen。
- **Non-Goals（记录）**：ComfyUI/音频模型实装（需环境 + 权重）；生成器远程编排/队列；产物版本化与回滚；新增运行时依赖（无，Python 参考生成器仅标准库）。
