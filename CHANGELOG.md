# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
