# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
