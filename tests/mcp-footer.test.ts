import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import { mergeConfig } from "../extensions/hud/config/normalize.ts";
import { installFooter } from "../extensions/hud/footer/index.ts";
import { emptyGitStatus } from "../extensions/hud/segments/git.ts";
import { createInitialState } from "../extensions/hud/state/index.ts";

type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;

function setupFooter() {
	const state = createInitialState(emptyGitStatus());
	const statuses = new Map<string, string>();
	let config = mergeConfig({ icons: { mode: "ascii" } });
	let footer: ReturnType<FooterFactory> | undefined;
	const ctx = {
		cwd: "/tmp/hud-mcp-test",
		getContextUsage: () => undefined,
		ui: {
			setFooter(factory: FooterFactory) {
				footer = factory(
					{ requestRender() {} } as never,
					{ fg: (_color: string, text: string) => text } as never,
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
	});
	return {
		state,
		statuses,
		setConfig: (next: typeof config) => {
			config = next;
		},
		render: () => footer!.render(240).map(stripVTControlCharacters).join("\n"),
	};
}

test("MCP footer renders cached configuration counts without an adapter status", () => {
	const { state, render } = setupFooter();
	assert.equal(render().includes("MCP"), false);
	state.configCounts.mcpServers = 3;
	assert.match(render(), /MCP 3\b/);
	assert.equal(render().includes("MCP 0/"), false);
	state.configCounts.mcpServers = 1;
	assert.match(render(), /MCP 1\b/);
	state.configCounts.mcpServers = 0;
	assert.equal(render().includes("MCP"), false);
});

test("MCP configuration counts honor segment controls and custom format variables", () => {
	const { state, setConfig, render } = setupFooter();
	state.configCounts.mcpServers = 2;
	setConfig(mergeConfig({ footerSegments: { mcp: false } }));
	assert.equal(render().includes("MCP"), false);
	setConfig(mergeConfig({ footerFormat: "$mcp", footerSegments: { mcp: false } }));
	assert.equal(render().trim(), "MCP 2");
	setConfig(mergeConfig({ footerFormat: "${mcp}" }));
	assert.equal(render().trim(), "MCP 2");
});

test("legacy MCP statuses remain third-party statuses and do not supply configuration counts", () => {
	const { state, statuses, render } = setupFooter();
	statuses.set("mcp", "MCP: 7/8 servers");
	assert.match(render(), /MCP: 7\/8 servers/);
	assert.equal(render().includes("MCP 7/8"), false);
	state.configCounts.mcpServers = 2;
	assert.match(render(), /MCP 2\b/);
	assert.match(render(), /MCP: 7\/8 servers/);
});
