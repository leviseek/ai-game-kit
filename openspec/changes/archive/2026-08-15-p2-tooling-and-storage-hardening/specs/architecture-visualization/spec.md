## Purpose

架构工作台的 codegraph 依赖可诊断：全局二进制缺失时给出安装与索引初始化指引，替代晦涩的进程失败。

## ADDED Requirements

### Requirement: codegraph 缺失提供可执行指引

架构工作台调用 codegraph 可执行文件时，若命令不存在（ENOENT），SHALL 抛带安装/初始化指引的类型化错误（如 `npm i -g codegraph` 与 `codegraph init`），SHALL NOT 静默降级为晦涩的 exitCode/stderr；其它进程失败路径行为不变。

#### Scenario: codegraph 未安装

- **WHEN** 工作台在未安装 codegraph 的环境中启动
- **THEN** 收到包含安装命令与 `codegraph init` 索引初始化提示的错误，而非无说明的进程失败
