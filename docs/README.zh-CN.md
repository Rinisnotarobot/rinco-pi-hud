<div align="center">

# Rinco Pi HUD

**为 [Pi](https://github.com/earendil-works/pi) 打造的动态 HUD 脚注。**

[![Pi package](https://img.shields.io/badge/Pi-package-F2A7C6?style=flat-square)](https://github.com/earendil-works/pi) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/) [![License](https://img.shields.io/badge/license-MIT-C7B8F5?style=flat-square)](../LICENSE)

[功能](#功能) · [安装](#安装) · [使用](#使用) · [定制](#定制) · [开发](#开发)

[English](../README.md)

</div>

Rinco Pi HUD 为 Pi TUI 会话提供丰富的实时状态脚注，可显示项目状态、Git 指标、运行时版本、会话活动、模型用量、Token 费用等信息，支持响应式四分组布局或可定制的单行布局。Pi 可直接加载 TypeScript 扩展，无需构建步骤（`tsconfig.json` 设置了 `noEmit: true`，仅用于 `npm run typecheck` 类型检查）。

## 功能

- **Project state**：当前目录、Git 分支、Commit、Tag、工作区状态、差异指标和运行时版本。
- **Session activity**：模型、Provider、Context 用量、Token、缓存、会话费用、轮次和 Thinking 等级。
- **Tool and agent activity**：Native Tool 完成次数、正在运行的 Tool、活跃 Agent 数、Skill 和 MCP Server 状态。
- **Model quota**：根据当前模型自动切换 Codex 周限额或 Token Switch 余额。
- **Git awareness**：分支、Detached HEAD、Tag、Ahead/Behind、Stash、合并冲突和脏状态。
- **Runtime detection**：支持 Node、Python、Go、Rust、Java 等 60+ 运行时，并解析项目清单版本。
- **Configurable layout**：默认使用响应式 Project、Session、Activity、Usage 四分组布局，或完全自定义的单行模板。
- **Extension statuses**：读取第三方扩展发布的状态，按配置的位置和颜色模式显示。
- **Safe fallback**：超时和错误处理优雅，会话关闭后不留过期数据。

## 安装

### 从 npm 安装（推荐）

```bash
pi install npm:rinco-pi-hud
```

该包已发布至 [npm](https://www.npmjs.com/package/rinco-pi-hud)。

### 从 GitHub 安装

```bash
pi install git:github.com/Rinisnotarobot/rinco-pi-hud
```

### 从本地目录安装

```bash
git clone https://github.com/Rinisnotarobot/rinco-pi-hud.git
cd rinco-pi-hud
pi install "$PWD"
```

> [!IMPORTANT]
> Pi 扩展以当前用户权限运行。安装任何第三方扩展前，请先审查其源码。

## 使用

安装后重启 Pi，或执行：

```text
/reload
```

HUD 脚注默认启用。运行 `/zentui` 打开交互式设置。

### 常用命令

```text
/zentui statusline enable
/zentui statusline disable
/zentui statusline toggle
/zentui format clear
/zentui format "$model · $context · $cost · $git_branch( $git_commit) · $session_duration"
/codex-status
/usage-refresh
```

> [!NOTE]
> 最佳显示效果需要支持 Truecolor 的终端和 Nerd Font。脚注使用 Unicode 符号，需要合适的字体支持。

## 包含内容

| 路径 | 说明 |
| --- | --- |
| [`extensions/hud/index.ts`](../extensions/hud/index.ts) | 扩展生命周期与副作用编排 |
| [`extensions/hud/config/`](../extensions/hud/config/config.ts) | 配置模型、归一化与持久化 |
| [`extensions/hud/footer/`](../extensions/hud/footer/index.ts) | 脚注渲染、分类布局与模板解析 |
| [`extensions/hud/segments/`](../extensions/hud/segments/) | 状态采集器：Git、运行时、MCP、Skill、项目等 |
| [`extensions/hud/telemetry/`](../extensions/hud/telemetry/format.ts) | 用量格式化、Token Switch 与 Codex 订阅客户端 |
| [`extensions/hud/session/`](../extensions/hud/session/) | 会话生命周期、上下文与实时上下文覆盖 |
| [`extensions/hud/state/`](../extensions/hud/state/) | 聚合状态、遥测与项目刷新 |
| [`extensions/hud/commands/`](../extensions/hud/commands/settings.ts) | `/zentui` 命令与交互式 TUI 设置 |
| [`extensions/hud/ui/`](../extensions/hud/ui/) | 图标与终端样式工具 |
| [`docs/footer.md`](footer.md) | 完整脚注配置参考 |
| [`docs/CONTRIBUTING.md`](CONTRIBUTING.md) | 本地开发、测试规范和 PR 检查清单 |
| [`tests/`](../tests/) | Vitest 测试套件（34+ 测试用例，6 个文件） |

## 定制

### 布局

默认布局将信息分为 Project、Session、Activity 和 Usage 四组；超长分组会在完整状态项边界处换行，并保持续行对齐。设置 `footerFormat` 模板字符串可切换为单行布局：

```text
/zentui format "$cwd( $git_branch)$fill($context)( $tokens)( $cost)"
```

模板变量使用 `$name` 或 `${name}` 语法。完整变量列表见[脚注参考](footer.md)。

### 状态段

通过 `/zentui` 启用或禁用单个状态段：

```text
/zentui statusline enable
/zentui statusline disable
/zentui statusline toggle
```

### 扩展状态

第三方扩展发布的状态可由 HUD 脚注显示。可为每个扩展状态键配置位置（`left`、`middle`、`right`、`off`）和颜色模式（`zentui`、`original`）。

## 开发

### 环境要求

- [Node.js](https://nodejs.org/) 22.19 或更高版本
- [Pi](https://github.com/earendil-works/pi)

安装开发依赖：

```bash
npm install
```

### 可用命令

<!-- AUTO-GENERATED: package-scripts:start -->
<!-- Source: package.json#scripts. Do not edit manually. -->

| 命令 | 说明 |
| --- | --- |
| `npm test` | 使用 Vitest 运行一次完整测试套件。 |
| `npm run test:watch` | 以监听模式运行 Vitest，并在文件变化后重新测试。 |
| `npm run typecheck` | 使用 `tsc --noEmit` 运行 TypeScript 类型检查。 |
| `npm run pack:check` | 使用 `npm pack --dry-run` 检查发布包内容，不生成正式发布。 |

<!-- AUTO-GENERATED: package-scripts:end -->

运行测试：

```bash
npm test
```

类型检查：

```bash
npm run typecheck
```

验证测试与发布内容：

```bash
npm test
npm run typecheck
npm run pack:check
```

本项目使用 Vitest 测试脚注布局、遥测、Codex 用量、Token Switch、配置统计和 MCP 状态解析。Pi 运行时会直接加载 TypeScript 源码，因此没有单独的构建命令。

## 常见问题

### 脚注没有显示

1. 确认当前运行在 Pi TUI 模式，而不是 Headless、JSON 或 Print 模式。
2. 执行 `/reload` 或重启 Pi。
3. 使用 `pi list` 确认包已安装。

### 脚注布局异常

脚注会自动检测终端宽度并截断内容。在窄终端中，部分状态段可能被裁剪。可通过设置自定义 `footerFormat` 模板调整布局，或在 `/zentui` 中关闭低优先级段。

### 颜色显示异常

确认终端已启用 Truecolor。脚注使用 `38;2;r;g;b` ANSI 序列。

### Unicode 图标缺失或错位

Unicode 和 Nerd Font 符号的显示效果因终端和字体而异。建议安装 Nerd Font，或在 `/zentui` 中切换到 ASCII 图标模式。

## 第三方许可证

本包包含以下开源项目的衍生作品：

- **pi-zentui**（Luka）— MIT 许可。脚注部分经改编后用于本包。  
  源码：https://github.com/lmilojevicc/pi-zentui
- **pi-shannon-statusline**（RealAlexandreAI）— MIT 许可。会话、模型、活动、MCP、配置统计和 Codex 订阅功能改编自该项目。  
  源码：https://github.com/RealAlexandreAI/pi-shannon-statusline
- **pi-codex-usage**（narumiruna）— MIT 许可。`extensions/hud/telemetry/codex-usage/` 下的 Codex 用量客户端衍生自该项目。  
  源码：https://github.com/narumiruna/pi-codex-usage

详见 [NOTICE](../NOTICE)。