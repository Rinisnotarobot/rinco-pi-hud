import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { mergeConfig } from "../extensions/hud/config/normalize.ts";
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
	assert.equal(config.footerSegments.activeAgents, false);
	assert.equal(config.footerSegments.agentIdle, false);
});

test("independent footer status controls override legacy aggregate values", () => {
	const config = mergeConfig({
		footerSegments: {
			tokens: false,
			inputTokens: true,
			toolActivity: false,
			runningTools: true,
			agentActivity: false,
			agentIdle: true,
			gitState: false,
		},
	});

	assert.equal(config.footerSegments.inputTokens, true);
	assert.equal(config.footerSegments.outputTokens, false);
	assert.equal(config.footerSegments.runningTools, true);
	assert.equal(config.footerSegments.toolCounts, false);
	assert.equal(config.footerSegments.activeAgents, false);
	assert.equal(config.footerSegments.agentIdle, true);
	assert.equal(config.footerSegments.gitState, false);
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
				activeAgents: true,
				agentIdle: false,
				inputTokens: false,
				outputTokens: true,
			},
			path,
		);

		assert.equal(config.footerSegments.gitState, false);
		assert.equal(config.footerSegments.runningTools, false);
		assert.equal(config.footerSegments.toolCounts, true);
		assert.equal(config.footerSegments.activeAgents, true);
		assert.equal(config.footerSegments.agentIdle, false);
		assert.equal(config.footerSegments.inputTokens, false);
		assert.equal(config.footerSegments.outputTokens, true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
