---
kind: build_system
name: Cocos Creator 构建与打包系统
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - tsconfig.json
    - settings/v2/packages/engine.json
    - settings/v2/packages/builder.json
    - settings/v2/packages/project.json
    - settings/v2/packages/program.json
---

本项目基于 Cocos Creator 3.8.8 引擎，采用编辑器驱动的配置式构建体系，没有自定义 Makefile、Dockerfile 或 CI 脚本。构建流程完全由 Cocos Creator 的 settings/v2/packages 配置集管理。

**构建系统与工具链**
- 引擎版本：Cocos Creator 3.8.8（package.json 中 creator.version）
- TypeScript 编译：继承 temp/tsconfig.cocos.json（由 Cocos 自动生成），仅覆盖 strict: false
- 测试运行器：bun test，通过 package.json scripts.test:foundation 执行
- 资源构建：Cocos Creator 内置 builder（settings/v2/packages/builder.json 版本 1.3.9）

**核心配置文件**
- settings/v2/packages/engine.json：引擎模块裁剪配置，启用 2d、ui、audio、video、websocket、spine-4.2、custom-pipeline 等模块，禁用 3d、physics、particle 等未使用模块
- settings/v2/packages/project.json / program.json / device.json / information.json：项目元数据、程序信息、设备适配与启动画面配置
- settings/v2/packages/builder.json：构建器版本声明
- tsconfig.json：扩展 Cocos 生成的 tsconfig.cocos.json，关闭严格模式

**构建产物与缓存**
- library/：Cocos 资源库，按哈希分目录存储编译后的资源文件（json/bin/png/ttf 等）
- temp/：临时构建缓存，包含 asset-db、programming、scene cache、logs、declarations 等
- profiles/v2/：编辑器配置文件（当前为空，可能由编辑器自动管理）

**测试与验证**
- tests/framework/foundation/：Foundation 框架单元测试，覆盖应用生命周期、模块运行器、日志、调度器、平台契约等
- tests/scripts/check-foundation-contracts.ts：类型契约检查脚本
- package.json 定义两个脚本：test:foundation（运行 bun test）和 test:foundation:types（执行类型检查）

**约束与约定**
- 所有构建配置集中在 settings/v2/packages/ 下，遵循 Cocos Creator v2 配置格式
- 引擎模块通过 includeModules 精确控制打包体积，未使用的功能全部禁用
- 测试使用 bun 而非 node，强调快速执行
- 无外部 CI/CD 配置，构建依赖本地 Cocos Creator 编辑器环境