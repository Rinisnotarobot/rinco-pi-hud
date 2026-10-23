import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getUsageTotals,
	__resetUsageTotalsCacheForTests,
} from "../extensions/hud/telemetry/format.js";
import { SkillActivityTracker } from "../extensions/hud/segments/skill-activity.js";
import { queryUsage } from "../extensions/hud/telemetry/codex-usage/query.js";
import { registerSessionEventHandlers } from "../extensions/hud/session/event-handlers.js";
import { footerClockNeeds } from "../extensions/hud/session/footer-clock.js";
import { defaultConfig } from "../extensions/hud/config/config.js";

const usage = (cost: number) => ({
	input: 10,
	output: 5,
	cacheRead: 30,
	cacheWrite: 0,
	cost: { total: cost },
});
afterEach(() => {
	vi.unstubAllGlobals();
	__resetUsageTotalsCacheForTests();
});

describe("Pi 1.3 compatibility", () => {
	it("includes all billable entry kinds without replacing the latest assistant cache rate", () => {
		const entries = [
			{ type: "message", id: "1", message: { role: "assistant", usage: usage(1) } },
			{
				type: "message",
				id: "2",
				message: { role: "toolResult", usage: { ...usage(2), cacheRead: 0 } },
			},
			{ type: "compaction", id: "3", usage: usage(3) },
			{ type: "branch_summary", id: "4", usage: usage(4) },
			{ type: "usage", id: "5", usage: usage(5) },
		];
		const ctx = { sessionManager: { getEntries: () => entries, getBranch: () => entries } };
		expect(getUsageTotals(ctx as never)).toMatchObject({
			cost: 15,
			input: 50,
			output: 25,
			cacheRead: 120,
			latestCacheHitRate: 75,
		});
		entries[4]!.usage = usage(6);
		expect(getUsageTotals(ctx as never).cost).toBe(16);
	});
	it("restores successful nested skill reads, including reads inside a failed outer tool", () => {
		const tracker = new SkillActivityTracker();
		tracker.syncAvailable([{ name: "demo", filePath: "/tmp/demo/SKILL.md" }], "/tmp");
		const result = (calls: unknown[]) => [
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "codemode",
					isError: true,
					nestedCalls: { complete: false, calls },
				},
			},
		];
		tracker.restoreFromEntries(
			result([{ name: "read", status: "ok", args: { path: "/tmp/demo/SKILL.md" } }]),
			"/tmp",
		);
		expect(tracker.counts()?.active).toBe(1);
		tracker.restoreFromEntries(
			result([
				{ name: "read", status: "error", args: { path: "/tmp/demo/SKILL.md" } },
				{ name: "read", status: "ok" },
			]),
			"/tmp",
		);
		expect(tracker.counts()?.active).toBe(0);
	});
	it("omits null and non-whitelisted auth headers before fetch", async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						rate_limit: { primary_window: { used_percent: 20, limit_window_seconds: 18000 } },
					}),
				),
		);
		vi.stubGlobal("fetch", fetch);
		const model = { provider: "openai-codex", id: "test" };
		const ctx = {
			model,
			modelRegistry: {
				getAvailable: () => [],
				getAll: () => [],
				getApiKeyAndHeaders: async () => ({
					ok: true,
					apiKey: "test-key",
					headers: {
						Authorization: null,
						Accept: null,
						"ChatGPT-Account-Id": "account",
						Cookie: "private",
					},
				}),
			},
		};
		expect((await queryUsage(ctx as never, { timeoutMs: 1000 })).ok).toBe(true);
		const headers = new Headers(
			(fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
		);
		expect(headers.get("authorization")).toBe("Bearer test-key");
		expect(headers.get("accept")).toBeNull();
		expect(headers.get("cookie")).toBeNull();
		expect(headers.get("chatgpt-account-id")).toBe("account");
	});
	it("agent boundaries clear live context and refresh without changing telemetry", () => {
		const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
		const telemetry = Object.freeze({ tools: [] });
		const state = { telemetry };
		const clear = vi.fn();
		const refreshInteractiveState = vi.fn();
		registerSessionEventHandlers(
			{
				on: (name: string, fn: (event: unknown, ctx: unknown) => void) => handlers.set(name, fn),
			} as never,
			{ state, liveContext: { clear }, refreshInteractiveState } as never,
		);
		const ctx = { cwd: "/tmp" };
		handlers.get("agent_start")!({}, ctx);
		expect(clear).toHaveBeenCalledTimes(1);
		expect(refreshInteractiveState).toHaveBeenLastCalledWith(ctx);
		expect(state.telemetry).toBe(telemetry);
		handlers.get("agent_end")!({}, ctx);
		expect(clear).toHaveBeenCalledTimes(2);
		expect(refreshInteractiveState).toHaveBeenLastCalledWith(ctx, true);
		expect(state.telemetry).toBe(telemetry);
	});
	it("only parses user prompts in before_agent_start", () => {
		const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
		const activateFromPrompt = vi.fn();
		const updateSkillCounts = vi.fn();
		registerSessionEventHandlers(
			{
				on: (name: string, fn: (event: unknown, ctx: unknown) => void) => handlers.set(name, fn),
			} as never,
			{
				state: {},
				skillActivity: { activateFromPrompt, counts: () => ({ total: 0, active: 0 }) },
				updateSkillCounts,
				refreshInteractiveState: vi.fn(),
			} as never,
		);
		const handler = handlers.get("before_agent_start")!;
		handler(
			{ messageType: "custom", message: {}, systemPromptOptions: { skills: [] } },
			{ cwd: "/tmp" },
		);
		expect(activateFromPrompt).not.toHaveBeenCalled();
		handler(
			{ messageType: "user", prompt: "hello", systemPromptOptions: { skills: [] } },
			{ cwd: "/tmp" },
		);
		expect(activateFromPrompt).toHaveBeenCalledWith("hello", "/tmp");
		expect(updateSkillCounts).toHaveBeenCalledTimes(2);
	});
	it("the wall clock follows Session visibility independently of Usage and duration", () => {
		const config = structuredClone(defaultConfig);
		config.footerSegments.time = true;
		config.footerSegments.sessionDuration = false;
		config.footerRows.session = true;
		config.footerRows.usage = false;
		expect(footerClockNeeds(config, false).wallClock).toBe(true);
		expect(footerClockNeeds(config, false).duration).toBe(false);
		config.footerRows.session = false;
		config.footerRows.usage = true;
		expect(footerClockNeeds(config, false).wallClock).toBe(false);
		config.footerFormat = "$time";
		expect(footerClockNeeds(config, false).wallClock).toBe(true);
	});
	it("only refreshes clocks used by visible rows or the custom format", () => {
		const config = structuredClone(defaultConfig);
		config.footerRows = { project: false, session: false, activity: false, usage: false };
		expect(footerClockNeeds(config, true)).toEqual({
			wallClock: false,
			duration: false,
			activity: false,
		});
		config.footerFormat = "$cwd $tokens";
		expect(footerClockNeeds(config, true)).toEqual({
			wallClock: false,
			duration: false,
			activity: false,
		});
		config.footerFormat = "(${duration}) $time $running_tools";
		expect(footerClockNeeds(config, false)).toEqual({
			wallClock: true,
			duration: true,
			activity: false,
		});
		expect(footerClockNeeds(config, true).activity).toBe(true);
		config.features.statusLine = false;
		expect(footerClockNeeds(config, true)).toEqual({
			wallClock: false,
			duration: false,
			activity: false,
		});
	});
});
