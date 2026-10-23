import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { mergeConfig } from "../extensions/hud/config/normalize.ts";
import { FOOTER_FORMAT_ALIASES, FOOTER_FORMAT_VARIABLES } from "../extensions/hud/config/schema.ts";
import { saveFooterSegmentsPatch } from "../extensions/hud/config/persist.ts";

test("new footer status controls inherit disabled legacy aggregate controls", () => {
	const config = mergeConfig({
		footerSegments: {
			tokens: false,
			toolActivity: false,
			agentActivity: false,
		},
	});

	assert.equal(config.footerSegments.inputTokens, false);
	assert.equal(config.footerSegments.outputTokens, false);
	assert.equal(config.footerSegments.runningTools, false);
	assert.equal(config.footerSegments.toolCounts, false);
});

test("independent footer status controls override legacy aggregate values", () => {
	const config = mergeConfig({
		footerSegments: {
			tokens: false,
			inputTokens: true,
			toolActivity: false,
			runningTools: true,
			gitState: false,
		},
	});

	assert.equal(config.footerSegments.inputTokens, true);
	assert.equal(config.footerSegments.outputTokens, false);
	assert.equal(config.footerSegments.runningTools, true);
	assert.equal(config.footerSegments.toolCounts, false);
	assert.equal(config.footerSegments.gitState, false);
});

test("removed agent status controls are ignored and no longer built in", () => {
	const config = mergeConfig({
		footerSegments: { activeAgents: true, agentIdle: true, agentActivity: true },
	});
	for (const key of ["activeAgents", "agentIdle", "agentActivity"]) {
		assert.equal(Object.hasOwn(config.footerSegments, key), false);
	}
	assert.equal(
		FOOTER_FORMAT_VARIABLES.some((name) => String(name) === "active_agents"),
		false,
	);
	assert.equal(Object.hasOwn(FOOTER_FORMAT_ALIASES, "agents"), false);
});

test("new footer status controls persist independently", async () => {
	const root = await mkdtemp(join(tmpdir(), "hud-segment-controls-"));
	const path = join(root, "config.json");
	try {
		const config = saveFooterSegmentsPatch(
			{
				gitState: false,
				runningTools: false,
				toolCounts: true,
				inputTokens: false,
				outputTokens: true,
			},
			path,
		);

		assert.equal(config.footerSegments.gitState, false);
		assert.equal(config.footerSegments.runningTools, false);
		assert.equal(config.footerSegments.toolCounts, true);
		assert.equal(config.footerSegments.inputTokens, false);
		assert.equal(config.footerSegments.outputTokens, true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
