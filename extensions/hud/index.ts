import type { ExtensionAPI, ExtensionContext, Skill } from "@earendil-works/pi-coding-agent";
import registerCodexUsage from "./telemetry/codex-usage/index.js";
import { ensureConfigExists, loadConfig, type PolishedTuiConfig } from "./config/config.js";
import { installFooter } from "./footer/index.js";
import { buildSessionDurationLabel } from "./telemetry/format.js";
import { emptyGitStatus } from "./segments/git.js";
import { LiveContextController } from "./session/live-context.js";
import { createProjectStateController } from "./state/project-controller.js";
import { isLiveExtensionContext } from "./session/context.js";
import { registerSessionEventHandlers } from "./session/event-handlers.js";
import { SessionLifecycle } from "./session/lifecycle.js";
import { SkillActivityTracker, type SkillReference } from "./segments/skill-activity.js";
import { registerSettingsController } from "./commands/settings-controller.js";
import { createInitialState, type FooterState, syncState } from "./state/index.js";

function isTuiContext(ctx: ExtensionContext): boolean {
	try {
		const mode = (ctx as ExtensionContext & { mode?: string }).mode;
		return ctx.hasUI && (mode === undefined || mode === "tui");
	} catch {
		return false;
	}
}

export default function (pi: ExtensionAPI) {
	const state: FooterState = createInitialState(emptyGitStatus());
	const sessionLifecycle = new SessionLifecycle();
	const skillActivity = new SkillActivityTracker();

	let currentConfig: PolishedTuiConfig = loadConfig();
	let requestFooterRender: (() => void) | undefined;
	let getActiveExtensionStatuses: () => ReadonlyMap<string, string> = () => new Map();
	let footerInstalled = false;
	let stopSessionTimer: () => void = () => {};
	let lastDurationLabel = "";

	const refresh = () => {
		if (sessionLifecycle.isCurrent()) requestFooterRender?.();
	};
	// Pi hands every event handler a brand-new ctx object, so identity comparisons
	// with the session_start ctx would silently drop later updates.
	const isActiveSessionContext = (ctx: ExtensionContext): boolean => {
		return sessionLifecycle.isCurrent() && isLiveExtensionContext(ctx);
	};
	const liveContext = new LiveContextController(sessionLifecycle, refresh);
	const getCurrentConfig = () => currentConfig;
	const syncFooterState = (ctx: ExtensionContext) =>
		syncState(state, ctx, currentConfig.icons.cacheHit);
	const availableSkillReferences = (promptSkills: readonly Skill[] = []): SkillReference[] => {
		const byName = new Map<string, SkillReference>();
		try {
			for (const command of pi.getCommands()) {
				if (command.source !== "skill" || !command.name.startsWith("skill:")) continue;
				const name = command.name.slice("skill:".length);
				if (name && command.sourceInfo.path) {
					byName.set(name, { name, filePath: command.sourceInfo.path });
				}
			}
		} catch {}
		for (const skill of promptSkills) {
			byName.set(skill.name, { name: skill.name, filePath: skill.filePath });
		}
		return [...byName.values()];
	};
	const updateSkillCounts = (ctx: ExtensionContext, promptSkills: readonly Skill[] = []) => {
		skillActivity.syncAvailable(availableSkillReferences(promptSkills), ctx.cwd);
		state.skillCounts = skillActivity.counts();
	};
	const restoreSkillActivity = (ctx: ExtensionContext) => {
		updateSkillCounts(ctx);
		skillActivity.restoreFromEntries(ctx.sessionManager.getBranch(), ctx.cwd);
		state.skillCounts = skillActivity.counts();
	};

	const projectController = createProjectStateController({
		state,
		lifecycle: sessionLifecycle,
		getConfig: getCurrentConfig,
		requestRender: refresh,
	});
	const scheduleProjectRefresh = projectController.schedule;

	const refreshInteractiveState = (ctx: ExtensionContext, project = false) => {
		if (!sessionLifecycle.isCurrent() || !ctx.hasUI) return;
		syncFooterState(ctx);
		if (project && currentConfig.features.statusLine) scheduleProjectRefresh(ctx);
		refresh();
	};

	const startSessionTimer = () => {
		stopSessionTimer();
		lastDurationLabel = "";
		const segments = currentConfig.footerSegments;
		const format = currentConfig.footerFormat ?? "";
		const needsWallClock = segments.time || /\$\{?time\b/.test(format);
		const needsDuration =
			segments.sessionDuration || /\$\{?(?:session_duration|duration)\b/.test(format);
		const needsActivityClock = segments.runningTools || /\$\{?running_tools\b/.test(format);
		if (
			!currentConfig.features.statusLine ||
			!(needsWallClock || needsDuration || needsActivityClock)
		) return;

		const timer = setInterval(() => {
			if (!sessionLifecycle.isCurrent()) return;
			if (needsWallClock || needsActivityClock) {
				refresh();
				return;
			}
			const label = state.sessionStartEpoch
				? buildSessionDurationLabel(state.sessionStartEpoch)
				: "";
			if (label === lastDurationLabel) return;
			lastDurationLabel = label;
			refresh();
		}, 1000);
		timer.unref?.();
		stopSessionTimer = () => {
			clearInterval(timer);
			stopSessionTimer = () => {};
		};
	};

	const installStatusLine = (ctx: ExtensionContext) => {
		if (footerInstalled) return;
		installFooter(ctx, state, getCurrentConfig, {
			setRequestRender: (fn) => {
				requestFooterRender = fn;
			},
			scheduleProjectRefresh,
			setExtensionStatusesGetter(fn) {
				getActiveExtensionStatuses = fn ?? (() => new Map());
			},
			getLiveContext: () => liveContext.get(),
		});
		footerInstalled = true;
		projectController.start(ctx);
		refresh();
		startSessionTimer();
	};

	const uninstallStatusLine = (ctx: ExtensionContext) => {
		stopSessionTimer();
		projectController.stop();
		ctx.ui.setFooter(undefined);
		footerInstalled = false;
		requestFooterRender = undefined;
		getActiveExtensionStatuses = () => new Map();
	};

	const applyConfiguredUi = (ctx: ExtensionContext) => {
		if (!isTuiContext(ctx)) return;
		if (currentConfig.features.statusLine) installStatusLine(ctx);
		else if (footerInstalled) uninstallStatusLine(ctx);
	};

	const installUi = (ctx: ExtensionContext) => {
		if (!isTuiContext(ctx)) return;
		footerInstalled = false;
		ensureConfigExists();
		currentConfig = loadConfig();
		syncFooterState(ctx);
		projectController.stop();
		applyConfiguredUi(ctx);
		refresh();
	};

	const cleanupUi = (ctx?: ExtensionContext) => {
		if (!ctx || !sessionLifecycle.isCurrent()) return;
		sessionLifecycle.shutdown();
		stopSessionTimer();
		projectController.stop();
		requestFooterRender = undefined;
		getActiveExtensionStatuses = () => new Map();
		if (isTuiContext(ctx)) ctx.ui.setFooter(undefined);
		footerInstalled = false;
	};

	registerSessionEventHandlers(pi, {
		state,
		lifecycle: sessionLifecycle,
		liveContext,
		skillActivity,
		updateSkillCounts,
		restoreSkillActivity,
		installUi,
		cleanupUi,
		resetProjectState: projectController.reset,
		refresh,
		refreshInteractiveState,
	});

	registerSettingsController(pi, {
		getConfig: getCurrentConfig,
		setConfig(config) {
			currentConfig = config;
		},
		applyConfiguredUi,
		restartSessionTimer: startSessionTimer,
		getActiveExtensionStatuses: () => getActiveExtensionStatuses(),
		requestRender: refresh,
	});

	registerCodexUsage(pi, (ctx, value) => {
		if (!isActiveSessionContext(ctx)) return;
		state.codexUsageStatus = value;
		refresh();
	});
}
