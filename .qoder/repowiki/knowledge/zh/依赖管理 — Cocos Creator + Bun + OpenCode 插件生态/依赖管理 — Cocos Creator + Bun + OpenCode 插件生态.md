---
kind: dependency_management
name: 依赖管理 — Cocos Creator + Bun + OpenCode 插件生态
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - .opencode/package.json
    - .opencode/package-lock.json
    - settings/v2/packages/engine.json
    - profiles/v2/packages/engine.json
---

本项目的依赖管理围绕 Cocos Creator 3.8.8 引擎、Bun 运行时与 OpenCode AI 插件生态构建，采用分层声明与锁定策略：

1. **项目级依赖（Cocos Creator 引擎）**
   - `package.json` 通过 `creator.version = "3.8.8"` 声明引擎版本，无 `dependencies`/`devDependencies`，说明业务代码不直接引入 npm 包。
   - 引擎模块裁剪与开关由 `settings/v2/packages/engine.json` 集中配置，启用 2D、UI、音频、视频、Spine-4.2、WebGL/WebGPU 等模块，禁用 3D、物理、XR 等。
   - `profiles/v2/packages/engine.json` 为编辑器 profile 元数据，仅保留版本号。

2. **OpenCode 插件依赖**
   - `.opencode/package.json` 声明唯一依赖 `@opencode-ai/plugin: 1.18.11`，用于扩展 AI 对话的命令与技能。
   - 该子目录同时维护 `package-lock.json` 与 `bun.lock` 双锁文件，且被 `.opencode/.gitignore` 排除在提交之外，表明依赖锁定由本地工具链生成而非仓库共享。

3. **测试与脚本运行环境**
   - `package.json` 的 `scripts` 使用 `bun test` 和 `bun ./tests/scripts/check-foundation-contracts.ts` 执行测试与类型契约检查，说明开发/测试阶段依赖 Bun 运行时。
   - 根目录未包含 `package-lock.json` 或 `bun.lock`，意味着项目本身不通过 npm/bun 安装第三方依赖。

4. **忽略策略**
   - 根 `.gitignore` 忽略 `node_modules/`；`.opencode/.gitignore` 额外忽略 `package-lock.json` 与 `bun.lock`，体现“依赖锁定文件不入库”的约定。

5. **资源与内部依赖**
   - `library/` 与 `temp/` 目录由 Cocos Creator 编辑器自动生成（含 `.assets-data.json`、`.internal-dependency.json` 等），不属于开发者管理的第三方依赖。

**约束与约定**
- 项目自身不声明任何 npm 依赖，所有第三方能力通过 Cocos Creator 引擎模块系统按需启用。
- OpenCode 插件依赖独立于主工程，锁定文件不纳入版本控制。
- 测试与脚本统一通过 Bun 执行，避免 Node.js 版本差异。
- 引擎模块裁剪通过 `includeModules` 白名单显式声明，禁止隐式引入未启用模块。