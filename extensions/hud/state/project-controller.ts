import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { countConfigEntries } from "../config/config-counts.js";
import type { PolishedTuiConfig } from "../config/config.js";
import { readGitStatus } from "../segments/git.js";
import { readPackageVersionResult } from "../segments/package-version.js";
import { applyProjectRefreshToState } from "../segments/project-state.js";
import { readRuntimeInfo } from "../segments/runtime.js";
import type { SessionLifecycle } from "../session/lifecycle.js";
import type { FooterState } from "./index.js";
import {
	createProjectRefreshScheduler,
	type ScheduleProjectRefreshOptions,
	type StopProjectRefreshInterval,
	startProjectRefreshInterval,
} from "./project-refresh.js";

interface ProjectRefreshTarget {
	cwd: string;
	generation: number;
}

export interface ProjectStateController {
	reset(): void;
	schedule(ctx: ExtensionContext, options?: ScheduleProjectRefreshOptions): void;
	start(ctx: ExtensionContext): void;
	stop(): void;
}

interface ProjectStateControllerDeps {
	state: FooterState;
	lifecycle: SessionLifecycle;
	getConfig: () => PolishedTuiConfig;
	requestRender: () => void;
}

/** Own project polling, throttling, and stale-session protection. */
export function createProjectStateController({
	state,
	lifecycle,
	getConfig,
	requestRender,
}: ProjectStateControllerDeps): ProjectStateController {
	let stopInterval: StopProjectRefreshInterval = () => {};
	let lastProjectCwd: string | undefined;

	const refreshProjectState = async ({ cwd, generation }: ProjectRefreshTarget): Promise<void> => {
		if (!lifecycle.isCurrent(generation)) return;
		const config = getConfig();
		const format = config.footerFormat;
		const formatNeedsTag = /\$\{?(?:git_tag|tag)\b/.test(format);
		const formatNeedsCommit = /\$\{?(?:git_commit|commit)\b/.test(format);
		const formatNeedsMetrics = /\$\{?(?:git_metrics|git_added|git_deleted)\b/.test(format);
		const formatNeedsPackage = /\$\{?(?:package|package_version)\b/.test(format);
		const wantExactTag =
			((config.footerSegments.gitCommit || formatNeedsCommit) && config.gitCommit.showTag) ||
			formatNeedsTag;
		const wantMetrics = config.footerSegments.gitMetrics || formatNeedsMetrics;
		const wantPackage = config.footerSegments.packageVersion || formatNeedsPackage;
		const [git, runtime, packageVersion, configCounts] = await Promise.all([
			readGitStatus(cwd, {
				readExactTag: wantExactTag,
				readMetrics: wantMetrics,
				ignoreSubmodules: config.gitMetrics.ignoreSubmodules,
			}),
			readRuntimeInfo(cwd),
			wantPackage ? readPackageVersionResult(cwd) : Promise.resolve(undefined),
			Promise.resolve(countConfigEntries(cwd)),
		]);
		if (!lifecycle.isCurrent(generation)) return;
		state.configCounts = configCounts;
		lastProjectCwd = applyProjectRefreshToState(state, {
			cwd,
			previousCwd: lastProjectCwd,
			git,
			runtime,
			packageVersion,
		});
	};

	const scheduler = createProjectRefreshScheduler(refreshProjectState, requestRender);
	const stop = () => {
		stopInterval();
		stopInterval = () => {};
		scheduler.stop();
	};
	const schedule = (ctx: ExtensionContext, options?: ScheduleProjectRefreshOptions) => {
		const generation = lifecycle.currentGeneration();
		if (!lifecycle.isCurrent(generation)) return;
		scheduler.schedule({ cwd: ctx.cwd, generation }, options);
	};

	return {
		reset() {
			lastProjectCwd = undefined;
		},
		schedule,
		start(ctx) {
			stop();
			stopInterval = startProjectRefreshInterval(getConfig().projectRefreshIntervalMs, () =>
				schedule(ctx),
			);
			schedule(ctx, { force: true });
		},
		stop,
	};
}
