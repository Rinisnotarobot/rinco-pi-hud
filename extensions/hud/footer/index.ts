import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { PolishedTuiConfig, SeparatorStyle } from "../config/config.js";
import { FOOTER_FORMAT_ALIASES } from "../config/config.js";
import {
	collectExtensionStatusSegments,
	type ExtensionStatusSegment,
} from "../segments/extension-status.js";
import { composeCategorizedFooterRows, composeFooterContent } from "./layout.js";
import { parseFooterFormat, renderFormatSplit, stripOrphanSeparators } from "./format.js";
import { buildCategorizedFooterGroups } from "./groups.js";
import {
	buildGitStatusLabels,
	buildTelemetryLabels,
	safeStatusText,
	sanitizeFooterInputs,
} from "./render-labels.js";
import {
	buildContextDisplayLabel,
	buildSessionDurationLabel,
	contextColorTier,
	formatCwdLabel,
	formatGitBranchText,
	formatGitCommitSegment,
	formatGitMetricsSegment,
	formatOsLabel,
	formatPackageVersionSegment,
	formatRuntimeSegment,
	formatTimeLabel,
	formatUsernameHostLabel,
} from "../telemetry/format.js";
import { resolveRuntimeSymbol } from "../ui/icons.js";
import type { LiveContextOverride } from "../session/live-context.js";
import { parseMcpStatus } from "../segments/mcp-status.js";
import type { FooterState } from "../state/index.js";
import { renderStyleForSource } from "../ui/style.js";

const separatorText: Record<SeparatorStyle, string> = {
	pipe: " | ",
	dot: " · ",
	chevron: " › ",
	none: " ",
};

export function installFooter(
	ctx: ExtensionContext,
	state: FooterState,
	getConfig: () => PolishedTuiConfig,
	hooks: {
		setRequestRender: (fn: (() => void) | undefined) => void;
		scheduleProjectRefresh: (ctx: ExtensionContext) => void;
		setExtensionStatusesGetter?: (fn: (() => ReadonlyMap<string, string>) | undefined) => void;
		getLiveContext?: () => LiveContextOverride | undefined;
	},
): void {
	ctx.ui.setFooter((tui, theme, footerData) => {
		hooks.setRequestRender(() => tui.requestRender());
		hooks.setExtensionStatusesGetter?.(() => footerData.getExtensionStatuses());
		const unsubscribeBranch = footerData.onBranchChange(() => {
			hooks.scheduleProjectRefresh(ctx);
			tui.requestRender();
		});

		return {
			dispose: () => {
				unsubscribeBranch();
				hooks.setRequestRender(undefined);
				hooks.setExtensionStatusesGetter?.(undefined);
			},
			invalidate() {},
			render(width: number): string[] {
				if (width <= 0) return [""];
				const config = getConfig();
				const colorSource = config.colorSources.starship;
				const iconMode = config.icons.mode;
				const rawExtensionStatuses = footerData.getExtensionStatuses();
				const mcpStatus = parseMcpStatus(rawExtensionStatuses.get("mcp"));
				const { safeCwd, safeRuntime, safePackageVersion, safeCommit } = sanitizeFooterInputs(
					ctx,
					state,
				);
				const separator = renderStyleForSource(
					theme,
					colorSource,
					config.colors.separator,
					separatorText[config.separator],
				);
				const innerWidth = Math.max(1, width - 2);
				const cwdLabel = renderStyleForSource(
					theme,
					colorSource,
					config.colors.cwd,
					formatCwdLabel(safeCwd, config.icons.cwd, {
						mode: config.pathDisplay.mode,
						depth: config.pathDisplay.depth,
					}),
				);
				const cwdValueLabel = renderStyleForSource(
					theme,
					colorSource,
					config.colors.cwd,
					formatCwdLabel(safeCwd, "", {
						mode: config.pathDisplay.mode,
						depth: config.pathDisplay.depth,
					}),
				);
				const branch = safeStatusText(state.branch, 256) || undefined;
				const branchText = branch
					? formatGitBranchText(branch, config.gitBranch.maxLength)
					: undefined;
				const contextUsage = ctx.getContextUsage();
				const liveContext = hooks.getLiveContext?.();
				const contextWindow = ctx.model?.contextWindow ?? contextUsage?.contextWindow;
				const useLiveContext =
					liveContext !== undefined && contextWindow !== undefined && contextWindow > 0;
				const contextPercent = useLiveContext
					? (liveContext.tokens / contextWindow) * 100
					: contextUsage?.percent;
				const contextLabel = buildContextDisplayLabel({
					percent: contextPercent,
					contextWindow,
					style: config.contextStyle,
					asciiGauge: iconMode === "ascii",
				});
				const tier = contextColorTier(contextPercent, config.contextThresholds);
				const contextColor =
					tier === "error"
						? config.colors.contextError
						: tier === "warning"
							? config.colors.contextWarning
							: config.colors.contextNormal;
				const { gitColor, gitIcon, statusBlock, gitStateBlock } = buildGitStatusLabels(
					state,
					config,
					theme,
					colorSource,
				);
				const {
					projectCategoryLabel,
					sessionCategoryLabel,
					activityCategoryLabel,
					usageCategoryLabel,
					sessionNameLabel,
					modelValueLabel,
					modelStatusLabel,
					providerId,
					modelId,
					thinkingLabel,
					turnLabel,
					cacheReadLabel,
					cacheWriteLabel,
					cacheHitLabel,
					cacheDetailsLabel,
					codexUsageLabel,
					instructionFilesLabel,
					agentsFilesLabel,
					claudeFilesLabel,
					skillsLabel,
					activeSkillsLabel,
					extensionsLabel,
					configCountsLabel,
					mcpLabel,
					toolCountsLabel,
					runningToolsLabel,
					activeAgentsLabel,
				} = buildTelemetryLabels(ctx, state, config, theme, colorSource, mcpStatus);
				const renderVariable = (name: string): string => {
					const canonical = FOOTER_FORMAT_ALIASES[name] ?? name;
					switch (canonical) {
						case "cwd":
							return cwdLabel;
						case "git_branch":
							return branchText
								? gitIcon
									? `${gitIcon} ${gitColor(branchText)}`
									: gitColor(branchText)
								: "";
						case "git_status":
							return statusBlock;
						case "git_state":
							return gitStateBlock;
						case "runtime": {
							if (!safeRuntime) return "";
							const symbol = resolveRuntimeSymbol(
								safeRuntime.name,
								safeRuntime.symbol,
								iconMode,
							);
							const label = safeRuntime.version ? `${symbol} ${safeRuntime.version}` : symbol;
							return renderStyleForSource(theme, colorSource, safeRuntime.style, label);
						}
						case "session_duration":
							return state.sessionStartEpoch
								? renderStyleForSource(
										theme,
										colorSource,
										config.colors.sessionDuration,
										buildSessionDurationLabel(state.sessionStartEpoch),
									)
								: "";
						case "username":
							return renderStyleForSource(
								theme,
								colorSource,
								config.colors.username,
								formatUsernameHostLabel(config.icons.username),
							);
						case "os":
							return renderStyleForSource(
								theme,
								colorSource,
								config.colors.os,
								formatOsLabel(config.icons.os, iconMode),
							);
						case "time":
							return renderStyleForSource(
								theme,
								colorSource,
								config.colors.time,
								formatTimeLabel(config.icons.time),
							);
						case "context":
							return renderStyleForSource(theme, colorSource, contextColor, contextLabel);
						case "tokens":
							return renderStyleForSource(
								theme,
								colorSource,
								config.colors.tokens,
								state.tokenLabel,
							);
						case "cost":
							return renderStyleForSource(theme, colorSource, config.colors.cost, state.costLabel);
						case "package":
							return formatPackageVersionSegment(
								theme,
								safePackageVersion,
								colorSource,
								iconMode,
								config.icons.package,
								config.colors.packageVersion,
							);
						case "package_version":
							return safePackageVersion?.version
								? renderStyleForSource(
										theme,
										colorSource,
										config.colors.packageVersion,
										safePackageVersion.version,
									)
								: "";
						case "sep":
							return renderStyleForSource(theme, colorSource, config.colors.separator, " | ");
						case "git_commit":
							return formatGitCommitSegment(
								theme,
								safeCommit,
								config.gitCommit,
								colorSource,
								config.colors.gitCommit,
							);
						case "git_tag":
							return config.gitCommit.showTag && safeCommit?.tag
								? renderStyleForSource(
										theme,
										colorSource,
										config.colors.gitCommit,
										safeCommit.tag,
									)
								: "";
						case "git_metrics":
							return formatGitMetricsSegment(
								theme,
								state.metrics,
								config.gitMetrics,
								colorSource,
								config.colors.gitMetricsAdded,
								config.colors.gitMetricsDeleted,
							);
						case "git_added":
							return state.metrics
								? renderStyleForSource(
										theme,
										colorSource,
										config.colors.gitMetricsAdded,
										`+ ${state.metrics.added}`,
									)
								: "";
						case "git_deleted":
							return state.metrics
								? renderStyleForSource(
										theme,
										colorSource,
										config.colors.gitMetricsDeleted,
										`− ${state.metrics.deleted}`,
									)
								: "";
						case "session_name":
							return sessionNameLabel;
						case "model":
							return modelStatusLabel;
						case "provider":
							return providerId
								? renderStyleForSource(theme, colorSource, config.colors.runtimePrefix, providerId)
								: "";
						case "model_id":
							return modelId
								? renderStyleForSource(theme, colorSource, config.colors.runtimePrefix, modelId)
								: "";
						case "thinking":
							return thinkingLabel;
						case "turn":
							return turnLabel;
						case "cache_read":
							return cacheReadLabel;
						case "cache_write":
							return cacheWriteLabel;
						case "cache_hit":
							return cacheHitLabel;
						case "codex_usage":
							return codexUsageLabel;
						case "instruction_files":
							return instructionFilesLabel;
						case "agents_files":
							return agentsFilesLabel;
						case "claude_files":
							return claudeFilesLabel;
						case "skills":
							return skillsLabel;
						case "active_skills":
							return activeSkillsLabel;
						case "extensions":
							return extensionsLabel;
						case "mcp":
							return mcpLabel;
						case "tool_counts":
							return toolCountsLabel;
						case "running_tools":
							return runningToolsLabel;
						case "active_agents":
							return activeAgentsLabel;
						default:
							return "";
					}
				};
				const branchParts: string[] = [];
				if (config.footerSegments.gitBranch) {
					if (branchText) {
						branchParts.push("on", gitIcon, gitColor(branchText));
					} else if (safeCommit?.detached) {
						// `HEAD` uses git-branch style; `(hash)` uses git-commit style
						// (bold green) per Starship `git_commit` format.
						branchParts.push("on", gitIcon, gitColor("HEAD"));
						if (config.footerSegments.gitCommit && safeCommit.oid) {
							const shortHash = safeCommit.oid.slice(0, config.gitCommit.hashLength);
							const tag = config.gitCommit.showTag && safeCommit.tag ? safeCommit.tag : "";
							const inner = [shortHash, tag].filter(Boolean).join(" ");
							branchParts.push(
								renderStyleForSource(theme, colorSource, config.colors.gitCommit, `(${inner})`),
							);
						}
					}
				}
				const gitStatusParts = config.footerSegments.gitStatus && statusBlock ? [statusBlock] : [];
				const showGitState = config.footerSegments.gitBranch || config.footerSegments.gitStatus;
				const gitStateParts = showGitState && gitStateBlock ? [gitStateBlock] : [];
				const branchLabel = [...branchParts, ...gitStatusParts, ...gitStateParts]
					.filter(Boolean)
					.join(" ");
				const runtimeLabel = config.footerSegments.runtime
					? formatRuntimeSegment(
							theme,
							safeRuntime,
							config.colors.runtimePrefix,
							colorSource,
							iconMode,
						)
					: "";
				const packageVersionLabel = config.footerSegments.packageVersion
					? formatPackageVersionSegment(
							theme,
							safePackageVersion,
							colorSource,
							iconMode,
							config.icons.package,
							config.colors.packageVersion,
						)
					: "";
				// Skip standalone gitCommit when hash is already folded into the
				// branch display on detached HEAD.
				const hashFoldedIntoBranch = safeCommit?.detached && config.footerSegments.gitBranch;
				const gitCommitLabel =
					config.footerSegments.gitCommit && !hashFoldedIntoBranch
						? formatGitCommitSegment(
								theme,
								safeCommit,
								config.gitCommit,
								colorSource,
								config.colors.gitCommit,
							)
						: "";
				const gitMetricsLabel = config.footerSegments.gitMetrics
					? formatGitMetricsSegment(
							theme,
							state.metrics,
							config.gitMetrics,
							colorSource,
							config.colors.gitMetricsAdded,
							config.colors.gitMetricsDeleted,
						)
					: "";

				const sessionDurationSegment = (() => {
					if (!config.footerSegments.sessionDuration || !state.sessionStartEpoch) return "";
					const timeLabel = buildSessionDurationLabel(state.sessionStartEpoch);
					const prefix = renderStyleForSource(theme, colorSource, "", "Duration");
					const time = renderStyleForSource(
						theme,
						colorSource,
						config.colors.sessionDuration,
						timeLabel,
					);
					return `${prefix} ${time}`;
				})();
				const usernameSegment = config.footerSegments.username
					? renderStyleForSource(
							theme,
							colorSource,
							config.colors.username,
							formatUsernameHostLabel(config.icons.username),
						)
					: "";
				const osSegment = config.footerSegments.os
					? renderStyleForSource(
							theme,
							colorSource,
							config.colors.os,
							formatOsLabel(config.icons.os, iconMode),
						)
					: "";
				const timeSegment = config.footerSegments.time
					? `${renderStyleForSource(theme, colorSource, "", "Time")} ${renderStyleForSource(
							theme,
							colorSource,
							config.colors.time,
							formatTimeLabel(""),
						)}`
					: "";
				const formatNeedsMcp = /\$\{?mcp\b/.test(config.footerFormat);
				const dedicatedMcpVisible = Boolean(
					mcpStatus && (config.footerFormat ? formatNeedsMcp : config.footerSegments.mcp),
				);
				const extensionStatusSource = dedicatedMcpVisible
					? new Map([...rawExtensionStatuses].filter(([key]) => key !== "mcp"))
					: rawExtensionStatuses;
				const extensionStatuses = collectExtensionStatusSegments(extensionStatusSource, config);
				const renderExtensionStatus = (segment: ExtensionStatusSegment) =>
					segment.colorMode === "original"
						? segment.text
						: renderStyleForSource(theme, colorSource, config.colors.extensionStatus, segment.text);
				const extensionLeft = extensionStatuses.left.map(renderExtensionStatus);
				const extensionMiddle = extensionStatuses.middle.map(renderExtensionStatus);
				const extensionRight = extensionStatuses.right.map(renderExtensionStatus);
				const frame = (content: string) => {
					const framed = width > 2 ? ` ${truncateToWidth(content, width - 2, "")} ` : content;
					return truncateToWidth(framed, width, "");
				};

				if (config.footerFormat) {
					const {
						left: fmtLeft,
						middle: fmtMiddle,
						right: fmtRight,
					} = renderFormatSplit(parseFooterFormat(config.footerFormat), renderVariable);
					const templateMiddle = stripOrphanSeparators(fmtMiddle);
					const content = composeFooterContent(
						stripOrphanSeparators(fmtLeft),
						stripOrphanSeparators(fmtRight),
						extensionLeft,
						templateMiddle ? [templateMiddle, ...extensionMiddle] : extensionMiddle,
						extensionRight,
						separator,
						innerWidth,
					);
					return [frame(content)];
				}

				const groups = buildCategorizedFooterGroups({
					project: {
						category: projectCategoryLabel,
						cwd: config.footerSegments.cwd ? cwdValueLabel : "",
						git: branchLabel,
						commit: gitCommitLabel,
						metrics: gitMetricsLabel,
						runtime: runtimeLabel,
						packageVersion: packageVersionLabel,
						configCounts: config.footerSegments.configCounts ? configCountsLabel : "",
						os: osSegment,
						username: usernameSegment,
					},
					session: {
						category: sessionCategoryLabel,
						name: config.footerSegments.sessionName ? sessionNameLabel : "",
						model: config.footerSegments.model ? modelValueLabel : "",
						thinking: config.footerSegments.thinking ? thinkingLabel : "",
						turn: config.footerSegments.turnCount ? turnLabel : "",
						duration: sessionDurationSegment,
					},
					activity: {
						category: activityCategoryLabel,
						tool: config.footerSegments.toolActivity ? runningToolsLabel || toolCountsLabel : "",
						agent: config.footerSegments.agentActivity ? activeAgentsLabel : "",
						skills: config.footerSegments.skills ? skillsLabel : "",
						mcp: config.footerSegments.mcp ? mcpLabel : "",
						extensions: [...extensionLeft, ...extensionMiddle, ...extensionRight],
					},
					usage: {
						category: usageCategoryLabel,
						context: config.footerSegments.context
							? renderStyleForSource(theme, colorSource, contextColor, contextLabel)
							: "",
						tokens: config.footerSegments.tokens
							? renderStyleForSource(theme, colorSource, config.colors.tokens, state.tokenLabel)
							: "",
						cache: config.footerSegments.cacheDetails ? cacheDetailsLabel : "",
						cost: config.footerSegments.cost
							? renderStyleForSource(theme, colorSource, config.colors.cost, state.costLabel)
							: "",
						quota: config.footerSegments.codexUsage ? codexUsageLabel : "",
						time: timeSegment,
					},
				});
				const contents = composeCategorizedFooterRows(groups, separator, innerWidth);
				return contents.map(frame);
			},
		};
	});
}
