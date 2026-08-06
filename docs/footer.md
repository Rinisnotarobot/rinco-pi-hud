# Footer reference

## Default layout

When `footerFormat` is empty, the HUD displays a three-line categorized layout:

```text
⌂ project · pi-sakura ·  main ·  24.18
λ session · gpt-5.3 · high · ↺ 8 · ★ 2/3 · ⊕ 2/2
◉ usage · 35%/200k · ↑ 4.2k · ↓ 1.1k · $ 0.030
```

Each line independently computes visible width. Extension statuses are appended to the second line by placement (`left`, `middle`, `right`). When space is tight, lines are truncated at the end with an ellipsis.

## Built-in status segments

| Key | Default | Line | Description |
| --- | --- | --- | --- |
| `os` | on | 1 | OS icon/text per platform |
| `username` | off | 1 | `user@hostname` |
| `cwd` | on | 1 | Current working directory |
| `gitBranch` | on | 1 | Branch name or `HEAD` when detached |
| `gitStatus` | on | 1 | Conflicts, staged, modified, untracked, stash, ahead/behind |
| `gitCounts` | off | sub | Numeric counts for ahead/behind and stash |
| `gitCommit` | off | 1 | Short commit hash and optional exact tag |
| `gitMetrics` | off | 1 | Added/deleted lines from `git diff HEAD --numstat` |
| `packageVersion` | off | 1 | Project manifest version |
| `runtime` | on | 1 | Detected language/build system and tool version |
| `configCounts` | off | 1 | Instruction files and installed Pi packages count |
| `sessionName` | on | 2 | Current Pi session name |
| `model` | on | 2 | Provider and model ID |
| `thinking` | on | 2 | Thinking level when reasoning-capable |
| `turnCount` | on | 2 | Current turn index |
| `skills` | on | 2 | Active/available skills count, e.g. `★ 1/3` |
| `mcp` | on | 2 | MCP connected/total servers |
| `toolActivity` | on | 2 | Native tool completion count or recent running status |
| `agentActivity` | on | 2 | Active primary agent runs |
| `context` | on | 3 | Context percentage, window size, and/or gauge |
| `tokens` | on | 3 | Input, output, cache token summary |
| `cacheDetails` | on | 3 | Cumulative cache read/write tokens |
| `cost` | on | 3 | Cumulative session cost |
| `codexUsage` | on | 3 | Codex weekly quota remaining |
| `sessionDuration` | off | 3 | Current session duration |
| `time` | off | 3 | Current time `HH:MM` |

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
| `$skills` | Active/available skills, e.g. `★ 1/3` |
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