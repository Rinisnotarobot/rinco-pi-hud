import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { mergeConfig } from "../extensions/hud/config/normalize.ts";
import {
	demandedPublisherKeys,
	footerTemplateReferences,
} from "../extensions/hud/footer/demand.ts";
import { installFooter } from "../extensions/hud/footer/index.ts";
import { CustomVariables } from "../extensions/hud/segments/custom-variables.ts";
import { sanitizeExtensionStatusOriginalText } from "../extensions/hud/segments/extension-status.ts";
import { emptyGitStatus } from "../extensions/hud/segments/git.ts";
import { footerClockNeeds } from "../extensions/hud/session/footer-clock.ts";
import { createInitialState } from "../extensions/hud/state/index.ts";
import { FooterTelemetryController } from "../extensions/hud/telemetry/optional.ts";

type Factory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;
function footer(input: unknown, published = new Map<string, string>()) {
	let config = mergeConfig(input);
	const state = createInitialState(emptyGitStatus());
	const statuses = new Map<string, string>();
	let component!: ReturnType<Factory>;
	const ownership = vi.fn();
	const theme = { fg: (_role: string, text: string) => text, bold: (text: string) => text };
	const ctx = {
		cwd: "/repo/packages/hud",
		getContextUsage: () => ({ percent: 25, contextWindow: 100_000 }),
		ui: {
			setFooter: (factory: Factory) => {
				component = factory(
					{ requestRender() {} } as never,
					theme as never,
					{
						getExtensionStatuses: () => statuses,
						onBranchChange: () => () => {},
					} as never,
				);
			},
		},
	} as unknown as ExtensionContext;
	installFooter(ctx, state, () => config, {
		setRequestRender() {},
		scheduleProjectRefresh() {},
		getCustomValues: () => published,
		getTemplateValues: () =>
			new Map([
				["pr_number", "42"],
				["token_rate", "48 tok/s avg"],
			]),
		setOwnership: ownership,
	});
	return {
		state,
		statuses,
		ownership,
		component,
		render: (width = 100) => component.render(width),
		configure: (input: unknown) => {
			config = mergeConfig(input);
		},
	};
}

describe("upstream Footer features compose with the HUD", () => {
	it("keeps defaults and reserves builtins/prototype names while allowing ci override", () => {
		const config = mergeConfig({
			footerVariables: JSON.parse(
				'{"quota":"pkg:quota","cwd":"bad","thinkingLevel":"bad","join_sep":"bad","__proto__":"bad","constructor":"bad","ci":"pkg:ci"}',
			),
			compactFooterMaxLines: 100,
			pathDisplay: { mode: "repository" },
		});
		expect(config.footerVariables).toEqual({ quota: "pkg:quota", ci: "pkg:ci" });
		expect(config.compactFooterMaxLines).toBe(8);
		expect(config.pathDisplay.mode).toBe("repository");
		expect(mergeConfig({}).footerFormat).toBe("");
		expect(mergeConfig({}).compactFooterFormat).toBe("");
	});
	it("only demands custom values and clocks from enabled template consumers", () => {
		const input = {
			footerVariables: { quota: "pkg:quota" },
			footerFormat: "$cwd",
			compactFooterFormat: "$quota$wrap$time$wrap$duration",
		};
		expect([...demandedPublisherKeys(mergeConfig(input))]).toEqual(["pkg:quota"]);
		expect(footerClockNeeds(mergeConfig(input), false)).toMatchObject({
			wallClock: true,
			duration: true,
		});
		expect([...demandedPublisherKeys(mergeConfig({ ...input, responsiveFooter: false }))]).toEqual(
			[],
		);
		expect(footerTemplateReferences(mergeConfig({ ...input, footerStyle: "hidden" })).size).toBe(0);
		expect(footerClockNeeds(mergeConfig({ ...input, footerStyle: "hidden" }), true)).toEqual({
			wallClock: false,
			duration: false,
			activity: false,
		});
	});
	it("renders live metadata and conditional joins with current repository root", () => {
		const f = footer({
			footerFormat: "$cwd$join_sep($pr_number)$join_sep$token_rate",
			pathDisplay: { mode: "repository" },
		});
		f.state.repositoryCwd = "/repo/packages/hud";
		f.state.repositoryRoot = "/repo";
		expect(stripVTControlCharacters(f.render().join("\n"))).toContain(
			"packages/hud | 42 | 48 tok/s avg",
		);
		f.state.repositoryCwd = "/old";
		expect(stripVTControlCharacters(f.render().join("\n"))).toContain("/repo/packages/hud");
		f.component.dispose?.();
		expect(f.ownership.mock.calls.map(([value]) => value)).toEqual([true, false]);
	});
	it("uses opt-in compact templates below 80 columns, without redefining extensions", () => {
		const f = footer({
			footerFormat: "WIDE",
			compactFooterFormat: "COMPACT$wrap$extensions$wrap_sep$extension_statuses",
			icons: { mode: "ascii" },
		});
		f.state.configCounts.packages = 3;
		f.statuses.set("sample", "EXTENSION STATUS");
		expect(stripVTControlCharacters(f.render(100).join("\n"))).toContain("WIDE");
		const compact = stripVTControlCharacters(f.render(40).join("\n"));
		expect(compact).toContain("COMPACT");
		expect(compact).toContain("3");
		expect(compact).toContain("EXTENSION STATUS");
		for (const row of f.render(20)) expect(visibleWidth(row)).toBeLessThanOrEqual(20);
	});
	it("retains whole styled custom values or recomposes without any partial text", () => {
		const value = "\x1b[32mQUOTA:123456789\x1b[0m";
		const f = footer(
			{ footerFormat: "A$join_sep($quota)$fill$cost", footerVariables: { quota: "pkg:q" } },
			new Map([["pkg:q", value]]),
		);
		expect(f.render(100).join("\n")).toContain(value);
		for (let width = 1; width <= 60; width++) {
			const rows = f.render(width);
			const plain = stripVTControlCharacters(rows.join("\n"));
			expect(plain.includes("QUOTA") && !plain.includes("QUOTA:123456789")).toBe(false);
			expect(plain).not.toMatch(/[\ue000-\uf8ff]/);
			for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
		}
	});
	it("keeps custom values atomic across compact chunks and repeated aliases", () => {
		const f = footer(
			{ compactFooterFormat: "$quota$wrap$quota$fill$cost", footerVariables: { quota: "pkg:q" } },
			new Map([["pkg:q", "QUOTA:123456789"]]),
		);
		for (let width = 1; width < 70; width++) {
			const text = stripVTControlCharacters(f.render(width).join("\n"));
			expect(text.replaceAll("QUOTA:123456789", "")).not.toContain("QUOTA");
			expect(text).not.toMatch(/[\ue000-\uf8ff]/);
		}
	});
	it("hidden suppresses HUD/template content but keeps permitted statuses", () => {
		const f = footer({
			footerStyle: "hidden",
			footerFormat: "NEVER",
			extensionStatuses: { placements: { secret: "off" } },
		});
		expect(f.render()).toEqual([]);
		f.statuses.set("sample", "ALLOWED");
		f.statuses.set("constructor", "SAFE PROTOTYPE KEY");
		f.statuses.set("secret", "SECRET");
		expect(stripVTControlCharacters(f.render().join("\n"))).toContain("ALLOWED");
		expect(f.render().join("\n")).not.toMatch(/NEVER|SECRET|Project/);
		expect(f.render().join("\n")).toContain("SAFE PROTOTYPE KEY");
	});
});

describe("publisher protocol and terminal safety", () => {
	it("responds to capability probes, bounds values and evicts inactive publications", () => {
		const events = new Map<string, (value: unknown) => void>();
		const emit = (name: string, value: unknown) => events.get(name)?.(value);
		let active = true;
		const change = vi.fn();
		const registry = new CustomVariables(
			{ on: (name: string, fn: (value: unknown) => void) => events.set(name, fn) } as never,
			() => active,
			change,
		);
		const capability = { supported: false, active: false, key: "pkg:q" };
		emit("zentui:variable-capability", capability);
		expect(capability).toMatchObject({ supported: true, active: true, version: 1 });
		emit("zentui:variable", { key: "pkg:q", text: "VALUE" });
		expect(registry.snapshot().get("pkg:q")).toBe("VALUE");
		emit("zentui:variable", { key: "pkg:q", text: "x".repeat(257) });
		expect(registry.snapshot().get("pkg:q")).toBe("VALUE");
		const getter = vi.fn(() => "pkg:q");
		emit("zentui:variable", {
			get key() {
				return getter();
			},
			text: "BAD",
		});
		expect(getter).not.toHaveBeenCalled();
		for (let i = 0; i < 20; i++) emit("zentui:variable", { key: `pkg:${i}`, text: "v" });
		expect(registry.snapshot().size).toBe(16);
		active = false;
		registry.reconcile();
		expect(registry.snapshot().size).toBe(0);
		emit("zentui:variable", { key: "pkg:q", text: "BAD" });
		expect(registry.snapshot().size).toBe(0);
	});
	it("only preserves safe links/styles and closes them before adjacent text", () => {
		const link = "\x1b]8;;https://example.com/pr/1\x07PR #1";
		const safe = sanitizeExtensionStatusOriginalText("\x1b[31m" + link);
		expect(safe).toContain(link);
		expect(safe).toMatch(/\x1b\]8;;\x07\x1b\[0m$/);
		for (const url of ["javascript:alert(1)", "file:///tmp/private", "https://example.com/a b"]) {
			expect(sanitizeExtensionStatusOriginalText(`\x1b]8;;${url}\x07TEXT\x1b]8;;\x07`)).toBe(
				"TEXT",
			);
		}
		expect(sanitizeExtensionStatusOriginalText("\x1b]52;c;clipboard\x07TEXT\x1b[2J")).toBe("TEXT");
		expect(sanitizeExtensionStatusOriginalText("__ZENTUI_SGR_0__")).toBe("__ZENTUI_SGR_0__");
	});
});

describe("optional telemetry", () => {
	it("does not create settings managers without demand and refreshes OAuth without caching", () => {
		const create = vi.fn();
		const oauth = vi.fn(() => true);
		const controller = new FooterTelemetryController({ settingsManager: { create } });
		const ctx = {
			model: { provider: "openai" },
			modelRegistry: { isUsingOAuth: oauth },
		} as unknown as ExtensionContext;
		expect(controller.resolve(ctx, { subscription: false, autoCompaction: false })).toEqual({
			subscription: undefined,
			autoCompaction: undefined,
		});
		expect(create).not.toHaveBeenCalled();
		expect(oauth).not.toHaveBeenCalled();
		expect(
			controller.resolve(ctx, { subscription: true, autoCompaction: false }).subscription,
		).toBe(true);
		oauth.mockReturnValue(false);
		expect(
			controller.resolve(ctx, { subscription: true, autoCompaction: false }).subscription,
		).toBe(false);
	});
	it("never reads project settings without public project-trust support", () => {
		const create = vi.fn();
		const controller = new FooterTelemetryController({ settingsManager: { create } });
		expect(
			controller.resolve({ cwd: "/repo" } as ExtensionContext, {
				subscription: false,
				autoCompaction: true,
			}).autoCompaction,
		).toBeUndefined();
		expect(create).not.toHaveBeenCalled();
	});
});
