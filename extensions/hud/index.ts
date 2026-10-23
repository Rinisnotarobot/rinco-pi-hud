import type { ExtensionAPI, ExtensionContext, Skill } from "@earendil-works/pi-coding-agent";
import registerCodexUsage from "./telemetry/codex-usage/index.js";
import { ensureConfigExists, loadConfig, type PolishedTuiConfig } from "./config/config.js";
import { installFooter } from "./footer/index.js";
import { buildSessionDurationLabel } from "./telemetry/format.js";
import { footerClockNeeds } from "./session/footer-clock.js";
import { demandedPublisherKeys, footerTemplateReferences } from "./footer/demand.js";
import { CustomVariables } from "./segments/custom-variables.js";
import { createLiveMetadata } from "./segments/live-metadata.js";
import { FooterTelemetryController } from "./telemetry/optional.js";
import { emptyGitStatus } from "./segments/git.js";
import { getMcpServerCount } from "./segments/mcp-status.js";
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
	let footerOwned = false;
	let currentContext: ExtensionContext | undefined;
	let stopSessionTimer: () => void = () => {};
	let lastDurationLabel = "";
	let sessionTimerKey = "";

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
	const optionalTelemetry = new FooterTelemetryController();
	let templateValues = new Map<string, string>();
	const metadataDemand = () => {
		const references = footerTemplateReferences(currentConfig);
		// A valid explicit ci alias owns this name, and must not trigger GitHub.
		if (Object.hasOwn(currentConfig.footerVariables, "ci")) references.delete("ci");
		return references;
	};
	const metadata = createLiveMetadata(pi, {
		getDemand: metadataDemand,
		isActive: () => footerInstalled && footerOwned && sessionLifecycle.isCurrent(),
		onChange: refresh,
	});
	const customVariables = new CustomVariables(
		pi.events,
		(key) => {
			if (!footerInstalled || !footerOwned || !sessionLifecycle.isCurrent()) return false;
			const keys = demandedPublisherKeys(currentConfig);
			return key === undefined ? keys.size > 0 : keys.has(key);
		},
		refresh,
	);
	const syncFooterState = (ctx: ExtensionContext) => {
		currentContext = ctx;
		syncState(state, ctx, currentConfig.icons.cacheHit);
		const references =
			footerInstalled && footerOwned ? footerTemplateReferences(currentConfig) : new Set<string>();
		const optional = optionalTelemetry.resolve(ctx, {
			subscription: references.has("subscription"),
			autoCompaction: references.has("auto_compaction"),
		});
		templateValues = new Map([
			["subscription", optional.subscription ? "(sub)" : ""],
			["auto_compaction", optional.autoCompaction ? "(auto)" : ""],
		]);
		metadata.sync(ctx);
	};
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
		onRefresh: () => {
			if (currentContext) metadata.sync(currentContext);
		},
	});
	const scheduleProjectRefresh = (ctx: ExtensionContext) => {
		if (
			footerInstalled &&
			footerOwned &&
			currentConfig.features.statusLine &&
			currentConfig.footerStyle !== "hidden"
		) {
			projectController.schedule(ctx);
		}
	};

	const refreshInteractiveState = (ctx: ExtensionContext, project = false) => {
		if (!sessionLifecycle.isCurrent() || !ctx.hasUI) return;
		syncFooterState(ctx);
		startSessionTimer();
		if (project && currentConfig.features.statusLine && currentConfig.footerStyle !== "hidden")
			scheduleProjectRefresh(ctx);
		refresh();
	};

	const startSessionTimer = () => {
		const needs = footerClockNeeds(
			currentConfig,
			state.telemetry.tools.some((tool) => tool.status === "running"),
		);
		const key = footerInstalled && footerOwned ? JSON.stringify(needs) : "";
		if (sessionTimerKey === key) return;
		stopSessionTimer();
		sessionTimerKey = key;
		lastDurationLabel = state.sessionStartEpoch
			? buildSessionDurationLabel(state.sessionStartEpoch)
			: "";
		const {
			wallClock: needsWallClock,
			duration: needsDuration,
			activity: needsActivityClock,
		} = needs;
		if (
			!footerInstalled ||
			!footerOwned ||
			!(needsWallClock || needsDuration || needsActivityClock)
		)
			return;

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
			sessionTimerKey = "";
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
			getMcpServerCount: () => getMcpServerCount(pi),
			getCustomValues: () => customVariables.snapshot(),
			getTemplateValues: () => new Map([...templateValues, ...metadata.values()]),
			setOwnership(owned) {
				footerOwned = owned;
				customVariables.reconcile();
				if (!owned) {
					stopSessionTimer();
					metadata.stop();
					projectController.stop();
				} else if (footerInstalled && currentContext) {
					syncFooterState(currentContext);
					startSessionTimer();
					if (currentConfig.footerStyle !== "hidden") projectController.start(currentContext);
				}
			},
		});
		footerInstalled = true;
		syncFooterState(ctx);
		refresh();
		startSessionTimer();
	};

	const uninstallStatusLine = (ctx: ExtensionContext) => {
		stopSessionTimer();
		projectController.stop();
		ctx.ui.setFooter(undefined);
		footerInstalled = false;
		footerOwned = false;
		customVariables.clear();
		metadata.stop();
		requestFooterRender = undefined;
		getActiveExtensionStatuses = () => new Map();
	};

	const applyConfiguredUi = (ctx: ExtensionContext) => {
		if (!isTuiContext(ctx)) return;
		if (currentConfig.features.statusLine) {
			installStatusLine(ctx);
			if (currentConfig.footerStyle === "hidden") projectController.stop();
			else if (footerOwned) projectController.start(ctx);
		} else if (footerInstalled) uninstallStatusLine(ctx);
	};

	const installUi = (ctx: ExtensionContext) => {
		if (!isTuiContext(ctx)) return;
		footerInstalled = false;
		footerOwned = false;
		customVariables.clear();
		metadata.reset();
		optionalTelemetry.reset();
		state.repositoryRoot = undefined;
		state.repositoryCwd = undefined;
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
		footerOwned = false;
		customVariables.clear();
		metadata.stop();
		optionalTelemetry.reset();
		currentContext = undefined;
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
			customVariables.reconcile();
			if (currentContext) syncFooterState(currentContext);
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
