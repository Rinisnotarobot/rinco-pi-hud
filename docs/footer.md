# Footer reference

## Default layout

When `footerFormat` is empty, the HUD displays four semantic groups:

```text
Project  · pi-sakura ·  main ·  24.18
Session  · gpt-5.3 · Thinking level: high · Turn 8
Activity · Agent idle · Skill 2/3 · MCP 2
Usage    · 35%/200k · ↑ 4.2k · ↓ 1.1k · $ 0.030
```

The MCP segment counts server entries in Pi's agent-directory `mcp.json` and the project's `.pi/mcp.json`. Same-name entries count once; disabled entries are included. This is a raw file-entry count: differently spelled names such as `my-server` and `my_server` remain separate, even though Pi may reject them as a namespace collision. Zero entries hide the segment. Counts refresh with the project state polling interval. This does not report connection state, validate individual server settings, or include servers registered dynamically by extensions. Missing, unreadable, malformed, or larger-than-1-MiB files contribute no entries. Legacy adapter footer statuses remain ordinary third-party statuses.

The category column is sized from visible text so every separator aligns. When a row exceeds the terminal width, complete status segments move to an indented continuation line. Only a single segment that is wider than the available content area is truncated. Third-party extension statuses appear on the Activity group in configured `left`, `middle`, then `right` order.

Control each default-layout row independently:

```text
/zentui row project enable
/zentui row session disable
/zentui row activity toggle
/zentui row usage toggle
```

The command shape is `/zentui row <project|session|activity|usage> <enable|disable|toggle>`. Values persist under `footerRows`; all four default to `true`. Row switches apply only to the default layout and do not alter a custom single-line `footerFormat`.

## Footer modes

- `/zentui footer hud`: enable the normal four groups or configured templates.
- `/zentui footer hidden`: show only allowed third-party statuses, no row when none exist.
- `/zentui footer native`: release ownership to Pi; saved HUD choices remain unchanged.

Hidden and HUD share the existing per-key `extensionStatuses` placement/color policy.
Native is Pi-owned and does not apply this policy. `/zentui layout`, `segments`, and
`extensions` open the corresponding settings tabs directly.

## Repository paths

`pathDisplay` defaults to `{ "mode": "basename", "depth": 0 }`.
Select `repository` in Layout → Path display, or set:

```json
{ "pathDisplay": { "mode": "repository", "depth": 2 } }
```

Repository root displays `.`; `/repo/packages/core/src` displays `…/core/src` at depth 2.
Zero depth is unlimited. Worktrees are supported. Until a root qualified for the current cwd
is available, missing/failed/unsafe roots fall back to the unlimited full path with home `~`
abbreviation; a stale root is never used to produce a relative path.

## Colors and theme switching

By default, `colorSources.starship` is `"theme"`. Built-in footer colors use semantic Pi theme tokens such as `accent`, `muted`, `success`, `warning`, and `error`; runtime labels also use the active theme. Switching themes, including automatic light/dark switching, recolors the footer without reloading the extension. This applies to both the default rows and custom templates.

To enable theme colors in an existing configuration, use **Footer colors → theme** in `/zentui`, or set:

```json
{
  "colorSources": {
    "starship": "theme"
  }
}
```

Select `"terminal"` to retain the original Sakura RGB defaults and Starship runtime colors. Changing the source does not write a palette into your configuration.

Entries you explicitly set under `colors` override the selected defaults. Semantic tokens (for example, `"cwd": "bold accent"`) follow the theme; hex colors, indexed colors, and explicit `fg:`/`bg:` styles remain fixed. Remove an override to restore the default for that segment. Third-party extension statuses in `original` color mode retain their own ANSI colors; use `zentui` color mode to recolor them with the HUD.

## Built-in status segments

| Key | Default | Group | Description |
| --- | --- | --- | --- |
| `cwd` | on | Project | Current working directory |
| `gitBranch` | on | Project | Branch name or `HEAD` when detached |
| `gitStatus` | on | Project | Conflicts, staged, modified, untracked, stash, ahead/behind |
| `gitState` | on | Project | Git operation state such as `MERGING` or `REBASING` |
| `gitCounts` | off | Project | Numeric counts embedded in ahead/behind and stash status |
| `gitCommit` | off | Project | Short commit hash and optional exact tag |
| `gitMetrics` | off | Project | Added/deleted lines from `git diff HEAD --numstat` |
| `runtime` | on | Project | Detected language/build system and tool version |
| `packageVersion` | off | Project | Project manifest version |
| `configCounts` | off | Project | Instruction files and installed Pi packages count |
| `os` | on | Project | OS icon/text per platform |
| `username` | off | Project | `user@hostname` |
| `sessionName` | on | Session | Current Pi session name |
| `model` | on | Session | Provider and model ID |
| `thinking` | on | Session | Thinking level when reasoning-capable |
| `turnCount` | on | Session | Current turn index |
| `sessionDuration` | off | Session | Current session duration |
| `runningTools` | on | Activity | Currently running native tools and elapsed time |
| `toolCounts` | on | Activity | Cumulative completed native-tool counts |
| `activeAgents` | on | Activity | Active primary agent runs |
| `agentIdle` | on | Activity | `Agent idle` when no primary agent run is active |
| `skills` | on | Activity | Active/available skills count, e.g. `Skill 1/3` |
| `mcp` | on | Activity | File-configured MCP servers, e.g. `MCP 2` |
| `context` | on | Usage | Context percentage, window size, and/or gauge |
| `inputTokens` | on | Usage | Cumulative input tokens |
| `outputTokens` | on | Usage | Cumulative output tokens |
| `cacheDetails` | on | Usage | Cache read/write tokens and latest hit rate |
| `cost` | on | Usage | Cumulative session cost |
| `codexUsage` | on | Usage | Codex weekly quota remaining |
| `time` | off | Usage | Current time `HH:MM` |

## Template syntax

Set a custom template:

```text
/zentui format "$os  $cwd(  $git_branch)$fill($context)(  $tokens)(  $cost)"
```

Clear it:

```text
/zentui format clear
```

### Variables

- `$name` or `${name}` — variable substitution
- `( ... )` — conditional group; hidden when all contained variables are empty
- `$fill` — layout partition marker (0 = left only, 1 = left/right, 2 = left/middle/right)
- `$sep` — styled ` | ` separator, does not cause a conditional group to show
- `$join_sep` — insert the styled separator only between populated sibling fields

For example, `$session_name$join_sep($git_branch $git_status)$join_sep$runtime` joins only
populated fields, with no orphan separator when an intervening field is missing. Each group
and top-level fill/wrap boundary has its own join scope. Do not pad `$join_sep` with spaces;
the separator already owns spacing. Templates without it retain their previous behavior.

### Variable list

| Variable | Content |
| --- | --- |
| `$cwd` | Current directory |
| `$git_branch` | Git icon and branch |
| `$git_status` | Git file status and ahead/behind |
| `$git_state` | Rebase, merge, etc. operation state |
| `$runtime` | Runtime icon and tool version |
| `$session_duration` | Session duration |
| `$username` | `user@hostname` |
| `$os` | OS icon/text |
| `$time` | Current time |
| `$context` | Context state |
| `$tokens` | Token summary |
| `$cost` | Session cost |
| `$package` | Package icon and project version |
| `$package_version` | Plain project version text |
| `$git_commit` | Short commit hash and optional tag |
| `$git_tag` | Exact matching tag only |
| `$git_metrics` | Added/deleted lines |
| `$git_added` | Added lines only |
| `$git_deleted` | Deleted lines only |
| `$session_name` | Session name |
| `$model` | Provider/Model |
| `$provider` | Provider ID only |
| `$model_id` | Model ID only |
| `$thinking` | Thinking level |
| `$turn` | Turn index |
| `$cache_read` | Cumulative cache read tokens |
| `$cache_write` | Cumulative cache write tokens |
| `$cache_hit` | Latest cache hit rate |
| `$codex_usage` | Codex subscription summary |
| `$instruction_files` | `AGENTS.md` + `CLAUDE.md` total |
| `$agents_files` | `AGENTS.md` count |
| `$claude_files` | `CLAUDE.md` count |
| `$skills` | Active/available skills, e.g. `Skill 1/3` |
| `$active_skills` | Active skills count only |
| `$extensions` | Installed Pi packages count |
| `$mcp` | File-configured MCP server count |
| `$tool_counts` | Native tool completion counts |
| `$running_tools` | Recently running tools |
| `$active_agents` | Active primary agent runs |
| `$subscription` | Optional `(sub)` when Pi reports OAuth subscription use (also kimi-coding) |
| `$auto_compaction` | Optional `(auto)` when public, trust-aware Pi settings report automatic compaction |
| `$pr_number` / `$pr_url` | Current open GitHub PR number / plain HTTPS URL, qualified against local HEAD |
| `$ci` | `CI passing`, `CI running`, `CI failed`, `CI no checks`, or `CI stale`; unavailable data is empty |
| `$token_rate` | Current interaction’s completed-call average, e.g. `48 tok/s avg` |
| `$sep` | Styled ` | ` |
| `$join_sep` | Conditional sibling separator |
| `$fill` | Layout marker, renders nothing |

### Aliases

```text
$directory → $cwd
$branch → $git_branch
$status → $git_status
$state → $git_state
$commit → $git_commit
$tag → $git_tag
$duration → $session_duration
$session → $session_name
$thinking_level → $thinking
$thinkingLevel → $thinking
$codex_quota → $codex_usage
$turn_count → $turn
$codex → $codex_usage
$tools → $tool_counts
$agents → $active_agents
$separator → $sep
```

## Opt-in compact templates

Set a separate narrow layout (used below 80 terminal columns):

```text
/zentui compact-format "$cwd$wrap(on $git_branch)$fill$context$wrap_sep$tokens$wrap_sep$extension_statuses"
```

`$wrap` starts an independently packable chunk with a space boundary.
`$wrap_sep` uses the configured default-layout separator only when chunks share a row.
The first top-level `$fill` divides left/right zones; right-hand chunks have priority in
template order and are right-aligned. Nested/additional fills do not create extra zones.
`$extension_statuses` expands allowed third-party statuses into separate chunks; the existing
`$extensions` still reports installed packages. Wide templates keep their existing status placements.

`compactFooterMaxLines` defaults to 2 (range 1–8), and omitted/truncated chunks use `…`.
Layout → Responsive compact controls `responsiveFooter`; an empty compact format is inert.
Use `/zentui compact-format clear` to return to the existing layout at every width.
Custom templates and wide templates are otherwise unchanged; arbitrary narrow layouts cannot keep every field.

## Custom extension values

Alias stable publisher keys in JSON, then explicitly reference them in templates:

```json
{
  "footerVariables": { "quota": "@scope/usage:quota" },
  "customValueColorMode": "original",
  "customValueColors": { "@scope/usage:quota": "bold success" },
  "footerFormat": "$cwd$fill($quota)($sep$cost)",
  "compactFooterFormat": "$cwd$fill($quota)$wrap_sep$context"
}
```

Aliases cannot shadow builtins, builtin aliases, structural/prototype names, except an explicit
`ci` alias may replace GitHub CI and suppress its query. At most 16 aliases are accepted.
Unpublished/empty values drop optional groups. Nothing is automatically appended to templates.

Original color mode preserves safe publisher SGR/HTTP(S) links; Zentui mode uses the current
HUD extension-status color. `customValueColors` overrides are keyed by publisher ID across
aliases: explicit styles replace publisher styling, `""` removes styling, and deleting a leaf
restores inheritance. These JSON-only per-value overrides are independent of `setStatus()` colors.
Layout → Custom value colors changes the shared mode.

Publish through Pi's shared event bus using Zentui protocol v1:

```typescript
const key = "@scope/usage:quota";
const capability = { supported: false, active: false, key };
pi.events.emit("zentui:variable-capability", capability);
if (capability.active) {
  pi.events.emit("zentui:variable", { key, text: "Quota 80%" });
  ctx.ui.setStatus(key, undefined); // remove only your own fallback
} else {
  ctx.ui.setStatus(key, "Quota 80%");
}
// Removal also works after demand becomes inactive:
pi.events.emit("zentui:variable", { key, text: undefined });
```

Capability probes receive `supported: true`, `version: 1`, and current `active` demand.
Probe again on each publisher refresh. Active means an owned, enabled current TUI Footer
references the alias in its wide or enabled compact template, not guaranteed visibility at every width.
Hidden/native/disabled/unowned consumers are inactive. Registry limits: 16 publisher keys,
64 UTF-16 units per key, 256 per raw text. Inactive/malformed/oversized updates are ignored;
empty text removes a value. Session replacement, shutdown or lost ownership/demand clears values.
Publishers must republish on reactivation and own their refresh/freshness resources.
A custom value is kept whole or omitted with template recomposition, never partially cropped.

## Status hyperlinks and live metadata

Third-party statuses in `original` mode preserve only SGR and HTTP(S) OSC 8 hyperlinks.
Unsafe protocols, title, clipboard, cursor controls and embedded line breaks are stripped;
links and styles are closed before adjacent content. Zentui mode strips publisher styling/links.

```text
/zentui format "$cwd( · PR #$pr_number)( · $ci)$fill($token_rate)"
```

PR/CI collection is opt-in through template references and requires installed/authenticated
`gh` plus an unambiguous `github.com` Git remote. No tools are installed or authenticated
automatically, and no fetch/write is performed. Repository/head changes invalidate results;
missing CLI/auth/PR, mismatched local/PR HEAD, detached HEAD or conflicting remotes yield empty values.
A 30-second cache is refreshed by normal session/project synchronization, not an extra polling timer.
A stale retained check snapshot shows `CI stale`. An explicit `ci` custom alias uses only publisher data.

`$token_rate` divides completed output by observed model-call duration in the current interaction.
It includes first-byte wait, excludes tools/gaps, and never estimates in-flight output speed.
It retains completed values until the next interaction; incomplete measurements show `— tok/s avg`.

Optional subscription and compaction markers use public Pi capabilities only and render empty
when unavailable. Automatic compaction reads respect public project trust and are refreshed during
normal Footer synchronization. They do not change Pi settings.

See [the integration record](upstream-zentui.md) for the pinned source and differences from full Zentui.

## Model quota

The status line automatically switches quota display based on model provider:

- **openai-codex**: Uses Pi Model Registry's Codex Auth to query ChatGPT usage endpoint; falls back to `codex app-server --listen stdio://`. Shows the remaining 5h window with its reset time plus the weekly limit percentage, e.g. `codex 60% 5h (14:30) 75% wk` (the reset stamp becomes `14:30 12 Feb` when the window rolls over on a later day).
- **token-switch**: Uses `TOKEN_SWITCH_API_KEY` environment variable to query billing subscription and usage. Shows available balance, e.g. `token-switch $750.00`.
- **deepseek**: Uses the credential Pi holds for the DeepSeek provider (the one `/login` stores for `deepseek`, or `DEEPSEEK_API_KEY`) to query `https://api.deepseek.com/user/balance`. Shows the total balance, preferring CNY when the account reports several currencies, e.g. `deepseek ¥110.00`. A balance query without a usable key reads as `balance error` in the footer.

All queries use a 15-second timeout, a 5-minute cache, and auto-refresh. Switching models via `/model` forces a refresh, and `/usage-refresh` refreshes whichever probe currently owns the row.