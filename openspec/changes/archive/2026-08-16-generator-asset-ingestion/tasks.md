# Tasks: 2026-08-16-generator-asset-ingestion

## 1. 生成器接口与产物契约校验

- [x] 1.1 `tools/content/lib/generator.ts`：`GeneratorAdapter` 接口（id/describe/generate/validate）+ 注册表（registerGenerator/listGenerators/getGenerator）
- [x] 1.2 `tools/content/lib/artifact-validation.ts`：产物契约校验纯函数——存在性、PNG/WAV 魔数签名、PNG 尺寸（IHDR）、WAV 时长（data chunk + 采样参数，±10ms）、语义化命名（小写字母开头）
- [x] 1.3 `tools/content/test/generator.test.ts` + `artifact-validation.test.ts`：接口注册/未知 id、契约各分支（构造 PNG/WAV 头，fixture 驱动）

## 2. staging 管线（assetgen 命令）

- [x] 2.1 `commands/assetgen.ts`：`generate <id> [--k v]`（产物写 `temp/assetgen/staging/<run>/` + `.assetgen.json` 契约清单）、`validate <dir>`（管线契约校验，error 非零退出）、`ingest <dir> --target assets/<...> --id <id>`（校验后复制 + 登记表更新 + staging 清理，`--keep` 保留）；子命令手拆 argv（不在 run 层 parseArgs，避免吞子命令参数）
- [x] 2.2 登记表 `assets/game-content/generated-assets.json`：id → file/kind/generator/paramsHash/尺寸/时长；同 id 参数哈希不一致 warning；`--target` 限 `assets/` 内且拒 `..`
- [x] 2.3 接线 `bun run content assetgen`（cli 注册 + registerBuiltinGenerators）+ `temp/` gitignore（已覆盖 staging）

## 3. 参考适配器

- [x] 3.1 `generators/python-wave.ts` + `generators/python-wave.py`：Python 3 标准库生成 WAV（正弦/噪声/包络），`generate` 落 staging、声明时长；Python 缺失抛环境错误（ENOENT 判定）；**本机实跑全链路验证**：generate（sfx_test_hit.wav 0.3s）→ validate 契约通过 → ingest 登记 + staging 清理
- [x] 3.2 `generators/comfyui.ts`：HTTP 契约定义（POST /prompt + 轮询 /history），实装抛「未配置端点」占位错误；`fgui-sprite` 适配器引导走既有 `bun run fgui sprite` 主链路（不伪造产物）
- [x] 3.3 单测：python-wave 生成 WAV 契约校验通过（本机 Python 3 实跑）、comfyui 占位错误、内置生成器注册齐全

## 4. 文档、门禁与收尾

- [x] 4.1 `AGENTS.md` 内容管线章节补「生成器接入」纪律（产物经 staging 校验后 ingest，禁止绕过管线手放 assets/）；`README.md` 门禁表增补 `bun run content assetgen`
- [x] 4.2 全部门禁绿（typecheck:ci/lint/全量 test 含 content 39 用例/content validate/ai-sync check/openspec validate）
- [x] 4.3 ADR 检查：**已创建 ADR-041**（生成器接入模式：GeneratorAdapter 抽象 + staging 管线 + 产物契约闸门 + 参考适配器分层；闸门与质检职责分离）
