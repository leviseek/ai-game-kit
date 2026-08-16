# AI 资产接入链路（AI Asset Ingestion Pipeline）

> 端到端链路：**外部生成器（ComfyUI）→ 确定性闸门 → 登记 → 游戏消费 → 发布验证**。
> 决策索引：ADR-040（内容管线治理）、ADR-041（生成器资产接入）、ADR-042（ComfyUI 部署工具链）。
> 相关 change：`2026-08-16-content-pipeline-governance`、`2026-08-16-generator-asset-ingestion`（已归档）。

## 一、链路全景

本链路解决「AI 无法在可校验管线里直接产出商业级资产」的最后瓶颈：AI（或外部工具）产出**非代码资产**（图/音），经确定性闸门校验后登记进内容管线，再由游戏侧消费。核心原则：**质量主观，但接入必须确定**——生成器可替换，校验与登记由管线统一承担。

```
┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐   ┌──────────────┐
│ 外部生成器     │   │ assetgen 管线      │   │ 登记表/资源        │   │ 游戏消费      │
│ (ComfyUI /    │ → │ generate → staging│ → │ generated-assets. │ → │ FGUI 组件 /   │
│  python-wave) │   │ validate → 契约闸门│   │ json + assets/ 下 │   │ TS 驱动       │
└──────────────┘   │ ingest → 登记      │   │ 的真实文件         │   └──────────────┘
                   └──────────────────┘        ▲                     │
                                               │ 发布验证闭环           ▼
                                        verify:ui-loop（validate→发布→证据→冒烟）
```

### 职责边界（谁做什么）

| 环节 | 归属 | 责任 |
|---|---|---|
| **部署 ComfyUI** | `tools/comfyui-setup`（仓库内编排脚本） | ComfyUI 本体/venv/权重**永不入库**（ADR-042）；工具链只提供 `install/model/start/stop/status` 可复现部署 |
| **生成** | `tools/content/generators/` | `GeneratorAdapter`（id/describe/generate/validate）统一契约；生成器只写 staging 并声明契约（kind/尺寸/时长），不关心管线其余部分 |
| **校验闸门** | `tools/content/lib/artifact-validation.ts` | 生成器无关的确定性校验：存在性、PNG/WAV 魔数、尺寸（IHDR）、时长（data chunk）、语义化命名；任一 error 拒绝 ingest |
| **登记** | `assets/game-content/generated-assets.json` | id → file/kind/generator/paramsHash/尺寸/时长；同 id 参数哈希不一致 warning |
| **游戏消费** | FGUI 组件 XML + TS 驱动 | 产物经 fgui-designer 登记为包资源 → 组件节点引用 → TS 按节点名驱动显隐/动画 |
| **发布验证** | `verify:ui-loop` | validate --strict → 真实发布 → 三重证据 → ccc ui-smoke 运行时冒烟 |

## 二、各环节命令速查

### 1. 部署 ComfyUI（一次性，仓库外）

```bash
bun run comfyui-setup install          # python 检查 → git clone → venv → CPU torch → requirements（幂等）
bun run comfyui-setup model             # 按 comfyui.config.json 清单下载权重（多线程分片，断点续传）
bun run comfyui-setup start             # 后台启动（--cpu --port 8188，日志/PID 落 temp/comfyui/，等 /system_stats）
bun run comfyui-setup status            # 查询运行状态
bun run comfyui-setup stop              # 按 PID 终止
```

配置：`tools/comfyui-setup/comfyui.config.json`（installDir/port/venvName/torchIndexUrl/pipIndexUrl/gitUrl/models[]）。
模型权重（如 sd-turbo 5.2GB）放 `installDir/models/checkpoints/`，**不入 git**。

### 2. 生成（assetgen）

```bash
# 环境变量或内联指定端点
export COMFYUI_ENDPOINT=http://127.0.0.1:8188

bun run content assetgen generate comfyui \
  --workflow-file tools/content/examples/comfyui-sd-turbo.json \
  --id <登记id>            # id 须符合 ^[a-z][a-z0-9_]*$（连字符会被契约闸门拒绝）
```

生成的 staging 目录：`temp/assetgen/staging/<generator>-<ts>/`，含产物 + `.assetgen.json` 契约清单。

### 3. 校验 + 登记

```bash
bun run content assetgen validate <staging-dir>   # 契约校验（error 非零退出）
bun run content assetgen ingest <staging-dir> \
  --target assets/game-content/generated \
  --id <登记id>                                    # 校验通过后复制进 assets/ + 更新登记表
```

### 4. 游戏消费（AI 图 → FGUI → 游戏画面）

以 `battle_splash` → AutoBattle VS 背景为例（完整闭环参考）：

1. **资源登记**（委派 fgui-designer）：`bun run fgui next-id --package AutoBattle --prefix ai` 分配资源 id → 把产物 PNG 复制为 `ui/demo/assets/AutoBattle/img/<名>.png` → `package.xml` 登记 `<image>`。
2. **组件节点**（委派 fgui-designer）：目标组件 XML 插入 `<image name="vs_bg" src="<资源id>" .../>`（初始 `alpha="0"`，铺满 relation）。
3. **TS 驱动**（主会话）：`UiNodes.ts` 登记节点名常量 → `VsEntrance.ts` 在 VS 阶段驱动背景 alpha 淡入淡出。
4. **发布验证**：`bun run verify:ui-loop --package AutoBattle`（validate → 真实发布 → 三重证据 → 运行时冒烟）。

> 纪律：修改 `ui/demo/assets/**/*.xml`、`package.xml` 必须委派 fgui-designer（AGENTS.md 硬规则），主会话不手写 XML；发布产物 `assets/ui/*/*.bin` 与 atlas 禁止手改。

## 三、真实链路验证证据（2026-08-16）

| 步骤 | 结果 |
|---|---|
| ComfyUI 部署 | 0.33.0 @ `D:\dev\ComfyUI`（venv + CPU torch 2.13.0+cpu），sd-turbo 5.2GB 经 hf-mirror 多线程下载 |
| 生成 | `assetgen generate comfyui` → 真实 `POST /prompt` → 轮询 `/history` → `/view` 下载 512x512 PNG |
| 闸门拦截 | `--id battle-splash`（连字符）被命名规则拒绝 → 改用 `battle_splash` 通过（闸门按设计工作） |
| 登记 | `generated-assets.json` 新增 `battle_splash → assets/game-content/generated/battle_splash_0.png` |
| 游戏消费 | fgui-designer 登记 `ai000` → `AutoBattleView.xml` 插入 `vs_bg` 节点 → VsEntrance TS 驱动 |
| 发布验证 | `verify:ui-loop --package AutoBattle` 四阶段全绿（validate → 发布 isSuccess=true → 三重证据 → ccc ui-smoke） |

## 四、扩展方向

- **新生成器**：实现 `GeneratorAdapter`（如音频模型 TTS/音效）→ `commands/assetgen.ts` 注册 → 契约校验按 kind 分支扩展（当前 png/wav）。
- **新模型/工作流**：`comfyui.config.json` models[] 增条目；工作流 JSON 沉淀到 `tools/content/examples/`（批量图、ControlNet 构图、LoRA 风格、分辨率升级）。
- **新消费点**：产物登记后经 fgui-designer 进任意 FGUI 包；游戏侧按 `UiNodes.ts` 常量寻址驱动。
- **视觉质检**：ADR-041 边界明确「质量（观感/听感）由 visual-verifier 与人工主观流程把关」——确定性闸门与质检分离，可后续将质检环节接入 assetgen 流程。

## 五、相关决策与产物索引

| 主题 | 位置 |
|---|---|
| 内容管线治理（schema/i18n/资源存在性） | ADR-040 + `doc/architecture/`（配置纪律见 AGENTS.md「内容管线」） |
| 生成器资产接入（GeneratorAdapter/assetgen/契约闸门） | ADR-041 |
| ComfyUI 部署工具链（本体不入库） | ADR-042 + `tools/comfyui-setup/` |
| 示例工作流 | `tools/content/examples/comfyui-sd-turbo.json` |
| 登记表 | `assets/game-content/generated-assets.json` |
| 已入库 AI 产物 | `assets/game-content/generated/battle_splash_0.png`（消费于 AutoBattle VS 背景 `ai000`） |
