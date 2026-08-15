# Contributing

Thank you for helping improve Rinco Pi HUD. This guide describes the local development, testing, and submission workflow.

## Development environment

Before you begin, install:

- Node.js 22.19 or later
- npm
- Pi, for validating the HUD footer in a real TUI

Clone the project and install its dependencies:

```bash
git clone https://github.com/Rinisnotarobot/rinco-pi-hud.git
cd rinco-pi-hud
npm install
```

Pi loads the TypeScript extension directly, so this project has no separate build step. Accordingly, `tsconfig.json` sets `noEmit: true` — it is used only for type checking (`npm run typecheck`), never for compiling output.

## Available commands

<!-- AUTO-GENERATED: package-scripts:start -->
<!-- Source: package.json#scripts. Do not edit manually. -->

| Command | Description |
| --- | --- |
| `npm test` | Run the complete Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode and retest when files change. |
| `npm run typecheck` | Run TypeScript type checking with `tsc --noEmit`. |
| `npm run pack:check` | Inspect the publishable package with `npm pack --dry-run` without publishing it. |

<!-- AUTO-GENERATED: package-scripts:end -->

## Testing

Before submitting a change, run:

```bash
npm test
npm run typecheck
npm run pack:check
```

Tests live in `tests/`:

- `zentui-status.test.ts` — Config counts, MCP status parsing, and extension status helpers.
- `codex-usage.test.ts` — Codex payload normalization and model-specific quota formatting.
- `footer-layout.test.ts` — Four-group categorized layout, segment wrapping, and narrow-width budget.
- `footer-groups.test.ts` — Semantic Project, Session, Activity, and Usage segment ordering.
- `footer-segment-controls.test.ts` — Independent status controls and legacy-config migration.
- `model-switch-statusline.test.ts` — Model switch statusline integration.
- `model-usage-refresh.test.ts` — Model usage refresh integration.
- `token-switch-usage.test.ts` — Token Switch balance formatting.

When adding tests:

1. Use Vitest's `describe`, `it`, and `expect` APIs.
2. Name files `*.test.ts` and place them in `tests/`.
3. Prefer user-observable behavior over internal implementation details.
4. Use Vitest fake timers for timer-dependent behavior and restore them after each test.
5. Keep tests isolated from one another and independent of a real terminal.

In addition to automated tests, validate HUD behavior in a real Pi TUI across different terminal widths, model switches, and project types.

## Code style

The project currently has no configured linter, formatter, or pre-commit hook. Follow the existing conventions:

- Use TypeScript ESM and explicit types.
- Use two-space indentation, double quotes, and semicolons.
- Keep extension lifecycle handling clear and release timers and UI state during `session_shutdown`.
- Do not edit content enclosed by `AUTO-GENERATED` markers manually; regenerate it from the source identified in the marker.

Do not add ignore rules, skip tests, or weaken types merely to bypass a check.

## Architecture notes

The HUD extension is organized into functional modules under `extensions/hud/`:

- **`index.ts`** — Composition root for controllers, shared state, and UI installation.
- **`commands/`** — `/zentui` presentation and its configuration-persistence controller.
- **`config/`** — Configuration model, normalization, and persistence.
- **`footer/`** — Footer rendering, semantic group construction, responsive layout, and templates.
- **`segments/`** — State collectors: Git, runtime, MCP, skills, projects, etc.
- **`session/`** — Pi event registration, lifecycle generations, and live-context throttling.
- **`state/`** — Shared footer state, telemetry reducer, and project-refresh controller.
- **`telemetry/`** — Usage formatting, token switch, and Codex subscription client.
- **`ui/`** — Icons and terminal style utilities.

Key conventions:

- Keep composition in `index.ts`, Pi event listeners in `session/event-handlers.ts`, and avoid file reads or subprocesses in `render()`.
- Async results check session generation before applying.
- Timers should be cleaned up on shutdown and `unref()` where possible.
- State collectors return explicit `ok` / `error` / `not found` semantics.
- Use `visibleWidth()` and `truncateToWidth()` for terminal width calculations.

## Releases

npm releases use GitHub Trusted Publishing through `.github/workflows/publish.yml`; no `NPM_TOKEN` repository secret is required. The workflow has narrowly scoped `id-token: write` permission, verifies the package, and publishes with provenance.

1. Update the same version in `package.json` and `package-lock.json`.
2. Commit and push the release changes to `main`.
3. Create an annotated tag that exactly matches the package version, for example `git tag -a v1.1.0 -m "v1.1.0"`.
4. Push the tag with `git push origin v1.1.0`.
5. Confirm the **Publish npm package** workflow succeeds and verify the version on npm.

The tag/version guard fails the workflow before publication if they do not match.

## Pull request checklist

Before opening a pull request, confirm that:

- [ ] The change has a focused scope and contains no unrelated files.
- [ ] New behavior or bug fixes include appropriate tests.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run pack:check` passes and the package contains the expected files.
- [ ] Affected HUD behavior was verified in a real Pi TUI.
- [ ] Related documentation was synchronized from its source of truth.
- [ ] No `node_modules/`, `.tgz` archives, or sensitive data were committed.