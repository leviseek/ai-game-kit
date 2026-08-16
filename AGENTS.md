# AGENTS.md — AI 编码协作约定

本文件是所有 AI 编码工具（OpenCode、Codex、Qoder 等）的项目级指令，优先级高于全局规范。

## 注释语言

- 本仓库代码注释使用**简体中文**；标识符、类型名、API 名称、错误消息字符串、文件路径保持英文。
- 注释只解释不明显的意图、限制、权衡与边界条件；不重复代码表面行为，不写装饰性注释。
- 修改逻辑时同步更新受影响的注释；删除逻辑时同步删除对应注释。
- 关键术语首次出现时保留英文原文，例如：显式所有者对象池（explicit-owner）、幂等（idempotent）、重入（reentrant）、去重（deduplication）、作用域（scope）。

## 其它约束

- 遵循 `.ai/instructions.md` 与 `openspec/config.yaml` 的规则与 guidance。
- 涉及 OpenSpec change 的实现、审查与归档时，按 `openspec/config.yaml` 的 operations 执行。
- **动画优先使用 framework 动画能力**：表现层动画（位移/淡入/飘字等）优先经 framework 的 `GameClock`（统一 timeSource 注入物，支持全局 rate/分层 pause/jump）驱动，动画器只读 `now()` 不自行乘 rate 或判跳变；游戏层禁止直接 `import cc` 做 tween；FGUI 禁 transition 不变（动画全 TS 驱动）。新增动画能力复用既有 `effect-animator`/`vs-entrance` 的注入 timeSource 模式（见 ADR-029）。

## FGUI 工作流

- **禁止使用 FGUI graph 组件**（见 `.ai/instructions.md` 第 9 条）：任何组件源 XML 不得出现 `<graph>` 节点；纯色视觉一律用 `bun run fgui sprite` 生成像素图并以 `<image>` 引用。
- **FGUI 组件创建/修改必须委派给 fgui-designer subagent**（绑定多模态 `codexapis/gpt-5.6-sol`）：遇到创建或修改 `ui/demo/assets/**/*.xml`、`package.xml` 的需求，先委派 `fgui-designer`，不要在主会话直接手写 XML。
- **新建组件用 `/fgui-create`，编辑已有组件必须用 `/fgui-edit`**（编辑是写操作，必须走显式 command 固化的流程，禁止主 agent 凭记忆直接改）。
- **三层角色分工**：fgui-designer 是设计决策与 XML 权威产出者（创建/编辑唯一入口）；fgui-mcp 是工具面（编辑器内写原语 + 发布/截图通道，无设计能力）；`visual-verifier` 是只读视觉质检（通用模式核对任意渲染截图，`mode=fgui` 叠加 FGUI 专项检查）。三者不互相替代；创建/编辑组件仍以「fgui-designer 产出 spec→XML→validate」为主链路，fgui-mcp 用于编辑器内微调与视觉验证闭环。
- **确定性操作一律用 fgui CLI**：资源清单/组件索引/引用校验/短 id 分配/像素图生成与登记，均通过 `bun run fgui <command>`（`tools/fgui/`）。任何 src 引用前先 `list-resources` 确认真实资源 id，产出 XML 后必须 `validate` 到通过。
- **validate 语义**：除引用完整性外还校验 controller 配对、gear 一致性、Slider/ProgressBar/ComboBox/Button 骨架、image 误用 fill、fileName 一致、transition 禁令、资源 id 续编冲突。**Basic/Builder 为官方库默认豁免**，需 `--strict` 才全量检查。
- **fgui-mcp 写后必须补跑 validate**：fgui-mcp 的内存态写原语（add_child/set_object_property/控制器/关系 等）不执行 CLI 语义校验，`fgui_save_documents` 回写 XML 后必须补跑 `bun run fgui validate --strict`，通过后才可发布；不绕过 CLI 校验路径。
- **导出组件名全局唯一**：`exported="true"` 的组件 name 在整个工程跨包不得重复（运行时绑定按「包+组件名」复合键定位，同名会为未来按名全局生成绑定埋下冲突）。由 `fgui validate` 跨包查重强制检查；新建/改名组件前先跑全工程 validate 确认无冲突。
- **relation 约束**：单个 `<relation>` 的 `sidePair` 最多 2 项；不得把第三个约束叠加到同一 relation。创建或编辑后必须由 `validate --strict` 检查，并在 FGUI 编辑器中刷新目标组件确认可读取。
- **调色板锁定**：sprite 生成的颜色必须 ⊆ `ui/demo/palette.json` 允许集合；新色先加入该文件。资源 id 采用前缀续编（`next-id --prefix`）。
- **跨资源包引用只允许指向通用资源包 `Common`/`Common_xxx`**：禁止业务包（Demo/CardGame 等）跨包引用其它业务包，也禁止跨包引用 FairyGUI 编辑器官方库包 `Basic`/`Builder`（只能作参考示例，不得使用）。共享按钮/进度条等通用组件统一承载于 `ui/demo/assets/Common/`；打开业务页面 package 前必须先注册 Common（fgui loadPackage 不自动加载依赖包），否则跨包组件退化为空组件、点击事件不触发（见 `.ai/instructions.md` 第 13 条）。
- **发布产物由 FGUI 编辑器生成**：`assets/ui/*/*.bin` 与 atlas 禁止手改；修改源 XML/PNG 后需在 FGUI 编辑器中重新发布对应包，不得提交陈旧 bin（见 `.ai/instructions.md` 第 14 条）。
- **字符串归口**：新增事件名、状态名、FGUI 资源 URL / 节点名 / 动画名、bundle 名等字符串前，必须先搜索已有常量表与类型联合（`assets/ui/generated/`、模块内 `constants.ts`、既有 `EventMap`/状态联合类型）。命中「三问」任一必须进常量表，否则禁止裸写：
    - 跨模块共享（存在第二个消费方）
    - 耦合外部契约（FGUI 资源 URL、组件名、节点名、bundle 名、存储 key）
    - 拼错会静默断裂（事件名、状态名、资源 id）
      FGUI 资源 URL 一律引用 `assets/ui/generated/` 生成产物（名字格式 `ui://<包名>/<资源名>`，禁用短 id 裸写 `ui://<pkgId><resId>`）；事件/状态等模块内常量用 `const X = {...} as const` + 联合类型双导出。

## AI 资产治理（skills / commands / agents）

- **单一真源**：`.codex`、`.cursor`、`.claude`、`.opencode`、`.qoder`、`.agents` 下的 skills/commands/subagent 定义是**生成物**，唯一真源在 `tools/ai-sync/registry/`（`manifest.json` 声明目标映射）。**禁止手改工具目录中的受管文件**；修改/新增资产一律改 registry，再运行 `bun run ai-sync sync --apply`。
- **提交前 check**：改动 registry 或 manifest 后，提交前必须 `bun run ai-sync check` 通过（受管文件与 registry 逐字一致；`doctor` 可诊断漂移/空目录）。
- **模型注册表**：subagent 的模型声明在 `registry/models.json`（角色 → primary/fallback），agent 文件 frontmatter 的 `model:` 由模板占位符渲染，禁止在 agent 正文散落裸模型名。primary 模型不可用时，委派前用 `bun run ai-sync verify-models` 确认可用性，并按 fallback（如有）覆写模型。
- **UI spec 流程**：FGUI 创建/编辑先产出结构化 spec.json，运行 `bun run fgui spec-check --spec <spec.json>`（硬规则：字号档位、interactive 类型决策、graph/transition 禁令、relation sidePair ≤ 2、语义化命名），通过后才映射 XML（见 `/fgui-create`、`/fgui-edit`）。

## 内容管线（配置 / 本地化）

- **配置纪律**：`assets/game-content/**/*.json` 是内容数据，schema 由 `tools/content/lib/schemas/` 定义（新增表按模板补 schema 模块）。产出/修改配置后必须 `bun run content validate` 通过（schema/跨表引用/id 唯一/内嵌文本禁令 + i18n 完整性 + 生成物 freshness）。
- **内嵌文本禁令**：用户可见文本（`name`/`description` 等）**禁止内嵌中文或直接文案**，必须引用本地化 key（`auto_battle.<table>.<id>.<field>`，见 `assets/game-content/i18n/`）；新增 key 同时补 `zh-CN.json`（主语言权威）与各翻译表，再 `bun run content gen-i18n`。
- **文案消费**：游戏侧展示层经 `assets/game-content/generated/i18n.ts` 的 `text.get(key)` 取文案（未知 key fail-fast）；领域层只承载 key 不消费文案。生成物禁止手改（freshness 由 `content validate` 强制）。
- **生成器接入（外部资产）**：外部生成器产物（ComfyUI/音频模型等）一律经 `bun run content assetgen` 管线——`generate <生成器>` 落 staging → `validate` 契约校验（存在/签名/尺寸/时长/命名）通过 → `ingest --target assets/<子目录> --id <id>` 登记（`generated-assets.json`）。**禁止直接手放生成产物进 `assets/` 绕过校验**；像素 UI 资产继续走 `bun run fgui sprite` 主链路（见 FGUI 工作流）。
- **ComfyUI 部署边界**：ComfyUI 本体/venv/模型权重（`.safetensors` 等）**永不入库**（体积与许可）；仓库只提供部署工具链 `tools/comfyui-setup`（`bun run comfyui-setup install → model → start → status`，配置在 `tools/comfyui-setup/comfyui.config.json`，见 ADR-042）。部署/启动/停止一律走该工具链，禁止在仓库内手装 ComfyUI 或提交权重。
