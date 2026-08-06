/**
 * Zentui config schema: types, format-string vocabulary, and defaults.
 *
 * Pure data/types module — no file I/O, no normalization logic. Parsing
 * untrusted JSON into this shape lives in `normalize.ts`; reading/writing the
 * config file lives in `file-io.ts`.
 */
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { NERD_DEFAULT_ICONS, type ResolvedIcons } from "../ui/icons.js";

export type ColorSpec = string;
export type ColorSource = "theme" | "terminal";
export type { IconMode } from "../ui/icons.js";

export type ContextStyle = "text" | "gauge" | "text+gauge";
export type SeparatorStyle = "pipe" | "dot" | "chevron" | "none";

export type ContextThresholds = {
	warning: number;
	error: number;
};

export type PathDisplayMode = "basename" | "full";

export type PathDisplayConfig = {
	mode: PathDisplayMode;
	/** Trailing directories to show in full mode. 0 = unlimited; clamped to 0..5. */
	depth: number;
};

export type GitBranchMaxLength = "full" | number;

export type GitBranchConfig = {
	maxLength: GitBranchMaxLength;
};

export type ColorSourcesConfig = {
	starship: ColorSource;
};

export type UiFeaturesConfig = {
	statusLine: boolean;
};

export type FooterSegmentsConfig = {
	cwd: boolean;
	gitBranch: boolean;
	gitStatus: boolean;
	gitCounts: boolean;
	gitCommit: boolean;
	gitMetrics: boolean;
	runtime: boolean;
	context: boolean;
	tokens: boolean;
	cost: boolean;
	sessionDuration: boolean;
	username: boolean;
	time: boolean;
	os: boolean;
	packageVersion: boolean;
	sessionName: boolean;
	model: boolean;
	thinking: boolean;
	turnCount: boolean;
	cacheDetails: boolean;
	codexUsage: boolean;
	configCounts: boolean;
	skills: boolean;
	mcp: boolean;
	toolActivity: boolean;
	agentActivity: boolean;
};

export type ExtensionStatusPlacement = "off" | "left" | "middle" | "right";
export type ExtensionStatusColorMode = "zentui" | "original";

/**
 * Starship `git_commit`-style options.
 * See https://starship.rs/config/#git-commit
 */
export type GitCommitConfig = {
	hashLength: number;
	onlyDetached: boolean;
	showTag: boolean;
};

/**
 * Starship `git_metrics`-style options.
 * See https://starship.rs/config/#git-metrics
 */
export type GitMetricsConfig = {
	onlyNonzero: boolean;
	ignoreSubmodules: boolean;
};

export const DEFAULT_EXTENSION_STATUS_COLOR_MODE: ExtensionStatusColorMode = "zentui";

export type ExtensionStatusesConfig = {
	defaultPlacement: ExtensionStatusPlacement;
	placements: Record<string, ExtensionStatusPlacement>;
	colorModes: Record<string, ExtensionStatusColorMode>;
};

export const DEFAULT_PROJECT_REFRESH_INTERVAL_MS = 30_000;
export const MIN_PROJECT_REFRESH_INTERVAL_MS = 5_000;

export type PolishedTuiConfig = {
	projectRefreshIntervalMs: number;
	footerFormat: string;
	separator: SeparatorStyle;
	contextStyle: ContextStyle;
	contextThresholds: ContextThresholds;
	pathDisplay: PathDisplayConfig;
	gitBranch: GitBranchConfig;
	icons: ResolvedIcons;
	colors: {
		cwd: ColorSpec;
		gitBranch: ColorSpec;
		gitStatus: ColorSpec;
		contextNormal: ColorSpec;
		contextWarning: ColorSpec;
		contextError: ColorSpec;
		tokens: ColorSpec;
		cost: ColorSpec;
		separator: ColorSpec;
		runtimePrefix: ColorSpec;
		extensionStatus: ColorSpec;
		sessionDuration: ColorSpec;
		packageVersion: ColorSpec;
		gitCommit: ColorSpec;
		gitMetricsAdded: ColorSpec;
		gitMetricsDeleted: ColorSpec;
		username: ColorSpec;
		time: ColorSpec;
		os: ColorSpec;
		muted: ColorSpec;
	};
	colorSources: ColorSourcesConfig;
	features: UiFeaturesConfig;
	footerSegments: FooterSegmentsConfig;
	gitCommit: GitCommitConfig;
	gitMetrics: GitMetricsConfig;
	extensionStatuses: ExtensionStatusesConfig;
};

/**
 * Canonical footer format variable names. In a `footerFormat` string these
 * are written as `$name` or `${name}`.
 */
export const FOOTER_FORMAT_VARIABLES = [
	"cwd",
	"git_branch",
	"git_status",
	"git_state",
	"runtime",
	"session_duration",
	"username",
	"os",
	"time",
	"context",
	"tokens",
	"cost",
	"package",
	"package_version",
	"git_commit",
	"git_tag",
	"git_metrics",
	"git_added",
	"git_deleted",
	"session_name",
	"model",
	"provider",
	"model_id",
	"thinking",
	"turn",
	"cache_read",
	"cache_write",
	"cache_hit",
	"codex_usage",
	"instruction_files",
	"agents_files",
	"claude_files",
	"skills",
	"active_skills",
	"extensions",
	"mcp",
	"tool_counts",
	"running_tools",
	"active_agents",
	"sep",
] as const;

/**
 * Alias → canonical variable name mapping for `footerFormat`.
 * `$fill` is special (not a variable) and handled by the parser.
 */
export const FOOTER_FORMAT_ALIASES: Record<string, string> = {
	directory: "cwd",
	branch: "git_branch",
	status: "git_status",
	state: "git_state",
	commit: "git_commit",
	tag: "git_tag",
	duration: "session_duration",
	session: "session_name",
	thinking_level: "thinking",
	turn_count: "turn",
	codex: "codex_usage",
	tools: "tool_counts",
	agents: "active_agents",
	separator: "sep",
};

export const configPath = join(getAgentDir(), "rinco-pi-hud.json");

export const defaultConfig: PolishedTuiConfig = {
	projectRefreshIntervalMs: DEFAULT_PROJECT_REFRESH_INTERVAL_MS,
	footerFormat: "",
	separator: "chevron",
	contextStyle: "text+gauge",
	contextThresholds: { warning: 70, error: 90 },
	pathDisplay: { mode: "basename", depth: 0 },
	gitBranch: { maxLength: 30 },
	icons: {
		mode: "auto",
		...NERD_DEFAULT_ICONS,
	},
	colors: {
		cwd: "bold #F2A7C6",
		gitBranch: "bold #C7B8F5",
		gitStatus: "bold #F6BC9A",
		contextNormal: "#AEE5C5",
		contextWarning: "bold #F3D98B",
		contextError: "bold #FF8FA3",
		tokens: "#A99BAE",
		cost: "bold #AEE5C5",
		separator: "#716879",
		runtimePrefix: "#9FD3F2",
		extensionStatus: "#EFC3E6",
		sessionDuration: "#F3D98B",
		packageVersion: "#F6BC9A",
		gitCommit: "#AEE5C5",
		gitMetricsAdded: "#AEE5C5",
		gitMetricsDeleted: "#FF8FA3",
		username: "#F3D98B",
		time: "#F3D98B",
		os: "#F7EEF8",
		muted: "#A99BAE",
	},
	colorSources: {
		starship: "terminal",
	},
	features: {
		statusLine: true,
	},
	footerSegments: {
		cwd: true,
		gitBranch: true,
		gitStatus: true,
		gitCounts: false,
		runtime: true,
		context: true,
		tokens: true,
		cost: true,
		sessionDuration: false,
		username: false,
		time: false,
		os: true,
		packageVersion: false,
		gitCommit: false,
		gitMetrics: false,
		sessionName: true,
		model: true,
		thinking: true,
		turnCount: true,
		cacheDetails: true,
		codexUsage: true,
		configCounts: false,
		skills: true,
		mcp: true,
		toolActivity: true,
		agentActivity: true,
	},
	gitCommit: {
		hashLength: 7,
		onlyDetached: true,
		showTag: true,
	},
	gitMetrics: {
		onlyNonzero: true,
		ignoreSubmodules: false,
	},
	extensionStatuses: {
		defaultPlacement: "right",
		placements: {
			"dual-subscription-quota": "left",
			"codex-goal": "middle",
			"xai-usage": "right",
		},
		colorModes: {},
	},
};
