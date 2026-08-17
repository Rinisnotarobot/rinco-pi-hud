# Footer reference

## Default layout

When `footerFormat` is empty, the HUD displays four semantic groups:

```text
Project  · pi-sakura ·  main ·  24.18
Session  · gpt-5.3 · Thinking level: high · Turn 8
Activity · Agent idle · Skill 2/3 · MCP 2/2
Usage    · 35%/200k · ↑ 4.2k · ↓ 1.1k · $ 0.030
```

The category column is sized from visible text so every separator aligns. When a row exceeds the terminal width, complete status segments move to an indented continuation line. Only a single segment that is wider than the available content area is truncated. Third-party extension statuses appear on the Activity group in configured `left`, `middle`, then `right` order.

Control each default-layout row independently:

```text
/zentui row project enable
/zentui row session disable
/zentui row activity toggle
/zentui row usage toggle
```

The command shape is `/zentui row <project|session|activity|usage> <enable|disable|toggle>`. Values persist under `footerRows`; all four default to `true`. Row switches apply only to the default layout and do not alter a custom single-line `footerFormat`.

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
| `mcp` | on | Activity | MCP connected/total servers |
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
| `$mcp` | MCP connected/total |
| `$tool_counts` | Native tool completion counts |
| `$running_tools` | Recently running tools |
| `$active_agents` | Active primary agent runs |
| `$sep` | Styled ` | ` |
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
$turn_count → $turn
$codex → $codex_usage
$tools → $tool_counts
$agents → $active_agents
$separator → $sep
```

## Model quota

The status line automatically switches quota display based on model provider:

- **openai-codex**: Uses Pi Model Registry's Codex Auth to query ChatGPT usage endpoint; falls back to `codex app-server --listen stdio://`. Shows weekly limit percentage, e.g. `codex 75% wk`.
- **token-switch**: Uses `TOKEN_SWITCH_API_KEY` environment variable to query billing subscription and usage. Shows available balance, e.g. `token-switch $750.00`.

Both queries use 15-second timeout, 5-minute cache, and auto-refresh. Switching models via `/model` forces a refresh.