/**
 * `save*Patch` functions: validate a partial settings patch, merge it into
 * the on-disk config record via `mutateConfig`, and return the freshly
 * merged `PolishedTuiConfig`. Each function only accepts fields/values that
 * pass the corresponding type guard, so callers (e.g. the `/zentui` settings
 * UI) cannot write malformed values into the config file.
 */
import { normalizeIconMode } from "../ui/icons.js";
import { mutateConfig } from "./file-io.js";
import {
	isExtensionStatusColorMode,
	isExtensionStatusPlacement,
	isRecord,
	normalizeGitBranchMaxLength,
	parseContextStyle,
	parseSeparatorStyle,
	sanitizeConfigText,
} from "./normalize.js";
import {
	configPath,
	type ColorSource,
	type ColorSourcesConfig,
	type ContextStyle,
	type ContextThresholds,
	type ExtensionStatusColorMode,
	type ExtensionStatusPlacement,
	type FooterRowsConfig,
	type FooterSegmentsConfig,
	type GitBranchConfig,
	type IconMode,
	type PathDisplayConfig,
	type PolishedTuiConfig,
	type SeparatorStyle,
	type UiFeaturesConfig,
} from "./schema.js";

function isColorSourceKey(value: string): value is keyof ColorSourcesConfig {
	return value === "starship";
}

function isUiFeatureKey(value: string): value is keyof UiFeaturesConfig {
	return value === "statusLine";
}

function isFooterRowKey(value: string): value is keyof FooterRowsConfig {
	return value === "project" || value === "session" || value === "activity" || value === "usage";
}

function isFooterSegmentKey(value: string): value is keyof FooterSegmentsConfig {
	return (
		value === "cwd" ||
		value === "gitBranch" ||
		value === "gitStatus" ||
		value === "gitState" ||
		value === "gitCounts" ||
		value === "runtime" ||
		value === "context" ||
		value === "inputTokens" ||
		value === "outputTokens" ||
		value === "cost" ||
		value === "sessionDuration" ||
		value === "username" ||
		value === "time" ||
		value === "os" ||
		value === "packageVersion" ||
		value === "gitCommit" ||
		value === "gitMetrics" ||
		value === "sessionName" ||
		value === "model" ||
		value === "thinking" ||
		value === "turnCount" ||
		value === "cacheDetails" ||
		value === "codexUsage" ||
		value === "configCounts" ||
		value === "skills" ||
		value === "mcp" ||
		value === "runningTools" ||
		value === "toolCounts" ||
		value === "activeAgents" ||
		value === "agentIdle"
	);
}

function validColorSourceEntries(record: Record<string, unknown>): Partial<ColorSourcesConfig> {
	return Object.fromEntries(
		Object.entries(record).filter((entry): entry is [keyof ColorSourcesConfig, ColorSource] => {
			const [key, value] = entry;
			return isColorSourceKey(key) && (value === "theme" || value === "terminal");
		}),
	) as Partial<ColorSourcesConfig>;
}

function validUiFeatureEntries(record: Record<string, unknown>): Partial<UiFeaturesConfig> {
	return Object.fromEntries(
		Object.entries(record).filter((entry): entry is [keyof UiFeaturesConfig, boolean] => {
			const [key, value] = entry;
			return isUiFeatureKey(key) && typeof value === "boolean";
		}),
	) as Partial<UiFeaturesConfig>;
}

function validFooterRowEntries(record: Record<string, unknown>): Partial<FooterRowsConfig> {
	return Object.fromEntries(
		Object.entries(record).filter((entry): entry is [keyof FooterRowsConfig, boolean] => {
			const [key, value] = entry;
			return isFooterRowKey(key) && typeof value === "boolean";
		}),
	) as Partial<FooterRowsConfig>;
}

function validFooterSegmentEntries(record: Record<string, unknown>): Partial<FooterSegmentsConfig> {
	return Object.fromEntries(
		Object.entries(record).filter((entry): entry is [keyof FooterSegmentsConfig, boolean] => {
			const [key, value] = entry;
			return isFooterSegmentKey(key) && typeof value === "boolean";
		}),
	) as Partial<FooterSegmentsConfig>;
}

export function saveColorSourcesPatch(
	patch: Partial<ColorSourcesConfig>,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existing = isRecord(record.colorSources)
			? { ...(record.colorSources as Record<string, unknown>) }
			: {};
		record.colorSources = {
			...existing,
			...validColorSourceEntries(patch),
		};
	});
}

export function saveUiFeaturesPatch(
	patch: Partial<UiFeaturesConfig>,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existing = isRecord(record.features)
			? { ...(record.features as Record<string, unknown>) }
			: {};
		record.features = {
			...existing,
			...validUiFeatureEntries(patch),
		};
	});
}

export function saveFooterRowsPatch(
	patch: Partial<FooterRowsConfig>,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existing = isRecord(record.footerRows)
			? { ...(record.footerRows as Record<string, unknown>) }
			: {};
		record.footerRows = {
			...existing,
			...validFooterRowEntries(patch),
		};
	});
}

export function saveFooterSegmentsPatch(
	patch: Partial<FooterSegmentsConfig>,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existing = isRecord(record.footerSegments)
			? { ...(record.footerSegments as Record<string, unknown>) }
			: {};
		record.footerSegments = {
			...existing,
			...validFooterSegmentEntries(patch),
		};
	});
}

export function saveFooterFormatPatch(value: string, path = configPath): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		record.footerFormat = typeof value === "string" ? sanitizeConfigText(value, 4096) : "";
	});
}

export function saveIconsModePatch(mode: IconMode, path = configPath): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existing = isRecord(record.icons) ? { ...(record.icons as Record<string, unknown>) } : {};
		record.icons = {
			...existing,
			mode: normalizeIconMode(mode),
		};
	});
}

export function saveContextStylePatch(style: ContextStyle, path = configPath): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		record.contextStyle = parseContextStyle(style);
	});
}

export function saveSeparatorPatch(
	separator: SeparatorStyle,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		record.separator = parseSeparatorStyle(separator);
	});
}

export function saveContextThresholdsPatch(
	thresholds: Partial<ContextThresholds>,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existing = isRecord(record.contextThresholds)
			? { ...(record.contextThresholds as Record<string, unknown>) }
			: {};
		record.contextThresholds = {
			...existing,
			...thresholds,
		};
	});
}

export function savePathDisplayPatch(
	patch: Partial<PathDisplayConfig>,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existing = isRecord(record.pathDisplay)
			? { ...(record.pathDisplay as Record<string, unknown>) }
			: {};
		if (patch.mode !== undefined) existing.mode = patch.mode;
		if (patch.depth !== undefined) existing.depth = patch.depth;
		record.pathDisplay = existing;
	});
}

export function saveGitBranchPatch(
	patch: Partial<GitBranchConfig>,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existing = isRecord(record.gitBranch)
			? { ...(record.gitBranch as Record<string, unknown>) }
			: {};
		if (patch.maxLength !== undefined)
			existing.maxLength = normalizeGitBranchMaxLength(patch.maxLength);
		record.gitBranch = existing;
	});
}

export function saveExtensionStatusPlacement(
	key: string,
	placement: ExtensionStatusPlacement,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existingExtensionStatuses = isRecord(record.extensionStatuses)
			? { ...(record.extensionStatuses as Record<string, unknown>) }
			: {};
		const existingPlacements = isRecord(existingExtensionStatuses.placements)
			? { ...(existingExtensionStatuses.placements as Record<string, unknown>) }
			: {};

		if (!isExtensionStatusPlacement(placement)) return;

		Object.defineProperty(existingPlacements, key, {
			value: placement,
			enumerable: true,
			configurable: true,
			writable: true,
		});

		record.extensionStatuses = {
			...existingExtensionStatuses,
			placements: existingPlacements,
		};
	});
}

export function saveExtensionStatusColorMode(
	key: string,
	colorMode: ExtensionStatusColorMode,
	path = configPath,
): PolishedTuiConfig {
	return mutateConfig(path, (record) => {
		const existingExtensionStatuses = isRecord(record.extensionStatuses)
			? { ...(record.extensionStatuses as Record<string, unknown>) }
			: {};
		const existingColorModes = isRecord(existingExtensionStatuses.colorModes)
			? { ...(existingExtensionStatuses.colorModes as Record<string, unknown>) }
			: {};

		if (!isExtensionStatusColorMode(colorMode)) return;

		Object.defineProperty(existingColorModes, key, {
			value: colorMode,
			enumerable: true,
			configurable: true,
			writable: true,
		});

		record.extensionStatuses = {
			...existingExtensionStatuses,
			colorModes: existingColorModes,
		};
	});
}
