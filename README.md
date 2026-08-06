<div align="center">

# Rinco Pi HUD

**A dynamic HUD footer for [Pi](https://github.com/earendil-works/pi).**

[![Pi package](https://img.shields.io/badge/Pi-package-F2A7C6?style=flat-square)](https://github.com/earendil-works/pi) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/) [![License](https://img.shields.io/badge/license-MIT-C7B8F5?style=flat-square)](LICENSE)

[Features](#features) · [Installation](#installation) · [Usage](#usage) · [Customization](#customization) · [Development](#development)

[简体中文](docs/README.zh-CN.md)

</div>

Rinco Pi HUD provides a rich, real-time status footer for Pi TUI sessions. It displays project state, Git metrics, runtime versions, session activity, model usage, token costs, and more — all in a configurable three-line or single-line layout. Pi loads the TypeScript extension directly, so no build step is required (`tsconfig.json` sets `noEmit: true` and is used only for `npm run typecheck`).

## Features

- **Project state** — Working directory, Git branch, commit, tag, status, diff metrics, and runtime versions.
- **Session activity** — Model, provider, context usage, tokens, cache, session cost, turn count, and thinking level.
- **Tool and agent activity** — Native tool completion counts, running tools, active agent runs, skills, and MCP server status.
- **Model quota** — Automatic Codex weekly quota or Token Switch balance display by model provider.
- **Git awareness** — Branches, detached HEAD, tags, ahead/behind, stash, merge/rebase conflicts, and dirty state.
- **Runtime detection** — Node, Python, Go, Rust, Java, and 60+ other runtimes with package version parsing.
- **Configurable layout** — Three-line categorized layout by default, or fully customizable single-line templates.
- **Extension statuses** — Reads third-party extension statuses and places them by configurable position and color mode.
- **Safe fallback** — Graceful timeout and error handling; no stale data after session shutdown.

## Installation

### Install from npm (recommended)

```bash
pi install npm:rinco-pi-hud
```

The published package is available on [npm](https://www.npmjs.com/package/rinco-pi-hud).

### Install from GitHub

```bash
pi install git:github.com/Rinisnotarobot/rinco-pi-hud
```

### Install from a local checkout

```bash
git clone https://github.com/Rinisnotarobot/rinco-pi-hud.git
cd rinco-pi-hud
pi install "$PWD"
```

> [!IMPORTANT]
> Pi extensions run with your user permissions. Review the source before installing any third-party extension.

## Usage

Restart Pi after installation, or run:

```text
/reload
```

The HUD footer is enabled by default. Run `/zentui` to open the interactive settings UI.

### Common commands

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
> For the best result, use a Truecolor terminal and a Nerd Font. The footer uses Unicode glyphs that render best with proper font support.

## Project contents

| Path | Purpose |
| --- | --- |
| [`extensions/hud/index.ts`](extensions/hud/index.ts) | Extension lifecycle and side-effect orchestration |
| [`extensions/hud/config/`](extensions/hud/config/config.ts) | Configuration model, normalization, and persistence |
| [`extensions/hud/footer/`](extensions/hud/footer/index.ts) | Footer rendering, categorized layout, and template parsing |
| [`extensions/hud/segments/`](extensions/hud/segments/) | State collectors: Git, runtime, MCP, skills, projects, etc. |
| [`extensions/hud/telemetry/`](extensions/hud/telemetry/format.ts) | Usage formatting, token switch, and Codex subscription client |
| [`extensions/hud/session/`](extensions/hud/session/) | Session lifecycle, context, and live context overlay |
| [`extensions/hud/state/`](extensions/hud/state/) | Aggregated state, telemetry, and project refresh |
| [`extensions/hud/commands/`](extensions/hud/commands/settings.ts) | `/zentui` command and interactive TUI settings |
| [`extensions/hud/ui/`](extensions/hud/ui/) | Icons and terminal style utilities |
| [`docs/footer.md`](docs/footer.md) | Complete footer configuration reference |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Local development, testing guidance, and pull request checklist |
| [`tests/`](tests/) | Vitest test suite (34+ tests across 6 files) |

## Customization

### Layout

The default three-line layout groups project, session, and usage information. Set `footerFormat` to a template string for a single-line layout:

```text
/zentui format "$cwd( $git_branch)$fill($context)( $tokens)( $cost)"
```

Template variables use `$name` or `${name}` syntax. See the [footer reference](docs/footer.md) for the complete variable list.

### Segments

Enable or disable individual status segments via `/zentui`:

```text
/zentui statusline enable
/zentui statusline disable
/zentui statusline toggle
```

### Extension statuses

Third-party extensions publish statuses that the HUD footer can display. Configure placement (`left`, `middle`, `right`, `off`) and color mode (`zentui`, `original`) for each extension status key.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 22.19 or later
- [Pi](https://github.com/earendil-works/pi)

Install development dependencies:

```bash
npm install
```

### Available commands

<!-- AUTO-GENERATED: package-scripts:start -->
<!-- Source: package.json#scripts. Do not edit manually. -->

| Command | Description |
| --- | --- |
| `npm test` | Run the complete Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode and retest when files change. |
| `npm run typecheck` | Run TypeScript type checking with `tsc --noEmit`. |
| `npm run pack:check` | Inspect the publishable package with `npm pack --dry-run` without publishing it. |

<!-- AUTO-GENERATED: package-scripts:end -->

Run the test suite:

```bash
npm test
```

Check types:

```bash
npm run typecheck
```

Verify tests and package contents:

```bash
npm test
npm run typecheck
npm run pack:check
```

Vitest covers footer layout, telemetry, codex usage, token switch, config counts, and MCP status parsing. Pi loads the TypeScript source directly, so this project has no separate build command.

## Troubleshooting

### The footer does not appear

1. Confirm that Pi is running in TUI mode rather than headless, JSON, or print mode.
2. Run `/reload` or restart Pi.
3. Run `pi list` to confirm that the package is installed.

### The footer layout looks wrong

The footer auto-detects terminal width and truncates content. In narrow terminals, some segments may be clipped. Adjust the layout by setting a custom `footerFormat` template, or disable low-priority segments in `/zentui`.

### Colors look incorrect

Make sure your terminal supports Truecolor. The footer emits `38;2;r;g;b` ANSI sequences.

### Unicode icons are missing or misaligned

Unicode and Nerd Font glyphs vary between terminals and fonts. Install a Nerd Font, or switch to ASCII icon mode via `/zentui`.

## Third-party licenses

This package incorporates work from the following open-source projects:

- **pi-zentui** by Luka — MIT licensed. The Footer portion was adapted for this package.  
  Source: https://github.com/lmilojevicc/pi-zentui
- **pi-shannon-statusline** by RealAlexandreAI — MIT licensed. Session, model, activity, MCP, configuration-count, and Codex subscription capabilities were adapted.  
  Source: https://github.com/RealAlexandreAI/pi-shannon-statusline
- **pi-codex-usage** by narumiruna — MIT licensed. The Codex usage client under `extensions/hud/telemetry/codex-usage/` derives from this project.  
  Source: https://github.com/narumiruna/pi-codex-usage

See [NOTICE](NOTICE) for details.