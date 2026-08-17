/**
 * Public barrel for the Zentui config module.
 *
 * The config surface is split across four focused files:
 *   - `schema.ts`     — types, format-string vocabulary, and `defaultConfig`.
 *   - `normalize.ts`  — untrusted JSON → `PolishedTuiConfig` normalization.
 *   - `file-io.ts`    — atomic on-disk read/write of the config file.
 *   - `persist.ts`    — `save*Patch` helpers used by the settings UI/commands.
 *
 * This file re-exports the full public API unchanged so existing imports of
 * `../config/config.js` keep working without modification.
 */
export type {
	ColorSourcesConfig,
	ColorSource,
	ColorSpec,
	ContextStyle,
	ContextThresholds,
	ExtensionStatusColorMode,
	ExtensionStatusesConfig,
	ExtensionStatusPlacement,
	FooterRowsConfig,
	FooterSegmentsConfig,
	GitBranchConfig,
	GitBranchMaxLength,
	GitCommitConfig,
	GitMetricsConfig,
	IconMode,
	PathDisplayConfig,
	PathDisplayMode,
	PolishedTuiConfig,
	SeparatorStyle,
	UiFeaturesConfig,
} from "./schema.js";
export {
	configPath,
	defaultConfig,
	FOOTER_FORMAT_ALIASES,
	FOOTER_FORMAT_VARIABLES,
} from "./schema.js";

export {
	getExtensionStatusColorMode,
	getExtensionStatusPlacement,
	isExtensionStatusColorMode,
	isExtensionStatusPlacement,
	isSeparatorStyle,
	mergeConfig,
} from "./normalize.js";

export { ensureConfigExists, loadConfig } from "./file-io.js";

export {
	saveColorSourcesPatch,
	saveContextStylePatch,
	saveContextThresholdsPatch,
	saveExtensionStatusColorMode,
	saveExtensionStatusPlacement,
	saveFooterFormatPatch,
	saveFooterRowsPatch,
	saveFooterSegmentsPatch,
	saveGitBranchPatch,
	saveIconsModePatch,
	savePathDisplayPatch,
	saveSeparatorPatch,
	saveUiFeaturesPatch,
} from "./persist.js";
