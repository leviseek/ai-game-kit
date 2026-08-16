## ADDED Requirements

### Requirement: codegraph 索引自动初始化（ensure）

架构工作台在启动时 SHALL 自动检查 codegraph 索引状态：`.codegraph/codegraph.db` 缺失或过期时 SHALL 自动执行 `codegraph init` 完成初始化，SHALL NOT 要求开发者预先手动运行；codegraph 可执行文件本身缺失时，SHALL 沿用「codegraph 缺失提供可执行指引」要求的行为，抛带安装/初始化指引的类型化错误。

#### Scenario: 索引缺失自动初始化

- **WHEN** 开发者在未初始化 codegraph 的环境中启动 `bun run arch`
- **THEN** 工作台自动执行 codegraph 索引初始化，成功后正常启动，无需人工干预

#### Scenario: CLI 缺失仍给指引

- **WHEN** 环境中不存在 codegraph 可执行文件且索引缺失
- **THEN** 工作台抛出包含安装命令与 `codegraph init` 提示的类型化错误，而非静默失败

#### Scenario: 索引过期自动重建

- **WHEN** `.codegraph/codegraph.db` 存在但落后于源码（按工具约定的过期判定）
- **THEN** 工作台自动重建索引并以最新数据启动
