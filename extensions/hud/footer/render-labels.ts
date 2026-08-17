/**
 * Footer render-time label builders.
 *
 * `installFooter`'s render callback composes dozens of small styled label
 * strings (git status, telemetry counters, sanitized state fields) before
 * dispatching to either the custom `footerFormat` template or the default
 * categorized rows. Those label computations are pulled out here as pure
 * functions of `(state, config, theme, colorSource, ...)` so the render
 * callback itself stays focused on composition/layout.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { ColorSource, PolishedTuiConfig } from "../config/config.js";
import type { McpStatus } from "../segments/mcp-status.js";
import { formatSkillCounts } from "../segments/skill-activity.js";
import type { FooterState } from "../state/index.js";
import { getTelemetryStats } from "../state/telemetry.js";
import { buildSessionDurationLabel, formatCount } from "../telemetry/format.js";
import { renderStyleForSource, type ThemeLike } from "../ui/style.js";
import { sanitizeExtensionStatusText } from "../segments/extension-status.js";

export function safeStatusText(value: string | null | undefined, maxLength = 256): string {
	if (!value) return "";
	return sanitizeExtensionStatusText(value.slice(0, maxLength * 4)).slice(0, maxLength);
}

export type SanitizedFooterInputs = {
	safeCwd: string;
	safeRuntime:
		{ name: string; symbol: string; style: string; version: string | undefined } | undefined;
	safePackageVersion: { ecosystem: string; version: string } | undefined;
	safeCommit: { oid: string | null; detached: boolean; tag: string | null } | undefined;
};

/** Sanitize the state/ctx fields that flow into the terminal so a malicious
 * runtime name, git branch, etc. cannot inject ANSI/control sequences. */
export function sanitizeFooterInputs(
	ctx: Pick<ExtensionContext, "cwd">,
	state: FooterState,
): SanitizedFooterInputs {
	const safeCwd = safeStatusText(ctx.cwd, 1024);
	const safeRuntime = state.runtime
		? {
				...state.runtime,
				name: safeStatusText(state.runtime.name, 64),
				symbol: safeStatusText(state.runtime.symbol, 32),
				version: safeStatusText(state.runtime.version, 128) || undefined,
			}
		: undefined;
	const safePackageVersion = state.packageVersion
		? {
				ecosystem: safeStatusText(state.packageVersion.ecosystem, 64),
				version: safeStatusText(state.packageVersion.version, 160),
			}
		: undefined;
	const safeCommit = state.commit
		? {
				...state.commit,
				oid: safeStatusText(state.commit.oid, 64) || null,
				tag: safeStatusText(state.commit.tag, 160) || null,
			}
		: undefined;
	return { safeCwd, safeRuntime, safePackageVersion, safeCommit };
}

export type GitStatusLabels = {
	gitColor: (text: string) => string;
	gitStatusColor: (text: string) => string;
	gitIcon: string;
	statusBlock: string;
	gitStateLabel: string;
	gitStateBlock: string;
};

/** Build the ` [icons ahead/behind]` git-status block and the git operation
 * state (REBASING/MERGING/…) block, both pre-styled for the active theme. */
export function buildGitStatusLabels(
	state: FooterState,
	config: PolishedTuiConfig,
	theme: ThemeLike,
	colorSource: ColorSource,
): GitStatusLabels {
	const gitColor = (text: string) =>
		renderStyleForSource(theme, colorSource, config.colors.gitBranch, text);
	const gitStatusColor = (text: string) =>
		renderStyleForSource(theme, colorSource, config.colors.gitStatus, text);
	const gitIcon = config.icons.git ? gitColor(config.icons.git) : "";
	const gitCounts = config.footerSegments.gitCounts;
	const stashLabel =
		state.stashed > 0
			? gitCounts
				? `${config.icons.stashed} ${state.stashed}`
				: config.icons.stashed
			: "";
	const allStatus = [
		state.conflicted > 0 ? config.icons.conflicted : "",
		stashLabel,
		state.deleted > 0 ? config.icons.deleted : "",
		state.renamed > 0 ? config.icons.renamed : "",
		state.modified > 0 ? config.icons.modified : "",
		state.typechanged > 0 ? config.icons.typechanged : "",
		state.staged > 0 ? config.icons.staged : "",
		state.untracked > 0 ? config.icons.untracked : "",
	]
		.filter(Boolean)
		.join(" ");
	const aheadBehind = (() => {
		if (state.ahead > 0 && state.behind > 0) {
			return gitCounts
				? `${config.icons.ahead} ${state.ahead} ${config.icons.behind} ${state.behind}`
				: config.icons.diverged;
		}
		if (state.ahead > 0)
			return gitCounts ? `${config.icons.ahead} ${state.ahead}` : config.icons.ahead;
		if (state.behind > 0)
			return gitCounts ? `${config.icons.behind} ${state.behind}` : config.icons.behind;
		return "";
	})();
	const gitStatusText = [allStatus, aheadBehind].filter(Boolean).join(" ");
	const statusBlock = gitStatusText ? gitStatusColor(`[${gitStatusText}]`) : "";
	const gitStateLabel = safeStatusText(state.gitStateLabel, 64);
	const gitStateBlock = gitStateLabel ? gitStatusColor(gitStateLabel) : "";
	return { gitColor, gitStatusColor, gitIcon, statusBlock, gitStateLabel, gitStateBlock };
}

export type TelemetryLabels = {
	projectCategoryLabel: string;
	sessionCategoryLabel: string;
	activityCategoryLabel: string;
	usageCategoryLabel: string;
	sessionNameLabel: string;
	modelValueLabel: string;
	modelStatusLabel: string;
	providerId: string;
	modelId: string;
	thinkingLabel: string;
	turnLabel: string;
	inputTokensLabel: string;
	outputTokensLabel: string;
	cacheReadLabel: string;
	cacheWriteLabel: string;
	cacheHitLabel: string;
	cacheDetailsLabel: string;
	codexUsageLabel: string;
	instructionFilesLabel: string;
	agentsFilesLabel: string;
	claudeFilesLabel: string;
	skillsLabel: string;
	activeSkillsLabel: string;
	extensionsLabel: string;
	configCountsLabel: string;
	mcpLabel: string;
	toolCountsLabel: string;
	runningToolsLabel: string;
	activeAgentsLabel: string;
	agentIdleLabel: string;
};

/** Build every session/activity/usage-row telemetry label (model, thinking level,
 * turn count, cache/tool/agent counters, skills, MCP, Codex usage, …). */
export function buildTelemetryLabels(
	ctx: Pick<ExtensionContext, "model">,
	state: FooterState,
	config: PolishedTuiConfig,
	theme: ThemeLike,
	colorSource: ColorSource,
	mcpStatus: McpStatus | undefined,
): TelemetryLabels {
	const statusStyle = (style: string, text: string) =>
		text ? renderStyleForSource(theme, colorSource, style, text) : "";

	const projectCategoryLabel = statusStyle(config.colors.cwd, "Project");
	const sessionCategoryLabel = statusStyle(config.colors.runtimePrefix, "Session");
	const activityCategoryLabel = statusStyle(config.colors.extensionStatus, "Activity");
	const usageCategoryLabel = statusStyle(config.colors.contextNormal, "Usage");

	const sessionName = safeStatusText(state.telemetry.sessionName, 256);
	const sessionNameLabel = statusStyle(
		config.colors.gitBranch,
		sessionName ? `◈ ${sessionName}` : "",
	);

	const providerId = safeStatusText(ctx.model?.provider, 128);
	const modelId = safeStatusText(ctx.model?.id, 256);
	const modelText = providerId && modelId ? `${providerId}/${modelId}` : modelId || providerId;
	const modelValueLabel = statusStyle(config.colors.runtimePrefix, modelText);
	const modelStatusLabel = statusStyle(
		config.colors.runtimePrefix,
		modelText ? `λ ${modelText}` : "",
	);

	const thinkingLabel = state.telemetry.modelSupportsReasoning
		? statusStyle(config.colors.extensionStatus, `Thinking level: ${state.telemetry.thinkingLevel}`)
		: "";
	const turnLabel =
		state.telemetry.turnIndex > 0
			? statusStyle(config.colors.extensionStatus, `Turn ${state.telemetry.turnIndex}`)
			: "";

	const inputTokensLabel = statusStyle(
		config.colors.tokens,
		`↑ ${formatCount(state.usageTotals.input)}`,
	);
	const outputTokensLabel = statusStyle(
		config.colors.tokens,
		`↓ ${formatCount(state.usageTotals.output)}`,
	);
	const cacheReadLabel =
		state.usageTotals.cacheRead > 0
			? statusStyle(config.colors.tokens, `R ${formatCount(state.usageTotals.cacheRead)}`)
			: "";
	const cacheWriteLabel =
		state.usageTotals.cacheWrite > 0
			? statusStyle(config.colors.tokens, `W ${formatCount(state.usageTotals.cacheWrite)}`)
			: "";
	const cacheHitLabel =
		state.usageTotals.latestCacheHitRate !== undefined
			? statusStyle(
					config.colors.contextNormal,
					`CH ${state.usageTotals.latestCacheHitRate.toFixed(1)}%`,
				)
			: "";
	const cacheDetailsLabel = [cacheReadLabel, cacheWriteLabel, cacheHitLabel]
		.filter(Boolean)
		.join(" ");

	const codexStyle =
		state.codexUsageStatus === "checking"
			? config.colors.contextWarning
			: state.codexUsageStatus === "usage error"
				? config.colors.contextError
				: config.colors.contextNormal;
	const codexUsageLabel = statusStyle(
		codexStyle,
		state.codexUsageStatus ? `◉ ${safeStatusText(state.codexUsageStatus, 256)}` : "",
	);

	const instructionFilesLabel =
		state.configCounts.instructionFiles.total > 0
			? statusStyle(config.colors.runtimePrefix, `※ ${state.configCounts.instructionFiles.total}`)
			: "";
	const agentsFilesLabel =
		state.configCounts.instructionFiles.agentsMd > 0
			? statusStyle(
					config.colors.runtimePrefix,
					String(state.configCounts.instructionFiles.agentsMd),
				)
			: "";
	const claudeFilesLabel =
		state.configCounts.instructionFiles.claudeMd > 0
			? statusStyle(
					config.colors.runtimePrefix,
					String(state.configCounts.instructionFiles.claudeMd),
				)
			: "";

	const skillCounts = state.skillCounts ?? { total: 0, active: 0 };
	const skillsLabel = statusStyle(config.colors.extensionStatus, formatSkillCounts(skillCounts));
	const activeSkillsLabel =
		skillCounts.total > 0
			? statusStyle(config.colors.extensionStatus, String(skillCounts.active))
			: "";

	const extensionsLabel =
		state.configCounts.packages > 0
			? statusStyle(config.colors.sessionDuration, `◈ ${state.configCounts.packages}`)
			: "";
	const configCountsLabel = [instructionFilesLabel, extensionsLabel].filter(Boolean).join(" ");

	const mcpLabel = mcpStatus
		? statusStyle(config.colors.gitStatus, `MCP ${mcpStatus.connected}/${mcpStatus.total}`)
		: "";

	const telemetryStats = getTelemetryStats(state.telemetry);
	const toolCountsText = Object.entries(telemetryStats.completedToolCounts)
		.filter(([, count]) => count > 0)
		.map(([tool, count]) => `${tool}${count > 1 ? ` × ${count}` : ""}`)
		.join(" ");
	const toolCountsLabel = statusStyle(
		config.colors.contextNormal,
		toolCountsText ? `Tool ${toolCountsText}` : "",
	);
	const runningToolsText = telemetryStats.recentRunningTools
		.map((tool) => {
			const target = tool.target ? `:${truncateToWidth(tool.target, 18, "…")}` : "";
			return `Tool ${tool.name}${target} (${buildSessionDurationLabel(tool.startTime)})`;
		})
		.join(" ");
	const runningToolsLabel = statusStyle(config.colors.contextWarning, runningToolsText);
	const activeAgentsLabel =
		telemetryStats.activeAgentRuns > 0
			? statusStyle(config.colors.extensionStatus, `Agent × ${telemetryStats.activeAgentRuns}`)
			: "";
	const agentIdleLabel =
		telemetryStats.activeAgentRuns === 0 ? statusStyle(config.colors.muted, "Agent idle") : "";

	return {
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
		inputTokensLabel,
		outputTokensLabel,
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
		agentIdleLabel,
	};
}
