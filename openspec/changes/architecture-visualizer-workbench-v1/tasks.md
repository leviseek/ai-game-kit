## 1. Foundation Workspace

- [x] 1.1 创建 `tools/arch-viewer` package、双 tsconfig、Web bootstrap 与最小 CLI，并接入根级 workspace、测试和类型检查脚本
- [x] 1.2 先写 workspace 失败测试，再验证测试、OpenSpec strict 校验、CLI 帮助和根级类型检查通过

## 2. Graph Model And Discovery

- [ ] 2.1 以测试驱动实现六类图共享数据模型、确定性标识与关系去重
- [ ] 2.2 以测试驱动实现 CodeGraph 公共 CLI 适配器及错误处理
- [ ] 2.3 以测试驱动实现 TypeScript SourceScanner，覆盖静态声明与 import/export 关系
- [ ] 2.4 汇总两类扫描来源并验证确定性输出

## 3. Local Service

- [ ] 3.1 以测试驱动实现本地 HTTP 服务、完整快照接口与静态资源服务
- [ ] 3.2 以测试驱动实现 SSE 更新通道和断线重连后的完整快照
- [ ] 3.3 将 CLI 参数与服务生命周期接线，覆盖端口、不开浏览器和单次运行模式

## 4. Web Workbench

- [ ] 4.1 实现六类架构图的视图选择与共享数据渲染
- [ ] 4.2 接入 SSE 刷新、加载状态和明确错误提示
- [ ] 4.3 验证 Web 编译产物、桌面与窄屏布局以及无 WebSocket/MCP 接口

## 5. Completion Gates

- [ ] 5.1 运行架构工具测试、根级测试、两个 tsconfig 类型检查与 OpenSpec strict 校验
- [ ] 5.2 审查新增文件行数、零新增 package、简体中文注释和文档一致性
- [ ] 5.3 检查本次 change 是否产生新的架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR；如无，明确记录无需 ADR
