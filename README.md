<div align="center">

# Rinco Pi HUD

**A dynamic HUD footer for [Pi](https://github.com/earendil-works/pi).**

[![Pi package](https://img.shields.io/badge/Pi-package-F2A7C6?style=flat-square)](https://github.com/earendil-works/pi) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/) [![License](https://img.shields.io/badge/license-MIT-C7B8F5?style=flat-square)](LICENSE)

[Features](#features) · [Installation](#installation) · [Usage](#usage) · [Customization](#customization) · [Development](#development)

[简体中文](docs/README.zh-CN.md)

</div>

Rinco Pi HUD provides a rich, real-time status footer for Pi TUI sessions. It displays project state, Git metrics, runtime versions, session activity, model usage, token costs, and more — all in a responsive four-group or customizable single-line layout. Pi loads the TypeScript extension directly, so no build step is required (`tsconfig.json` sets `noEmit: true` and is used only for `npm run typecheck`).

## Features

- **Project state** — Working directory, Git branch, commit, tag, status, operation state, diff metrics, and runtime versions.
- **Session activity** — Model, provider, context usage, independently controlled input/output tokens, cache, session cost, turn count, and thinking level.
- **Tool and agent activity** — Independent controls for running tools, completed tool counts, active agents, idle state, skills, and MCP server status.
- **Model quota** — Automatic Codex weekly quota or Token Switch balance display by model provider.
- **Git awareness** — Branches, detached HEAD, tags, ahead/behind, stash, merge/rebase conflicts, and dirty state.
- **Runtime detection** — Node, Python, Go, Rust, Java, and 60+ other runtimes with package version parsing.
- **Configurable layout** — Responsive Project, Session, Activity, and Usage groups by default, or fully customizable single-line templates.
- **Granular status controls** — Toggle Git operation state, tool runtime/counts, active/idle agents, and input/output tokens separately from `/zentui`.
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
/zentui row project toggle
/zentui row session disable
/zentui row activity enable
/zentui row usage toggle
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
| [`extensions/hud/index.ts`](extensions/hud/index.ts) | Composition root for controllers, shared state, and UI installation |
| [`extensions/hud/config/`](extensions/hud/config/config.ts) | Configuration model, normalization, migration, and persistence |
| [`extensions/hud/footer/`](extensions/hud/footer/index.ts) | Footer rendering, semantic grouping, responsive layout, and template parsing |
| [`extensions/hud/segments/`](extensions/hud/segments/) | State collectors: Git, runtime, MCP, skills, projects, etc. |
| [`extensions/hud/telemetry/`](extensions/hud/telemetry/format.ts) | Usage formatting, token switch, and Codex subscription client |
| [`extensions/hud/session/`](extensions/hud/session/) | Pi event registration, session lifecycle, and live context overlay |
| [`extensions/hud/state/`](extensions/hud/state/) | Aggregated state, telemetry reducer, and project refresh controller |
| [`extensions/hud/commands/`](extensions/hud/commands/settings.ts) | `/zentui` settings UI and configuration controller |
| [`extensions/hud/ui/`](extensions/hud/ui/) | Icons and terminal style utilities |
| [`docs/footer.md`](docs/footer.md) | Complete footer configuration reference |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Local development, testing guidance, and pull request checklist |
| [`tests/`](tests/) | Vitest test suite (41 tests across 8 files) |

## Customization

### Layout

The default layout groups Project, Session, Activity, and Usage information. Long groups wrap at complete segment boundaries with aligned continuation lines. Set `footerFormat` to a template string for a single-line layout:

```text
/zentui format "$cwd( $git_branch)$fill($context)( $tokens)( $cost)"
```

Template variables use `$name` or `${name}` syntax. See the [footer reference](docs/footer.md) for the complete variable list.

### Segments

Open `/zentui`, then select **Built-in segments** to enable or disable individual statuses. Fine-grained controls include:

| Group | Independently controlled statuses |
| --- | --- |
| Project | Git status, Git operation state (`MERGING`, `REBASING`, etc.), commit, metrics, runtime, package, OS, and user |
| Session | Model, thinking level, turn count, and duration |
| Activity | Running tools, completed tool counts, active agents, `Agent idle`, skills, and MCP |
| Usage | Context, input tokens, output tokens, cache details/hit rate, cost, quota, and time |

Existing configs using the former aggregate `tokens`, `toolActivity`, or `agentActivity` switches are migrated automatically. The whole footer can still be controlled with `/zentui statusline enable|disable|toggle`.

In the default four-row layout, each semantic row can also be controlled directly:

```text
/zentui row <project|session|activity|usage> <enable|disable|toggle>
```

Row switches are persisted in `footerRows`. They do not affect a custom single-line `footerFormat`.

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