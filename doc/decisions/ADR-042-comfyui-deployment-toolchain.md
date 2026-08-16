# ADR-042: ComfyUI 部署工具链 — 仓库只提供编排脚本，本体与权重不入库

## Status

Accepted

## Context

真实 ComfyUI 联调（ADR-041 更新）证明 `content assetgen` 的 `comfyui` 适配器全链路可用。但 ComfyUI 本体是重依赖：Python 环境（venv + CPU torch ~2GB）+ 模型权重（sd-turbo 5.2GB）+ 源码，**不应进入仓库**（仓库体积、CI、克隆负担；且权重有版权/许可与分发问题）。同时，此前部署步骤（venv 创建、CPU torch 的 index-url、清华镜像、模型清单、端口、启动参数）只散落在 ADR 与对话里，**不可复现**——新机器无法一键就绪。

决策目标：仓库提供「如何部署 ComfyUI」的可复现工具链（配置 + 编排脚本），而非 ComfyUI 本身；外部生成器接入纪律（AGENTS.md「生成器接入」）保持不变。

## Decision

新增 `tools/comfyui-setup` workspace（bun TS CLI，零第三方运行时依赖），只编排仓库外安装：

- `comfyui-setup install [--force]`：python 检查 → git clone（`config.gitUrl`，幂等跳过）→ venv → **CPU-only torch**（`--index-url <torchIndexUrl>`，防 requirements 误拉 CUDA 版）→ requirements（`-i <pipIndexUrl>` 镜像可配）；每步存在性幂等，`--force` 整体重装。
- `comfyui-setup model [--id <id>] [--threads N]`：按 `comfyui.config.json` 模型清单多线程分片下载到 `installDir/<file>`（已存在同大小跳过）。
- `comfyui-setup start`：后台启动（`--cpu --port`，`--disable-auto-launch`），日志/PID 落 `temp/comfyui/`（gitignored），轮询 `/system_stats` 健康后返回；已在运行幂等。
- `comfyui-setup stop`：按 PID 终止（Windows `taskkill /T` 连子进程），清理 PID。
- `comfyui-setup status`：`/system_stats` + PID 记录查询。

配置 `tools/comfyui-setup/comfyui.config.json`：`installDir`（默认 `D:/dev/ComfyUI`）、`port`、`venvName`、`torchIndexUrl`、`pipIndexUrl`、`gitUrl`、`models[]`（id/url/size/file）。字段级合并默认值，`--config` 可覆盖。

多线程下载逻辑从 `scripts/comfy-download.py`（上一轮联调临时工具）**吸收进** `lib/download.ts`（probeSize + 并发 Range 分片 + 断点续传），原脚本删除。

## Consequences

- **tools/comfyui-setup**：cli.ts/config.ts/lib/(args|exec|download).ts/commands/(install|model|start|stop|status|paths).ts + 单测（config 合并、下载假服务器 Range 协议）。
- **根 package.json**：workspace 注册 + `comfyui-setup` 脚本 + `test:comfyui-setup` 入 `test` 链 + `typecheck(:ci)` 纳入。
- **仓库边界**：ComfyUI 本体、venv、模型权重（`.safetensors` 等）永不入库；`temp/comfyui/` 运行时 PID/日志已由 `temp/` 忽略。
- **可复现**：新机器按 `bun run comfyui-setup install → model → start` 即可就绪真实 ComfyUI（镜像/模型源在配置中可改）。
- **Non-Goals（记录）**：GPU/CUDA 部署（torchIndexUrl 可改，本工具默认 CPU）；模型版本管理与许可审计（清单手动维护）；ComfyUI 进程守护/自愈（stop/start 手动编排）。
