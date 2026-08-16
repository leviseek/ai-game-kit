## Purpose

提供外部生成器（ComfyUI/音频模型/像素工具）产物的确定性接入通道：统一生成器接口、staging 管线（generate/validate/ingest）与产物契约校验，使外部工具结果可校验、可登记、可被内容管线引用。

## ADDED Requirements

### Requirement: 生成器接口抽象

系统 SHALL 提供统一生成器接口：`id`（唯一）、`describe`（用途说明）、`generate(params) → 产物集`（落到 staging）、`validate(产物) → issues`（生成器自有校验）；生成器 SHALL 可替换（外部进程/Python/既有 CLI），管线不感知具体生成器实现。

#### Scenario: 注册生成器并生成

- **WHEN** 开发者执行 `bun run content assetgen generate python-wave --duration 0.5`
- **THEN** 产物（WAV）写入 staging 目录并输出产物清单

#### Scenario: 未知生成器拒绝

- **WHEN** 指定不存在的生成器 id
- **THEN** assetgen 报错并列出已注册生成器

### Requirement: staging 产物校验

系统 SHALL 在登记前校验 staging 产物契约：文件存在性、格式签名（PNG/WAV 魔数）、尺寸/时长声明与实际一致、命名规范（语义化前缀）；任一不满足 SHALL 报 error 且不得进入 ingest。

#### Scenario: 尺寸不符被拦截

- **WHEN** 生成器声明 256×256 但产物实际 128×128
- **THEN** assetgen validate 报尺寸不一致 error，ingest 拒绝

#### Scenario: 非法格式被拦截

- **WHEN** 产物文件扩展为 .png 但内容非 PNG 签名
- **THEN** validate 报格式签名不符 error

### Requirement: ingest 登记

系统 SHALL 在校验通过后执行 ingest：复制产物到目标 `assets/` 目录，并更新登记表（`generated-assets.json`：id → 文件/用途/生成器/参数哈希）；登记后产物 SHALL 可被 `content validate` 的资源声明引用。

#### Scenario: 校验通过后登记

- **WHEN** staging 产物契约全部满足
- **THEN** ingest 复制产物并登记，`content validate` 通过

#### Scenario: 重复登记检测

- **WHEN** 同 id 产物再次 ingest 且参数哈希不一致
- **THEN** 登记表报冲突 warning（提示覆盖或换 id）

### Requirement: 参考适配器

系统 SHALL 提供至少一个可运行的参考生成器（如 `python-wave`：Python 3 生成 WAV，正弦/噪声/包络，无第三方依赖），证明外部进程生成器接入可行；`comfyui` 适配器 SHALL 定义 HTTP API 契约（接口就位、实现待环境）。

#### Scenario: 参考生成器可运行

- **WHEN** 本机有 Python 3 且执行 `assetgen generate python-wave`
- **THEN** 产出合法 WAV 文件（格式签名校验通过）
