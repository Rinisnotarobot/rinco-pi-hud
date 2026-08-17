/**
 * Untrusted-JSON → `PolishedTuiConfig` normalization.
 *
 * Every field is parsed defensively: unknown/malformed values fall back to
 * `defaultConfig`, and free-form text (footer format, icon glyph overrides)
 * is length-capped and stripped of control/VT characters before being stored.
 */
import { stripVTControlCharacters } from "node:util";
import {
	ICON_GLYPH_KEYS,
	type IconGlyphs,
	normalizeIconMode,
	resolveConfiguredIcons,
} from "../ui/icons.js";
import { isSupportedColorSpec } from "../ui/style.js";
import {
	DEFAULT_EXTENSION_STATUS_COLOR_MODE,
	DEFAULT_PROJECT_REFRESH_INTERVAL_MS,
	MIN_PROJECT_REFRESH_INTERVAL_MS,
	type ColorSource,
	type ColorSourcesConfig,
	type ContextStyle,
	type ContextThresholds,
	defaultConfig,
	type ExtensionStatusColorMode,
	type ExtensionStatusesConfig,
	type ExtensionStatusPlacement,
	type FooterRowsConfig,
	type FooterSegmentsConfig,
	type GitBranchConfig,
	type GitBranchMaxLength,
	type GitCommitConfig,
	type GitMetricsConfig,
	type PathDisplayConfig,
	type PolishedTuiConfig,
	type SeparatorStyle,
	type UiFeaturesConfig,
} from "./schema.js";

export type ConfigRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is ConfigRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseProjectRefreshIntervalMs(value: unknown): number {
	if (value === 0) return 0;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_PROJECT_REFRESH_INTERVAL_MS;
	}

	const interval = Math.round(value);
	if (interval <= 0) return 0;
	return Math.max(MIN_PROJECT_REFRESH_INTERVAL_MS, interval);
}

function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

export function parseContextStyle(value: unknown): ContextStyle {
	if (value === "text" || value === "gauge" || value === "text+gauge") return value;
	return defaultConfig.contextStyle;
}

export function isSeparatorStyle(value: unknown): value is SeparatorStyle {
	return value === "pipe" || value === "dot" || value === "chevron" || value === "none";
}

export function parseSeparatorStyle(value: unknown): SeparatorStyle {
	return isSeparatorStyle(value) ? value : defaultConfig.separator;
}

function parseContextThresholds(value: unknown): ContextThresholds {
	const defaults = defaultConfig.contextThresholds;
	if (!isRecord(value)) return { ...defaults };

	const warningRaw = value.warning;
	const errorRaw = value.error;
	let warning =
		typeof warningRaw === "number" && Number.isFinite(warningRaw)
			? clampPercent(Math.round(warningRaw))
			: defaults.warning;
	let error =
		typeof errorRaw === "number" && Number.isFinite(errorRaw)
			? clampPercent(Math.round(errorRaw))
			: defaults.error;
	if (error < warning) {
		const swapped = warning;
		warning = error;
		error = swapped;
	}
	return { warning, error };
}

function parsePathDisplay(value: unknown): PathDisplayConfig {
	const defaults = defaultConfig.pathDisplay;
	if (!isRecord(value)) return { ...defaults };
	const mode = value.mode === "full" || value.mode === "basename" ? value.mode : defaults.mode;
	const rawDepth = value.depth;
	const depth =
		typeof rawDepth === "number" && Number.isFinite(rawDepth) && rawDepth >= 0
			? Math.min(5, Math.floor(rawDepth))
			: defaults.depth;
	return { mode, depth };
}

export function normalizeGitBranchMaxLength(value: unknown): GitBranchMaxLength {
	if (value === "full") return value;
	if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
	return defaultConfig.gitBranch.maxLength;
}

function parseGitBranchConfig(value: unknown): GitBranchConfig {
	const defaults = defaultConfig.gitBranch;
	if (!isRecord(value)) return { ...defaults };
	return {
		maxLength: normalizeGitBranchMaxLength(value.maxLength),
	};
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

export function sanitizeConfigText(value: string, maxLength: number): string {
	return stripVTControlCharacters(value.slice(0, maxLength * 4))
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
		.slice(0, maxLength);
}

function colorValue(record: Record<string, unknown>, key: string): string | undefined {
	const value = stringValue(record, key);
	return value !== undefined && isSupportedColorSpec(value) ? value : undefined;
}

function colorSourceValue(
	record: Record<string, unknown>,
	key: keyof ColorSourcesConfig,
): ColorSource {
	const value = record[key];
	return value === "terminal" || value === "theme" ? value : defaultConfig.colorSources[key];
}

function booleanValue(record: Record<string, unknown>, key: keyof UiFeaturesConfig): boolean {
	const value = record[key];
	return typeof value === "boolean" ? value : defaultConfig.features[key];
}

function footerSegmentValue(
	record: Record<string, unknown>,
	key: keyof FooterSegmentsConfig,
): boolean {
	const value = record[key];
	return typeof value === "boolean" ? value : defaultConfig.footerSegments[key];
}

function footerSegmentValueWithLegacy(
	record: Record<string, unknown>,
	key: keyof FooterSegmentsConfig,
	legacyKey: "tokens" | "toolActivity" | "agentActivity",
): boolean {
	const value = record[key];
	if (typeof value === "boolean") return value;
	const legacyValue = record[legacyKey];
	return typeof legacyValue === "boolean" ? legacyValue : defaultConfig.footerSegments[key];
}

function definedColors(
	colors: Partial<Record<keyof PolishedTuiConfig["colors"], string | undefined>>,
): Partial<PolishedTuiConfig["colors"]> {
	return Object.fromEntries(
		Object.entries(colors).filter(
			(entry): entry is [keyof PolishedTuiConfig["colors"], string] => typeof entry[1] === "string",
		),
	) as Partial<PolishedTuiConfig["colors"]>;
}

function normalizeIconOverrides(record: Record<string, unknown>): Partial<IconGlyphs> {
	return Object.fromEntries(
		ICON_GLYPH_KEYS.flatMap((key) => {
			const value = stringValue(record, key);
			return value === undefined ? [] : [[key, sanitizeConfigText(value, 64)]];
		}),
	) as Partial<IconGlyphs>;
}

function normalizeColors(record: Record<string, unknown>): Partial<PolishedTuiConfig["colors"]> {
	return definedColors({
		cwd: colorValue(record, "cwd") ?? colorValue(record, "cwdText"),
		gitBranch: colorValue(record, "gitBranch") ?? colorValue(record, "git"),
		gitStatus: colorValue(record, "gitStatus"),
		contextNormal: colorValue(record, "contextNormal"),
		contextWarning: colorValue(record, "contextWarning"),
		contextError: colorValue(record, "contextError"),
		tokens: colorValue(record, "tokens"),
		cost: colorValue(record, "cost"),
		separator: colorValue(record, "separator"),
		runtimePrefix: colorValue(record, "runtimePrefix"),
		extensionStatus: colorValue(record, "extensionStatus"),
		sessionDuration: colorValue(record, "sessionDuration"),
		packageVersion: colorValue(record, "packageVersion"),
		gitCommit: colorValue(record, "gitCommit"),
		gitMetricsAdded: colorValue(record, "gitMetricsAdded"),
		gitMetricsDeleted: colorValue(record, "gitMetricsDeleted"),
		username: colorValue(record, "username"),
		time: colorValue(record, "time"),
		os: colorValue(record, "os"),
		muted: colorValue(record, "muted"),
	});
}

function normalizeColorSources(record: Record<string, unknown>): ColorSourcesConfig {
	return { starship: colorSourceValue(record, "starship") };
}

function normalizeUiFeatures(record: Record<string, unknown>): UiFeaturesConfig {
	return { statusLine: booleanValue(record, "statusLine") };
}

function normalizeFooterRows(record: Record<string, unknown>): FooterRowsConfig {
	return {
		project:
			typeof record.project === "boolean" ? record.project : defaultConfig.footerRows.project,
		session:
			typeof record.session === "boolean" ? record.session : defaultConfig.footerRows.session,
		activity:
			typeof record.activity === "boolean" ? record.activity : defaultConfig.footerRows.activity,
		usage: typeof record.usage === "boolean" ? record.usage : defaultConfig.footerRows.usage,
	};
}

function normalizeFooterSegments(record: Record<string, unknown>): FooterSegmentsConfig {
	return {
		cwd: footerSegmentValue(record, "cwd"),
		gitBranch: footerSegmentValue(record, "gitBranch"),
		gitStatus: footerSegmentValue(record, "gitStatus"),
		gitState: footerSegmentValue(record, "gitState"),
		gitCounts: footerSegmentValue(record, "gitCounts"),
		runtime: footerSegmentValue(record, "runtime"),
		context: footerSegmentValue(record, "context"),
		inputTokens: footerSegmentValueWithLegacy(record, "inputTokens", "tokens"),
		outputTokens: footerSegmentValueWithLegacy(record, "outputTokens", "tokens"),
		cacheDetails: footerSegmentValue(record, "cacheDetails"),
		cost: footerSegmentValue(record, "cost"),
		sessionDuration: footerSegmentValue(record, "sessionDuration"),
		username: footerSegmentValue(record, "username"),
		time: footerSegmentValue(record, "time"),
		os: footerSegmentValue(record, "os"),
		packageVersion: footerSegmentValue(record, "packageVersion"),
		gitCommit: footerSegmentValue(record, "gitCommit"),
		gitMetrics: footerSegmentValue(record, "gitMetrics"),
		sessionName: footerSegmentValue(record, "sessionName"),
		model: footerSegmentValue(record, "model"),
		thinking: footerSegmentValue(record, "thinking"),
		turnCount: footerSegmentValue(record, "turnCount"),
		codexUsage: footerSegmentValue(record, "codexUsage"),
		configCounts: footerSegmentValue(record, "configCounts"),
		skills: footerSegmentValue(record, "skills"),
		mcp: footerSegmentValue(record, "mcp"),
		runningTools: footerSegmentValueWithLegacy(record, "runningTools", "toolActivity"),
		toolCounts: footerSegmentValueWithLegacy(record, "toolCounts", "toolActivity"),
		activeAgents: footerSegmentValueWithLegacy(record, "activeAgents", "agentActivity"),
		agentIdle: footerSegmentValueWithLegacy(record, "agentIdle", "agentActivity"),
	};
}

/** Clamp hashLength to Git's valid abbreviation range [4, 40]. */
function normalizeGitHashLength(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) return defaultConfig.gitCommit.hashLength;
	const rounded = Math.round(parsed);
	return Math.min(40, Math.max(4, rounded));
}

function normalizeGitCommitConfig(record: Record<string, unknown>): GitCommitConfig {
	return {
		hashLength: normalizeGitHashLength(record.hashLength),
		onlyDetached:
			typeof record.onlyDetached === "boolean"
				? record.onlyDetached
				: defaultConfig.gitCommit.onlyDetached,
		showTag: typeof record.showTag === "boolean" ? record.showTag : defaultConfig.gitCommit.showTag,
	};
}

function normalizeGitMetricsConfig(record: Record<string, unknown>): GitMetricsConfig {
	return {
		onlyNonzero:
			typeof record.onlyNonzero === "boolean"
				? record.onlyNonzero
				: defaultConfig.gitMetrics.onlyNonzero,
		ignoreSubmodules:
			typeof record.ignoreSubmodules === "boolean"
				? record.ignoreSubmodules
				: defaultConfig.gitMetrics.ignoreSubmodules,
	};
}

export function isExtensionStatusPlacement(value: unknown): value is ExtensionStatusPlacement {
	return value === "off" || value === "left" || value === "middle" || value === "right";
}

export function isExtensionStatusColorMode(value: unknown): value is ExtensionStatusColorMode {
	return value === "zentui" || value === "original";
}

function normalizeExtensionStatuses(record: Record<string, unknown>): ExtensionStatusesConfig {
	const defaultPlacement = isExtensionStatusPlacement(record.defaultPlacement)
		? record.defaultPlacement
		: defaultConfig.extensionStatuses.defaultPlacement;
	const placements = isRecord(record.placements)
		? Object.fromEntries(
				Object.entries(record.placements).filter(
					(entry): entry is [string, ExtensionStatusPlacement] =>
						isExtensionStatusPlacement(entry[1]),
				),
			)
		: {};
	const colorModes = isRecord(record.colorModes)
		? Object.fromEntries(
				Object.entries(record.colorModes).filter(
					(entry): entry is [string, ExtensionStatusColorMode] =>
						isExtensionStatusColorMode(entry[1]),
				),
			)
		: {};

	return {
		defaultPlacement,
		placements,
		colorModes,
	};
}

export function mergeConfig(parsed: unknown): PolishedTuiConfig {
	const config = isRecord(parsed) ? parsed : {};
	const iconsRecord = isRecord(config.icons) ? (config.icons as Record<string, unknown>) : {};
	const iconMode = normalizeIconMode(iconsRecord.mode);
	const iconOverrides = normalizeIconOverrides(iconsRecord);
	const colors = isRecord(config.colors)
		? normalizeColors(config.colors as Record<string, unknown>)
		: {};
	const colorSources = isRecord(config.colorSources)
		? normalizeColorSources(config.colorSources as Record<string, unknown>)
		: defaultConfig.colorSources;
	const features = isRecord(config.features)
		? normalizeUiFeatures(config.features as Record<string, unknown>)
		: defaultConfig.features;
	const footerRows = isRecord(config.footerRows)
		? normalizeFooterRows(config.footerRows as Record<string, unknown>)
		: defaultConfig.footerRows;
	const footerSegments = isRecord(config.footerSegments)
		? normalizeFooterSegments(config.footerSegments as Record<string, unknown>)
		: defaultConfig.footerSegments;
	const extensionStatuses = isRecord(config.extensionStatuses)
		? normalizeExtensionStatuses(config.extensionStatuses as Record<string, unknown>)
		: defaultConfig.extensionStatuses;
	const gitCommit = isRecord(config.gitCommit)
		? normalizeGitCommitConfig(config.gitCommit as Record<string, unknown>)
		: defaultConfig.gitCommit;
	const gitMetrics = isRecord(config.gitMetrics)
		? normalizeGitMetricsConfig(config.gitMetrics as Record<string, unknown>)
		: defaultConfig.gitMetrics;
	const gitBranch = parseGitBranchConfig(config.gitBranch);
	return {
		projectRefreshIntervalMs: parseProjectRefreshIntervalMs(config.projectRefreshIntervalMs),
		footerFormat: sanitizeConfigText(stringValue(config, "footerFormat") ?? "", 4096),
		separator: parseSeparatorStyle(config.separator),
		contextStyle: parseContextStyle(config.contextStyle),
		contextThresholds: parseContextThresholds(config.contextThresholds),
		pathDisplay: parsePathDisplay(config.pathDisplay),
		gitBranch,
		icons: resolveConfiguredIcons(iconMode, iconOverrides),
		colors: {
			...defaultConfig.colors,
			...colors,
		},
		colorSources: { ...colorSources },
		features: { ...features },
		footerRows: { ...footerRows },
		footerSegments: { ...footerSegments },
		gitCommit,
		gitMetrics,
		extensionStatuses: {
			defaultPlacement: extensionStatuses.defaultPlacement,
			placements: { ...extensionStatuses.placements },
			colorModes: { ...extensionStatuses.colorModes },
		},
	};
}

export function getExtensionStatusPlacement(
	config: PolishedTuiConfig,
	key: string,
): ExtensionStatusPlacement {
	return config.extensionStatuses.placements[key] ?? config.extensionStatuses.defaultPlacement;
}

export function getExtensionStatusColorMode(
	config: PolishedTuiConfig,
	key: string,
): ExtensionStatusColorMode {
	return config.extensionStatuses.colorModes[key] ?? DEFAULT_EXTENSION_STATUS_COLOR_MODE;
}
