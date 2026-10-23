# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [1.6.1] - 2026-10-23

### Changed

- Move the current-time segment from Usage to Session, immediately after duration, and tie its refresh timer to Session visibility.
- Remove Activity's Agent run/idle indicators, their segment controls, and the `$active_agents` / `$agents` template variables. Existing Agent status configuration keys are ignored.
- Count MCP servers from Pi's public runtime tool registry instead of reading `mcp.json`. Count namespaces with non-hidden tools, including dynamic registrations and codemode/deferred tools; this is not a connection-health count.
- Rename the HUD settings command from `/zentui` to `/hud`, without a legacy alias, so the original Zentui can use `/zentui` independently. Existing HUD configuration and publisher protocols are unchanged.

## [1.6.0] - 2026-10-23

### Added

- Adapt Footer/HUD features from pi-zentui 0.32.0 (upstream snapshot
  `9e8e798cfcce26cee9e1def4daf3668616482610`), without taking over other UI components.
- Repository-relative paths with worktree support and safe full-path fallback.
- Conditional `$join_sep` joins and opt-in compact templates with wrapping, right alignment,
  bounded lines, and independently packed `$extension_statuses`.
- Protocol-v1 `zentui:variable` publications, local template aliases, individual color overrides,
  whole-value fitting, and session/ownership-scoped demand.
- Safe HTTP(S) status hyperlinks in original color mode.
- Demand-driven `$pr_number`, `$pr_url`, `$ci`, completed-call-average `$token_rate`,
  and optional `$subscription` / `$auto_compaction` markers.
- Hidden status-only mode, native-footer restoration, compact layout controls, and direct settings routes.

### Compatibility

- Keep four HUD groups as the default, the independent `rinco-pi-hud.json` configuration,
  Pi 1.3–1.x support, theme following, and existing provider usage/balance clients.
- Keep `$extensions` as the installed-package count; use `$extension_statuses` for compact statuses.
- No editor, message, working-line, tool-display, experimental thinking, or OMP integration is installed.

## [1.5.0] - 2026-10-23

### Changed

- Follow the active Pi theme by default, including live and automatic light/dark theme changes.
- Use semantic theme colors for built-in HUD segments and RGB/indexed runtime labels.
- Preserve the original Sakura palette in explicit terminal mode and retain user color overrides.

## [1.4.0] - 2026-10-17

### Changed

- Require Pi 1.3.0–1.x and pin development Pi packages to 1.3.0.
- Encode explicit RGB styles through Pi's public theme API for truecolor/256-color support.
- Cache immutable footer-format ASTs and theme-independent style syntax with bounded storage.
- Refresh clocks only when referenced by the visible layout; idle tool lists no longer tick.

### Fixed

- Handle user/custom `before_agent_start` events and nullable provider auth headers.
- Include tool, standalone, compaction, and branch-summary usage in session token/cost totals.
- Restore successful nested skill reads from persisted codemode tool results.
- Accept current Pi foreground theme tokens, including `thinkingMax` and scrollbar/search colors.
- Prevent stopped/restarted project refreshes from committing stale results.
- Expire runtime-version caches and retry transient missing-version results.
- Update the locked `source-map-js` dependency to resolve its indexed-source-map DoS advisory.

## [1.3.1]

### Fixed

- **MCP segment**: Read server entries from Pi's agent-directory `mcp.json` and project
  `.pi/mcp.json` instead of parsing the old adapter's footer status. Displays `MCP N`, includes
  disabled entries, and counts same-name entries once. This is a file configuration count, not a
  connection count; dynamically registered extension servers are not included. Legacy adapter
  statuses remain ordinary third-party statuses.

## [1.3.0]

### Added

- **Usage row**: A model on the DeepSeek official provider (`deepseek`) now shows the account balance in
  the footer, e.g. `deepseek ¥110.00`. The probe reads the Pi credential for the provider, so a key added
  through `/login` or `DEEPSEEK_API_KEY` works without extra setup, and it hits
  `https://api.deepseek.com/user/balance`. Accounts reporting both CNY and USD read out CNY. Like the
  Token Switch balance, it caches for 5 minutes, auto-refreshes, and is what `/usage-refresh` refreshes
  while a DeepSeek model is active; `/codex-status` leaves the row alone on those models.

### Fixed

- **`tsconfig.json`**: Added `"noEmit": true` and removed the unused `declaration`/`sourceMap`
  options. TypeScript requires `allowImportingTsExtensions` to be paired with one of `noEmit`,
  `emitDeclarationOnly`, or `rewriteRelativeImportExtensions`; this project never emits build
  output (Pi loads the `.ts` extension source directly), so `noEmit: true` is the correct match
  and fixes the compiler error:

  > Option 'allowImportingTsExtensions' can only be used when either 'noEmit' or
  > 'emitDeclarationOnly' is set, or 'rewriteRelativeImportExtensions' is enabled.

  Verified with `npm run typecheck` (clean).

### Docs

- **README redesign**: Both READMEs now open with the footer itself instead of a feature list. The hero
  board and a width-comparison board under `assets/readme/` are generated from a real render —
  `assets/readme/source/capture-footer.mts` drives the extension's own `installFooter` path over this
  repository's state and a real Pi session transcript, and `build-assets.mts` converts the ANSI rows to
  SVG. The feature bullets and the segment table collapsed into one row/segment table, commands moved
  into a table up front, and the configuration detail stays in `docs/footer.md`. `package.json` now
  publishes `assets/readme/*.svg` so npm renders the images too.

- Noted the `noEmit: true` / no-build-step relationship in `README.md`,
  `docs/README.zh-CN.md`, and `docs/CONTRIBUTING.md`.

## [1.2.0]

### Added

- **Usage row**: The Codex reading now shows the 5h rolling window with its reset time next to the
  weekly limit, e.g. `codex 60% 5h (14:30) 75% wk`. The 5h window is the one that actually
  throttles a session, so the weekly percentage alone hid the number that mattered. The reset
  stamp reads `14:30` for the same day and `14:30 12 Feb` when the window rolls over on a later
  day. Each window now falls back to the account-wide snapshot independently, and a report with
  no usable window reads `codex limits unavailable` instead of claiming only the weekly limit is
  missing.
