---
kind: configuration_system
name: 配置系统 — Cocos Creator 项目配置与平台抽象存储
category: configuration_system
scope:
    - '**'
source_files:
    - assets/framework/contracts/platform/Platform.ts
    - assets/framework/adapters/memory/MemoryPlatform.ts
    - assets/boot/AppRoot.ts
    - assets/framework/application/ApplicationContext.ts
    - settings/v2/packages/engine.json
    - settings/v2/packages/cocos-service.json
    - openspec/config.yaml
---

本项目的配置系统由两层构成：Cocos Creator 引擎层面的工程/构建配置，以及框架层通过 PlatformStorage 抽象提供的键值存储能力。

**1. 引擎与项目配置（Cocos Creator）**
- `settings/v2/packages/engine.json`：定义引擎模块开关、渲染管线、物理引擎、Spine 版本等运行时模块加载清单（`includeModules`），是游戏运行时的核心配置。
- `settings/v2/packages/project.json`、`profiles/v2/packages/project.json`：记录项目元数据（`__version__`），分别对应设置与构建 profile。
- `settings/v2/packages/cocos-service.json`：Cocos 服务（云配置、远程配置）的 app_id、config_id 映射，用于运行时拉取远程配置。
- `openspec/config.yaml`：OpenSpec 规范驱动的配置，规定 change 归档前必须完成 ADR 检查的规则与操作指引。

这些文件均由 Cocos Creator 编辑器生成与维护，应用启动时由引擎自动加载，不经过自定义解析逻辑。

**2. 框架层配置存储抽象（PlatformStorage）**
- 接口定义在 `assets/framework/contracts/platform/Platform.ts`，提供 `PlatformStorage`（`get/set/delete`）、`ApplicationVisibility`、`DeviceInfo` 三个契约。
- 测试实现 `assets/framework/adapters/memory/MemoryPlatform.ts` 以内存 Map 实现 `PlatformStorage`，支持通过 `initialEntries` 注入初始键值对（如 `{ "config.theme": "dark" }`），所有操作均为异步 Promise 风格。
- 实际 Cocos 平台的持久化存储（localStorage/文件系统）应通过实现同一 `PlatformStorage` 接口接入，从而将配置读写与平台解耦。

**3. 应用装配与启动流程中的配置注入**
- `assets/boot/AppRoot.ts` 中 `assembleApp()` 负责组装 Application、Logger、Context 与 Adapter，但当前未显式注入 Platform 实例；Platform 的装配应在更高层或后续扩展中完成。
- `assets/framework/application/ApplicationContext.ts` 仅暴露 logger 与 state，不包含配置读取能力，说明配置访问应通过依赖注入的 Platform 契约进行。

**4. 约定与约束**
- 配置键采用点号分隔的命名空间（如 `config.theme`、`player.name`），便于分层组织。
- 所有配置存取必须走 `PlatformStorage` 接口，禁止直接调用平台 API，保证可测试性与跨平台。
- OpenSpec 变更流程强制在归档前完成 ADR 检查，确保架构决策与配置策略同步文档化。

目前仓库尚未包含实际的 Cocos 平台 `PlatformStorage` 实现，MemoryPlatform 仅服务于单元测试。配置系统的完整落地需要补充平台适配器并在 AppRoot 装配阶段注入。