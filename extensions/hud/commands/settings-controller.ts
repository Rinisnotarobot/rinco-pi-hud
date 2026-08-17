import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	type PolishedTuiConfig,
	saveColorSourcesPatch,
	saveContextStylePatch,
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
} from "../config/config.js";
import { registerZentuiSettingsCommand } from "./settings.js";

interface SettingsControllerDeps {
	getConfig: () => PolishedTuiConfig;
	setConfig: (config: PolishedTuiConfig) => void;
	applyConfiguredUi: (ctx: ExtensionContext) => void;
	restartSessionTimer: () => void;
	getActiveExtensionStatuses: () => ReadonlyMap<string, string>;
	requestRender: () => void;
}

/** Connect the settings UI to persistence without exposing patch mechanics to the extension root. */
export function registerSettingsController(pi: ExtensionAPI, deps: SettingsControllerDeps): void {
	const updateConfig = (config: PolishedTuiConfig) => {
		deps.setConfig(config);
	};

	registerZentuiSettingsCommand(pi, {
		getConfig: deps.getConfig,
		setColorSources(patch) {
			updateConfig(saveColorSourcesPatch(patch));
		},
		setUiFeatures(patch, ctx) {
			updateConfig(saveUiFeaturesPatch(patch));
			deps.applyConfiguredUi(ctx);
		},
		setFooterRows(patch) {
			updateConfig(saveFooterRowsPatch(patch));
		},
		setFooterSegments(patch) {
			updateConfig(saveFooterSegmentsPatch(patch));
			deps.restartSessionTimer();
		},
		setFooterFormat(value) {
			updateConfig(saveFooterFormatPatch(value));
			deps.restartSessionTimer();
		},
		setIconMode(mode) {
			updateConfig(saveIconsModePatch(mode));
		},
		setContextStyle(style) {
			updateConfig(saveContextStylePatch(style));
		},
		setSeparator(separator) {
			updateConfig(saveSeparatorPatch(separator));
		},
		setPathDisplay(patch) {
			updateConfig(savePathDisplayPatch(patch));
		},
		setGitBranch(patch) {
			updateConfig(saveGitBranchPatch(patch));
		},
		getActiveExtensionStatuses: deps.getActiveExtensionStatuses,
		setExtensionStatusPlacement(key, placement) {
			updateConfig(saveExtensionStatusPlacement(key, placement));
		},
		setExtensionStatusColorMode(key, colorMode) {
			updateConfig(saveExtensionStatusColorMode(key, colorMode));
		},
		requestRender: deps.requestRender,
	});
}
