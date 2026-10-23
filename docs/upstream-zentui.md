# Zentui Footer integration

## Snapshot

- Source: https://github.com/lmilojevicc/pi-zentui
- Package version: **0.32.0**
- Commit: `9e8e798cfcce26cee9e1def4daf3668616482610`
- License: MIT; original copyright and full terms are in
  [extensions/hud/ZENTUI-LICENSE](../extensions/hud/ZENTUI-LICENSE).

This is a selective source adaptation, **not a dependency update or a complete Zentui fork**.
No extra runtime dependency is installed. Pi 1.3–1.x remains supported.

## Adapted capabilities

| Upstream capability | HUD integration |
| --- | --- |
| Repository-relative cwd | `pathDisplay.mode: "repository"`, worktree-aware root, depth after relative conversion, unlimited full-path fallback when no current safe root exists |
| Conditional joining | `$join_sep` in local group/fill/wrap scopes, ignoring empty and control-only fields |
| Compact templates | `compactFooterFormat`, `$wrap`, `$wrap_sep`, first `$fill` left/right alignment, 1–8 line cap |
| Extension statuses in compact layouts | `$extension_statuses`; existing `$extensions` still means installed-package count |
| Custom publisher values | Protocol v1 events, `footerVariables` aliases, demand/ownership/session gating, atomic fitting |
| Custom value colors | `customValueColorMode` and JSON-only publisher-keyed `customValueColors` overrides |
| Original status hyperlinks | Preserve safe HTTP(S) OSC 8 and SGR only; close links/styles before neighboring content |
| Passive live metadata | Template-opt-in `$pr_number`, `$pr_url`, `$ci`, `$token_rate` |
| Atomic telemetry | `$cache_read` and `$cache_write` already existed; add optional `$subscription` / `$auto_compaction` |
| Thinking variable | `$thinkingLevel` aliases the existing `$thinking` |
| Status-only / native mode | `/hud footer hidden` keeps permitted statuses; `native` releases Footer ownership |
| Direct settings access | `/hud layout`, `segments`, `extensions` |

## Deliberate differences

- Four semantic HUD groups remain the default. Compact rendering is **opt-in**: an empty compact
  format never replaces the default layout. A configured compact format is selected below
  **80 terminal columns** when `responsiveFooter` is enabled.
- Keep the independent, flat `~/.pi/agent/rinco-pi-hud.json` schema. Upstream
  `components.footer.styles.starship` objects are not automatically imported.
- Keep existing theme defaults, legacy configuration migration, and all HUD counters, skills,
  MCP runtime tool counts, model/provider labels, live context and usage totals.
- Keep the existing Codex quota client and DeepSeek / Token Switch balance probes.
  `$codex_quota` is a compatibility alias for `$codex_usage`, not a new collector.
  Upstream's separate official-OpenAI response-header quota collector is not installed.
- Status placement/color policy is shared between HUD and Hidden modes; native mode belongs to
  Pi and is not decorated to enforce HUD visibility settings.
- GitHub supports unambiguous `github.com` fetch remotes only. It uses existing `git` and `gh`
  executables, never installs/authenticates tools, and does not fetch or mutate the repository.
  Private GitHub Enterprise hosts, detached HEAD, conflicting remotes, missing auth/CLI/PR,
  or a PR head that differs from local HEAD render empty.
- No editors, user-message styling, working-line protocol, tool display, experimental thinking,
  selector patches, OMP data/adapter, or full upstream component/preset settings are installed.
  Avoid installing full Zentui alongside this package unless exactly one owns Footer.

## Refresh and safety

PR/CI demand comes only from enabled HUD templates (including an enabled compact format),
not from defaults or merely configured aliases. An explicit custom `ci` alias suppresses
GitHub CI demand. Queries are read-only, bounded, negative-cached for 30 seconds, and
qualified against repository/worktree, branch, remotes and HEAD before and after lookup.
Current UI sync and project refresh ticks drive collection; there is no extra GitHub polling timer.
Expired retained CI reads `CI stale`. Stop, replacement, cwd changes and lost demand discard
in-flight results. A successful unchanged snapshot reuses cached GitHub data.

Token rate is final output divided by observed completed model-call duration in the current
agent interaction; first-byte wait is included, tools/inter-call gaps are excluded. It is not a
live streaming speed estimate. Completed values remain until the next interaction; missing or
incomplete measurement reads `— tok/s avg`.

Publishers retain responsibility for their values' freshness and fallback statuses.
No publication data is saved to disk. Values that cannot fit whole are removed and the template
is recomposed, never shown as a partial quota. The protocol bounds remain 16 keys, 64 UTF-16
units per key and 256 units per raw value.

## Future updates

1. Pin and record the new upstream SHA before comparing source.
2. Compare Footer/template, runtime/git, status sanitization, custom-value protocol and telemetry
   modules, rather than replacing upstream's composition root.
3. Preserve this project's configuration file, four-group layout, provider probes and Pi compatibility.
4. Add tests for both new behavior and old layouts, including narrow widths, ANSI/OSC,
   transient errors, stale responses, disabled demand and session/ownership cleanup.
5. Run `npm run verify` and `npm run pack:check`; separately smoke-test a real Pi TUI.
