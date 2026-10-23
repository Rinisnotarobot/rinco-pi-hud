import type { ExtensionAPI, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mergeConfig } from "../extensions/hud/config/normalize.ts";
import type { PolishedTuiConfig } from "../extensions/hud/config/schema.ts";
import registerHud from "../extensions/hud/index.ts";

const mocked = vi.hoisted(() => ({
	config: undefined as PolishedTuiConfig | undefined,
	settings: undefined as
		| undefined
		| {
				setConfig(config: PolishedTuiConfig): void;
				applyConfiguredUi(ctx: ExtensionContext): void;
		  },
	project: { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), schedule: vi.fn() },
}));
vi.mock("../extensions/hud/config/config.js", async (original) => ({
	...(await original<object>()),
	loadConfig: () => mocked.config,
	ensureConfigExists() {},
}));
vi.mock("../extensions/hud/commands/settings-controller.js", () => ({
	registerSettingsController: (_pi: unknown, deps: typeof mocked.settings) => {
		mocked.settings = deps;
	},
}));
vi.mock("../extensions/hud/state/project-controller.js", () => ({
	createProjectStateController: () => mocked.project,
}));
vi.mock("../extensions/hud/telemetry/codex-usage/index.js", () => ({ default() {} }));

type Factory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;
type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
function harness() {
	const handlers = new Map<string, Handler[]>();
	const bus = new Map<string, Array<(value: unknown) => void>>();
	let component: ReturnType<Factory> | undefined;
	const exec = vi.fn(async () => ({ code: 1, stdout: "", stderr: "", killed: false }));
	const getAllTools = vi.fn<() => ToolInfo[]>(() => []);
	const pi = {
		on(name: string, handler: Handler) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
		events: {
			on(name: string, handler: (value: unknown) => void) {
				bus.set(name, [...(bus.get(name) ?? []), handler]);
			},
		},
		getAllTools,
		getCommands: () => [],
		getThinkingLevel: () => "off",
		exec,
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: true,
		cwd: "/repo",
		getContextUsage: () => undefined,
		sessionManager: { getBranch: () => [], getEntries: () => [], getSessionName: () => "Test" },
		ui: {
			setFooter(factory: Factory | undefined) {
				component?.dispose?.();
				component = factory?.(
					{ requestRender() {} } as never,
					{ fg: (_role: string, text: string) => text, bold: (text: string) => text } as never,
					{ getExtensionStatuses: () => new Map(), onBranchChange: () => () => {} } as never,
				);
			},
		},
	} as unknown as ExtensionContext;
	registerHud(pi);
	return {
		exec,
		getAllTools,
		ctx,
		emit: async (name: string) => {
			for (const handler of handlers.get(name) ?? []) await handler({}, ctx);
		},
		publish: (name: string, value: unknown) => {
			for (const handler of bus.get(name) ?? []) handler(value);
		},
		render: () => component?.render(100).join("\n") ?? "",
		displace: () => {
			component?.dispose?.();
			component = undefined;
		},
		configure: (input: unknown) => {
			mocked.config = mergeConfig(input);
			mocked.settings!.setConfig(mocked.config);
			mocked.settings!.applyConfiguredUi(ctx);
		},
	};
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	mocked.config = mergeConfig({ footerFormat: "$quota", footerVariables: { quota: "pkg:q" } });
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

it("gates publications through current ownership and clears values on disable/replacement/shutdown", async () => {
	const h = harness();
	const capability = () => {
		const value = { active: false, supported: false, key: "pkg:q" };
		h.publish("zentui:variable-capability", value);
		return value.active;
	};
	expect(capability()).toBe(false);
	await h.emit("session_start");
	expect(capability()).toBe(true);
	h.publish("zentui:variable", { key: "pkg:q", text: "FIRST" });
	expect(h.render()).toContain("FIRST");
	h.configure({ footerFormat: "$quota $time", footerVariables: { quota: "pkg:q" } });
	await h.emit("agent_end"); // Mirrors the controller's normal clock resynchronization.
	mocked.project.schedule.mockClear();
	expect(vi.getTimerCount()).toBeGreaterThan(0);
	h.displace();
	expect(vi.getTimerCount()).toBe(0);
	await h.emit("agent_end");
	expect(mocked.project.schedule).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
	expect(capability()).toBe(false);
	h.configure({
		features: { statusLine: false },
		footerFormat: "$quota",
		footerVariables: { quota: "pkg:q" },
	});
	h.configure({ footerFormat: "$quota", footerVariables: { quota: "pkg:q" } });
	expect(capability()).toBe(true);
	expect(h.render()).not.toContain("FIRST");
	h.publish("zentui:variable", { key: "pkg:q", text: "SECOND" });
	await h.emit("session_start");
	expect(h.render()).not.toContain("SECOND");
	await h.emit("session_shutdown");
	expect(capability()).toBe(false);
});

it("never runs GitHub for defaults, hidden/native mode or a publisher-owned ci alias", async () => {
	const h = harness();
	await h.emit("session_start");
	expect(h.exec).not.toHaveBeenCalled();
	h.configure({ footerFormat: "$ci", footerVariables: { ci: "pkg:ci" } });
	expect(h.exec).not.toHaveBeenCalled();
	h.configure({ footerStyle: "hidden", footerFormat: "$ci" });
	expect(h.exec).not.toHaveBeenCalled();
	h.configure({ features: { statusLine: false }, footerFormat: "$ci" });
	expect(h.exec).not.toHaveBeenCalled();
	h.configure({ footerFormat: "$ci" });
	await Promise.resolve();
	expect(h.exec).toHaveBeenCalled();
	await h.emit("session_shutdown");
});

it("wires MCP rendering to Pi's current tool registry rather than project refresh state", async () => {
	const h = harness();
	h.configure({ footerFormat: "$mcp" });
	await h.emit("session_start");
	expect(h.render().trim()).toBe("");
	const tool = {
		name: "mcp__runtime__search",
		namespace: { name: "mcp__runtime" },
		exposure: "codemode",
	} as ToolInfo;
	h.getAllTools.mockReturnValue([tool]);
	expect(h.render().trim()).toBe("MCP 1");
	h.getAllTools.mockReturnValue([{ ...tool, exposure: "hidden" }]);
	expect(h.render().trim()).toBe("");
	await h.emit("session_shutdown");
});
