import type { ExtensionAPI, ExtensionContext, Skill } from "@earendil-works/pi-coding-agent";
import type { SkillActivityTracker } from "../segments/skill-activity.js";
import type { FooterState } from "../state/index.js";
import { findToolTarget, resetTelemetryState, updateTelemetryState } from "../state/telemetry.js";
import { invalidateUsageTotalsCache } from "../telemetry/format.js";
import { isLiveExtensionContext } from "./context.js";
import type { SessionLifecycle } from "./lifecycle.js";
import type { LiveContextController } from "./live-context.js";

interface SessionEventHandlerDeps {
	state: FooterState;
	lifecycle: SessionLifecycle;
	liveContext: LiveContextController;
	skillActivity: SkillActivityTracker;
	updateSkillCounts: (ctx: ExtensionContext, promptSkills?: readonly Skill[]) => void;
	restoreSkillActivity: (ctx: ExtensionContext) => void;
	installUi: (ctx: ExtensionContext) => void;
	cleanupUi: (ctx: ExtensionContext) => void;
	resetProjectState: () => void;
	refresh: () => void;
	refreshInteractiveState: (ctx: ExtensionContext, project?: boolean) => void;
}

/** Register Pi lifecycle and telemetry events against the shared HUD controllers. */
export function registerSessionEventHandlers(
	pi: ExtensionAPI,
	deps: SessionEventHandlerDeps,
): void {
	const syncInteractiveState = (_event: unknown, ctx: ExtensionContext) => {
		deps.refreshInteractiveState(ctx);
	};
	const syncInteractiveAndProjectState = (_event: unknown, ctx: ExtensionContext) => {
		deps.refreshInteractiveState(ctx, true);
	};
	const syncInteractiveAndProjectStateWithUsage = (_event: unknown, ctx: ExtensionContext) => {
		invalidateUsageTotalsCache();
		deps.refreshInteractiveState(ctx, true);
	};

	pi.on("session_start", async (_event, ctx) => {
		deps.lifecycle.start();
		deps.liveContext.clear();
		deps.skillActivity.reset();
		deps.restoreSkillActivity(ctx);
		deps.state.sessionStartEpoch = Date.now();
		deps.state.codexUsageStatus = undefined;
		deps.state.telemetry = resetTelemetryState(deps.state.telemetry, {
			sessionName: ctx.sessionManager.getSessionName?.(),
			thinkingLevel: pi.getThinkingLevel(),
			modelSupportsReasoning: Boolean(ctx.model?.reasoning),
		});
		invalidateUsageTotalsCache();
		deps.resetProjectState();
		deps.installUi(ctx);
	});

	pi.on("resources_discover", (_event, ctx) => {
		deps.lifecycle.defer(() => {
			if (!deps.lifecycle.isCurrent() || !isLiveExtensionContext(ctx)) return;
			deps.updateSkillCounts(ctx);
			deps.refresh();
		});
	});

	pi.on("before_agent_start", (event, ctx) => {
		deps.updateSkillCounts(ctx, event.systemPromptOptions.skills ?? []);
		deps.skillActivity.activateFromPrompt(event.prompt, ctx.cwd);
		deps.state.skillCounts = deps.skillActivity.counts();
		deps.refreshInteractiveState(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		deps.liveContext.clear();
		deps.state.codexUsageStatus = undefined;
		deps.cleanupUi(ctx);
	});

	pi.on("agent_start", (event, ctx) => {
		deps.liveContext.clear();
		deps.state.telemetry = updateTelemetryState(deps.state.telemetry, {
			type: "agent-start",
			at: Date.now(),
		});
		syncInteractiveState(event, ctx);
	});
	pi.on("agent_end", (event, ctx) => {
		deps.liveContext.clear();
		deps.state.telemetry = updateTelemetryState(deps.state.telemetry, {
			type: "agent-end",
			at: Date.now(),
		});
		syncInteractiveAndProjectState(event, ctx);
	});
	pi.on("model_select", (event, ctx) => {
		deps.liveContext.clear();
		deps.state.telemetry = updateTelemetryState(deps.state.telemetry, {
			type: "metadata",
			modelSupportsReasoning: Boolean(event.model?.reasoning),
		});
		syncInteractiveState(event, ctx);
	});
	pi.on("thinking_level_select", (event, ctx) => {
		deps.state.telemetry = updateTelemetryState(deps.state.telemetry, {
			type: "metadata",
			thinkingLevel: event.level,
		});
		syncInteractiveState(event, ctx);
	});
	pi.on("session_info_changed", (event, ctx) => {
		deps.state.telemetry = updateTelemetryState(deps.state.telemetry, {
			type: "metadata",
			sessionName: event.name,
		});
		syncInteractiveState(event, ctx);
	});
	pi.on("turn_start", (event, ctx) => {
		deps.state.telemetry = updateTelemetryState(deps.state.telemetry, {
			type: "turn-start",
			turnIndex: event.turnIndex,
		});
		syncInteractiveState(event, ctx);
	});
	pi.on("message_update", (event) => {
		deps.liveContext.update(event.message);
	});
	pi.on("message_end", (event, ctx) => {
		if (
			event.message.role === "assistant" &&
			(event.message.stopReason === "error" || event.message.stopReason === "aborted")
		) {
			deps.liveContext.clear();
		}
		syncInteractiveAndProjectStateWithUsage(event, ctx);
	});
	pi.on("tool_execution_start", (event, ctx) => {
		deps.liveContext.clear();
		deps.state.telemetry = updateTelemetryState(deps.state.telemetry, {
			type: "tool-call",
			toolCallId: event.toolCallId,
			name: event.toolName,
			args:
				event.args && typeof event.args === "object"
					? (event.args as Record<string, unknown>)
					: undefined,
			at: Date.now(),
		});
		syncInteractiveState(event, ctx);
	});
	pi.on("tool_execution_end", (event, ctx) => {
		if (!event.isError && event.toolName === "read") {
			const path = findToolTarget(deps.state.telemetry, event.toolCallId);
			if (typeof path === "string") {
				deps.skillActivity.activateFromRead(path, ctx.cwd);
				deps.state.skillCounts = deps.skillActivity.counts();
			}
		}
		deps.state.telemetry = updateTelemetryState(deps.state.telemetry, {
			type: "tool-result",
			toolCallId: event.toolCallId,
			isError: event.isError,
			at: Date.now(),
		});
		syncInteractiveAndProjectState(event, ctx);
	});
	pi.on("session_compact", (event, ctx) => {
		deps.liveContext.clear();
		syncInteractiveAndProjectStateWithUsage(event, ctx);
	});
	pi.on("session_tree", (event, ctx) => {
		deps.liveContext.clear();
		deps.restoreSkillActivity(ctx);
		syncInteractiveAndProjectStateWithUsage(event, ctx);
	});
}
