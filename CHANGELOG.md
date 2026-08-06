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
