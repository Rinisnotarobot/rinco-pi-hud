<div align="center">

# Rinco Pi HUD

**为 [Pi](https://github.com/earendil-works/pi) 打造的实时状态脚注。** 项目、Git、会话、工具与费用状态分成四组，随你的操作即时更新。

[![Pi package](https://img.shields.io/badge/Pi-package-F2A7C6?style=flat-square)](https://github.com/earendil-works/pi) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/) [![License](https://img.shields.io/badge/license-MIT-C7B8F5?style=flat-square)](../LICENSE)

[安装](#安装) · [命令](#命令) · [显示什么](#显示什么) · [布局](#布局) · [开发](#开发)

[English](../README.md)

</div>

<p align="center">
  <img src="../assets/readme/hero.svg" width="100%" alt="Rinco Pi HUD 在 Pi 中的实际脚注：Project 行显示目录、Git 分支与 Node 版本，Session 行显示 Provider 与模型，Activity 行显示工具调用计数，Usage 行显示 Context 窗口、Token、缓存命中率与费用。">
</p>

Rinco Pi HUD 用四组实时状态替换 Pi 的脚注行，不需要的部分都能单独关掉。Pi 直接加载 TypeScript 扩展，没有构建步骤：`tsconfig.json` 设了 `noEmit: true`，只服务于 `npm run typecheck`。

## 安装

```bash
pi install npm:rinco-pi-hud
```

装完重启 Pi，或执行 `/reload`。脚注默认启用，`/zentui` 打开设置界面。

从 GitHub 或本地目录安装：

```bash
pi install git:github.com/Rinisnotarobot/rinco-pi-hud
```

```bash
git clone https://github.com/Rinisnotarobot/rinco-pi-hud.git
cd rinco-pi-hud
pi install "$PWD"
```

> [!IMPORTANT]
> Pi 扩展以当前用户权限运行。安装任何第三方扩展前，请先审查其源码。

> [!NOTE]
> 脚注需要支持 Truecolor 的终端。上图用的是 ASCII 图标模式，`/zentui` 可以在 `auto`、`nerd`、`ascii` 三套符号之间切换。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/zentui` | 设置界面：行、状态段、分隔符、图标、颜色、模板 |
| `/zentui statusline enable\|disable\|toggle` | 显示或隐藏整个脚注 |
| `/zentui row project\|session\|activity\|usage <enable\|disable\|toggle>` | 开关某一行 |
| `/zentui format "<template>"` | 用单行模板替换四行布局 |
| `/codex-status` | 打印 Codex 订阅用量与限额窗口 |
| `/usage-refresh` | 立即刷新脚注上的模型用量或余额 |

## 显示什么

| 行 | 状态段。每段在 `/zentui` 的 **Built-in segments** 里都有独立开关 |
| --- | --- |
| **Project** | 目录、Git 分支、Commit 与 Tag、工作区状态、Git 操作状态（`MERGING`、`REBASING` 等）、差异指标、运行时、包版本、OS、用户 |
| **Session** | 会话名称、Provider 与模型、Thinking 等级、轮次、会话时长 |
| **Activity** | 正在运行的 Tool、已完成 Tool 计数、活跃 Agent、`Agent idle`、Skill、MCP Server |
| **Usage** | Context 窗口与进度条、输入/输出 Token、缓存读写量与命中率、费用、模型限额、时间 |

行用 `/zentui row usage disable` 开关；行内每个状态段在同一界面里各有开关。使用旧版聚合开关 `tokens`、`toolActivity`、`agentActivity` 的配置会自动迁移。

### 模型限额

Usage 行跟随当前模型的 Provider：

- **openai-codex**：ChatGPT 订阅限额与重置额度，优先走 Pi 认证，失败时回落到 `codex app-server`。显示形如 `codex 60% 5h (14:30) 75% wk`，窗口跨天时重置时间变成 `14:30 12 Feb`。
- **token-switch**：从 `TOKEN_SWITCH_API_KEY` 环境变量读取账单余额，显示形如 `token-switch $750.00`。
- **deepseek**：用 Pi 为 deepseek 供应商保存的凭据（`/login` 写入的，或 `DEEPSEEK_API_KEY`）查询 DeepSeek 余额接口，显示形如 `deepseek ¥110.00`；账户同时有 CNY 和 USD 时优先显示 CNY。

这些查询超时 15 秒、缓存 5 分钟，`/usage-refresh` 可以立即刷新当前生效的那一个。

## 布局

<p align="center">
  <img src="../assets/readme/responsive.svg" width="100%" alt="同一个脚注在 72 列和 56 列终端下的渲染：行只在状态段边界换行，续行在分隔符列对齐，放不下的工具计数状态段用省略号截断，其后的状态段照常显示。">
</p>

分组只在状态段边界换行。续行重新对齐到分隔符列下方，放不下的状态段用 `…` 截断，而不是把后面的状态段挤出这一行。

想换成单行脚注，设置模板即可：

```text
/zentui format "$cwd( $git_branch)$fill($context)( $tokens)( $cost)"
```

变量可以写成 `$name` 或 `${name}`。[脚注参考](footer.md)列出了全部变量和别名（`$directory`、`$status`、`$codex` 等）。不带参数的 `/zentui format`（或 `/zentui format clear`）恢复四行分组布局。

## 配置

`/zentui` 把配置写入 `~/.pi/agent/rinco-pi-hud.json`，改动立即生效。可配置分隔符样式、图标模式（`nerd`、`ascii`、`auto`）、脚注配色（Pi 主题色或终端调色板样式）、Context 渲染方式（文本、进度条或两者）、项目刷新间隔，以及第三方扩展状态的位置与颜色模式。

完整的变量与状态段参考见 [docs/footer.md](footer.md)。

## 仓库结构

| 路径 | 说明 |
| --- | --- |
| [`extensions/hud/index.ts`](../extensions/hud/index.ts) | Controller、共享状态与 UI 安装的组合入口 |
| [`extensions/hud/config/`](../extensions/hud/config/config.ts) | 配置模型、归一化、迁移与持久化 |
| [`extensions/hud/footer/`](../extensions/hud/footer/index.ts) | 脚注渲染、语义分组、响应式布局与模板解析 |
| [`extensions/hud/segments/`](../extensions/hud/segments/) | 状态采集器：Git、运行时、MCP、Skill、项目等 |
| [`extensions/hud/telemetry/`](../extensions/hud/telemetry/format.ts) | 用量格式化、各家余额探测与 Codex 订阅客户端 |
| [`extensions/hud/session/`](../extensions/hud/session/) | Pi 事件注册、会话生命周期与实时 Context 覆盖 |
| [`extensions/hud/state/`](../extensions/hud/state/) | 聚合状态、Telemetry Reducer 与项目刷新 Controller |
| [`extensions/hud/commands/`](../extensions/hud/commands/settings.ts) | `/zentui` 设置界面与配置 Controller |
| [`extensions/hud/ui/`](../extensions/hud/ui/) | 图标与终端样式工具 |
| [`docs/footer.md`](footer.md) | 完整脚注配置参考 |
| [`docs/CONTRIBUTING.md`](CONTRIBUTING.md) | 本地开发、测试规范和 PR 检查清单 |
| [`tests/`](../tests/) | Vitest 测试套件：脚注布局、遥测、各家余额与 MCP 解析 |

## 开发

需要 Node.js 22.19 或更高版本，以及 [Pi](https://github.com/earendil-works/pi) 本身。

```bash
npm install
npm test          # Vitest 测试套件
npm run typecheck # tsc --noEmit
npm run verify    # 格式、类型、Lint、测试
```

全部脚本定义在 [`package.json`](package.json) 里，完整清单（含 `lint`、`format`、`test:watch`）见 [docs/CONTRIBUTING.md](CONTRIBUTING.md)。

### README 图片

上面两张图不是手绘的，而是从真实脚注渲染结果生成的。`assets/readme/source/capture-footer.mts` 用扩展自己的 `installFooter` 渲染路径跑本仓库的状态和一份真实 Pi 会话记录，`build-assets.mts` 再把 ANSI 文本转成 SVG：

```bash
npx tsx assets/readme/source/capture-footer.mts . ~/.pi/agent/sessions/<session>.jsonl 118 72 56 > /tmp/footer.json
npx tsx assets/readme/source/build-assets.mts /tmp/footer.json
```

## 常见问题

<details>
<summary>脚注没有显示</summary>

确认当前运行在 Pi TUI 模式，而不是 Headless、JSON 或 Print 模式。然后执行 `/reload`，并用 `pi list` 确认包已安装。
</details>

<details>
<summary>窄终端里布局看起来不对</summary>

脚注会测量终端宽度，只在状态段边界换行，所以窗口越窄，每行容纳的状态段越少。可以设置 `footerFormat` 模板，或在 `/zentui` 中关闭低优先级状态段。
</details>

<details>
<summary>颜色显示异常</summary>

默认配色输出 `38;2;r;g;b` Truecolor 序列，不支持 Truecolor 的终端会近似处理或直接忽略。
</details>

<details>
<summary>图标缺失或错位</summary>

Unicode 与 Nerd Font 符号的显示效果因终端和字体而异。建议安装 Nerd Font，或在 `/zentui` 中切换到 ASCII 图标。
</details>

## 许可证

MIT，详见 [`LICENSE`](../LICENSE)。

## 第三方许可证

本包包含以下开源项目的衍生作品：

- **pi-zentui**（Luka）— MIT 许可。脚注部分经改编后用于本包。  
  源码：https://github.com/lmilojevicc/pi-zentui
- **pi-shannon-statusline**（RealAlexandreAI）— MIT 许可。会话、模型、活动、MCP、配置统计和 Codex 订阅功能改编自该项目。  
  源码：https://github.com/RealAlexandreAI/pi-shannon-statusline
- **pi-codex-usage**（narumiruna）— MIT 许可。`extensions/hud/telemetry/codex-usage/` 下的 Codex 用量客户端衍生自该项目。  
  源码：https://github.com/narumiruna/pi-codex-usage

详见 [NOTICE](../NOTICE)。
