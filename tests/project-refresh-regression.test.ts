import assert from "node:assert/strict";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, test, vi } from "vitest";
import { defaultConfig } from "../extensions/hud/config/schema.ts";
import { readGitStatus } from "../extensions/hud/segments/git.ts";
import { readRuntimeInfo, type RuntimeReadResult } from "../extensions/hud/segments/runtime.ts";
import { SessionLifecycle } from "../extensions/hud/session/lifecycle.ts";
import type { FooterState } from "../extensions/hud/state/index.ts";
import { createProjectStateController } from "../extensions/hud/state/project-controller.ts";

vi.mock("../extensions/hud/segments/git.ts", () => ({ readGitStatus: vi.fn() }));
vi.mock("../extensions/hud/segments/runtime.ts", () => ({ readRuntimeInfo: vi.fn() }));
vi.mock("../extensions/hud/segments/package-version.ts", () => ({
	readPackageVersionResult: vi.fn(async () => ({ kind: "ok", result: null })),
}));
vi.mock("../extensions/hud/config/config-counts.ts", () => ({
	countConfigEntries: vi.fn(() => ({
		instructionFiles: { agentsMd: 1, claudeMd: 0, total: 1 },
		packages: 2,
		mcpServers: 3,
	})),
}));

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(readGitStatus).mockResolvedValue({ kind: "error" });
	vi.mocked(readRuntimeInfo).mockResolvedValue({ kind: "ok" });
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.resetAllMocks();
});

function setup() {
	const lifecycle = new SessionLifecycle();
	lifecycle.start();
	const state = { configCounts: { packages: 0 } } as FooterState;
	const requestRender = vi.fn();
	const controller = createProjectStateController({
		state,
		lifecycle,
		getConfig: () => ({ ...defaultConfig, projectRefreshIntervalMs: 10_000 }),
		requestRender,
	});
	const ctx = { cwd: "/mock/project" } as ExtensionContext;
	return { lifecycle, state, requestRender, controller, ctx };
}

function deferRuntime() {
	let resolve!: (value: RuntimeReadResult) => void;
	const promise = new Promise<RuntimeReadResult>((done) => {
		resolve = done;
	});
	vi.mocked(readRuntimeInfo).mockReturnValueOnce(promise);
	return (version: string) =>
		resolve({
			kind: "ok",
			runtime: { name: "python", symbol: "py", style: "yellow", version },
		});
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

test("stop invalidates in-flight refresh without changing session generation", async () => {
	const { controller, ctx, lifecycle, state, requestRender } = setup();
	const generation = lifecycle.currentGeneration();
	const resolveOld = deferRuntime();
	controller.start(ctx);
	controller.stop();
	resolveOld("old");
	await flush();
	assert.equal(lifecycle.currentGeneration(), generation);
	assert.equal(state.runtime, undefined);
	assert.equal(state.configCounts.packages, 0);
	assert.equal(requestRender.mock.calls.length, 0);
});

test("same-session restart commits only new work, even if old work completes last", async () => {
	const { controller, ctx, state, requestRender } = setup();
	const resolveOld = deferRuntime();
	const resolveNew = deferRuntime();
	controller.start(ctx);
	controller.start(ctx);
	resolveNew("new");
	await flush();
	assert.equal(state.runtime?.version, "new");
	assert.equal(requestRender.mock.calls.length, 1);
	resolveOld("old");
	await flush();
	assert.equal(state.runtime?.version, "new");
	assert.equal(requestRender.mock.calls.length, 1);
	controller.stop();
});

test("reset discards old work and permits a fresh scheduled refresh", async () => {
	const { controller, ctx, state } = setup();
	const resolveOld = deferRuntime();
	controller.schedule(ctx);
	controller.reset();
	resolveOld("old");
	await flush();
	assert.equal(state.runtime, undefined);
	assert.equal(state.configCounts.packages, 0);
	controller.schedule(ctx);
	await flush();
	assert.equal(vi.mocked(readRuntimeInfo).mock.calls.length, 2);
	assert.equal(state.configCounts.packages, 2);
	controller.stop();
});

test("start still schedules immediately and polls; schedule remains usable after stop", async () => {
	const { controller, ctx, state } = setup();
	controller.start(ctx);
	await flush();
	assert.equal(state.configCounts.packages, 2);
	assert.equal(vi.mocked(readRuntimeInfo).mock.calls.length, 1);
	await vi.advanceTimersByTimeAsync(10_000);
	assert.equal(vi.mocked(readRuntimeInfo).mock.calls.length, 2);
	controller.stop();
	await vi.advanceTimersByTimeAsync(20_000);
	assert.equal(vi.mocked(readRuntimeInfo).mock.calls.length, 2);
	controller.schedule(ctx);
	await flush();
	assert.equal(vi.mocked(readRuntimeInfo).mock.calls.length, 3);
	controller.stop();
});
