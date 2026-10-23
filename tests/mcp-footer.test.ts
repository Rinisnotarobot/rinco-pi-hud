import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import type { ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import { mergeConfig } from "../extensions/hud/config/normalize.ts";
import { installFooter } from "../extensions/hud/footer/index.ts";
import { emptyGitStatus } from "../extensions/hud/segments/git.ts";
import { getMcpServerCount } from "../extensions/hud/segments/mcp-status.ts";
import { createInitialState } from "../extensions/hud/state/index.ts";

type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;

function setupFooter() {
	const state = createInitialState(emptyGitStatus());
	const statuses = new Map<string, string>();
	let tools: ToolInfo[] = [];
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
		getMcpServerCount: () => getMcpServerCount({ getAllTools: () => tools }),
	});
	return {
		setServerCount(count: number) {
			tools = Array.from({ length: count }, (_, index) => ({
				name: `mcp__server${index}__search`,
				namespace: { name: `mcp__server${index}` },
				exposure: "codemode",
			})) as ToolInfo[];
		},
		statuses,
		setConfig: (next: typeof config) => {
			config = next;
		},
		render: () => footer!.render(240).map(stripVTControlCharacters).join("\n"),
	};
}

test("MCP footer reads live Pi runtime tools on each render without an adapter status", () => {
	const { setServerCount, render } = setupFooter();
	assert.equal(render().includes("MCP"), false);
	setServerCount(3);
	assert.match(render(), /MCP 3\b/);
	assert.equal(render().includes("MCP 0/"), false);
	setServerCount(1);
	assert.match(render(), /MCP 1\b/);
	setServerCount(0);
	assert.equal(render().includes("MCP"), false);
});

test("MCP runtime counts honor segment controls and custom format variables", () => {
	const { setServerCount, setConfig, render } = setupFooter();
	setServerCount(2);
	setConfig(mergeConfig({ footerSegments: { mcp: false } }));
	assert.equal(render().includes("MCP"), false);
	setConfig(mergeConfig({ footerFormat: "$mcp", footerSegments: { mcp: false } }));
	assert.equal(render().trim(), "MCP 2");
	setConfig(mergeConfig({ footerFormat: "${mcp}" }));
	assert.equal(render().trim(), "MCP 2");
});

test("legacy MCP statuses remain third-party statuses and do not supply runtime counts", () => {
	const { setServerCount, statuses, render } = setupFooter();
	statuses.set("mcp", "MCP: 7/8 servers");
	assert.match(render(), /MCP: 7\/8 servers/);
	assert.equal(render().includes("MCP 7/8"), false);
	setServerCount(2);
	assert.match(render(), /MCP 2\b/);
	assert.match(render(), /MCP: 7\/8 servers/);
});
