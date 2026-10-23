import assert from "node:assert/strict";
import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import { getMcpServerCount } from "../extensions/hud/segments/mcp-status.ts";

function mcpTool(namespace: string, name: string, exposure: ToolInfo["exposure"]): ToolInfo {
	return { name: `${namespace}__${name}`, namespace: { name: namespace }, exposure } as ToolInfo;
}

test("MCP counts runtime namespaces across direct, codemode, and deferred tools", () => {
	const tools = [
		mcpTool("mcp__files", "read", "direct"),
		mcpTool("mcp__files", "write", "codemode"),
		mcpTool("mcp__docs", "search", "deferred"),
		mcpTool("mcp__extension_server", "lookup", "codemode"),
	];
	assert.equal(getMcpServerCount({ getAllTools: () => tools }), 3);
});

test("MCP counts exclude hidden tools, resource helpers, and guessed tool-name prefixes", () => {
	const tools = [
		mcpTool("mcp__removed", "read", "hidden"),
		mcpTool("mcp__mixed", "read", "hidden"),
		mcpTool("mcp__mixed", "write", "direct"),
		{ name: "mcp__fake__read", exposure: "direct" } as ToolInfo,
		{ name: "list_mcp_resources", exposure: "direct" } as ToolInfo,
		{ name: "read", namespace: { name: "mcp__fake" }, exposure: "direct" } as ToolInfo,
		mcpTool("ordinary", "read", "direct"),
	];
	assert.equal(getMcpServerCount({ getAllTools: () => tools }), 1);
});

test("MCP counts reflect late registrations, withdrawal, and session replacement without caching", () => {
	let tools: ToolInfo[] = [];
	const pi = { getAllTools: () => tools };
	assert.equal(getMcpServerCount(pi), 0);
	tools = [mcpTool("mcp__late", "search", "codemode")];
	assert.equal(getMcpServerCount(pi), 1);
	tools[0] = { ...tools[0]!, exposure: "hidden" };
	assert.equal(getMcpServerCount(pi), 0);
	tools = [mcpTool("mcp__new_session", "search", "deferred")];
	assert.equal(getMcpServerCount(pi), 1);
});

test("MCP count degrades to zero if the runtime API is unavailable", () => {
	assert.equal(getMcpServerCount({} as never), 0);
	assert.equal(
		getMcpServerCount({
			getAllTools: () => {
				throw new Error("unavailable");
			},
		}),
		0,
	);
});
