import assert from "node:assert/strict";
import { test } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { defaultConfig } from "../extensions/hud/config/schema.ts";
import { composeCategorizedFooterRows } from "../extensions/hud/footer/layout.ts";
import { buildTelemetryLabels } from "../extensions/hud/footer/render-labels.ts";
import { createTelemetryState } from "../extensions/hud/state/telemetry.ts";

const separator = " · ";

test("default footer composes four aligned semantic groups", () => {
	const rows = composeCategorizedFooterRows(
		{
			project: ["Project", "pi-sakura", "main", "Node 24"],
			session: ["Session", "gpt-5.3", "Thinking level: medium", "Turn 4", "Duration 2m"],
			activity: ["Activity", "Tool read × 4", "Agent idle", "Skill 2/3", "MCP 2/2"],
			usage: ["Usage", "35%/200k", "↑ 4.2k", "↓ 1.1k", "$ 0.030", "Time 20:05"],
		},
		separator,
		120,
	);

	assert.deepEqual(rows, [
		"Project  · pi-sakura · main · Node 24",
		"Session  · gpt-5.3 · Thinking level: medium · Turn 4 · Duration 2m",
		"Activity · Tool read × 4 · Agent idle · Skill 2/3 · MCP 2/2",
		"Usage    · 35%/200k · ↑ 4.2k · ↓ 1.1k · $ 0.030 · Time 20:05",
	]);
	assert.equal(
		rows.every((row) => !row.startsWith(" ")),
		true,
	);
	assert.equal(
		rows.map((row) => row.indexOf("·")).every((index) => index === 9),
		true,
	);
});

test("categorized footer wraps complete segments onto aligned continuation lines", () => {
	const groups = {
		project: ["Project", "alpha-project", "main", "Node 24"],
		session: ["Session", "gpt-5.3", "Thinking level: medium", "Turn 4"],
		activity: ["Activity", "Tool read", "Agent idle", "Skill 2/3", "MCP 2/2"],
		usage: ["Usage", "35%/200k", "↑ 4.2k ↓ 1.1k", "R 2k W 1k", "$ 0.030"],
	};
	const rows = composeCategorizedFooterRows(groups, separator, 34);

	assert.equal(rows.length > 4, true);
	assert.equal(
		rows.every((row) => visibleWidth(row) <= 34),
		true,
	);
	assert.equal(
		rows.every((row) => row.indexOf("·") === 9),
		true,
	);
	assert.equal(
		rows.some((row) => row.startsWith("         ·")),
		true,
	);

	const rendered = rows.join("\n");
	for (const segment of Object.values(groups).flatMap((parts) => parts.slice(1))) {
		assert.equal(rendered.includes(segment), true, `missing segment: ${segment}`);
	}
	assert.equal(rendered.includes("…"), false);
});

test("categorized footer truncates only an oversized segment and preserves later segments", () => {
	const rows = composeCategorizedFooterRows(
		{
			project: ["Project", "this segment is much too long", "tail"],
			session: ["Session", "model"],
			activity: ["Activity", "idle"],
			usage: ["Usage", "cost"],
		},
		separator,
		24,
	);

	assert.equal(rows[0]?.includes("…"), true);
	assert.equal(rows[1]?.endsWith("tail"), true);
	assert.equal(
		rows.every((row) => visibleWidth(row) <= 24),
		true,
	);
});

test("telemetry labels use the four English groups and readable activity labels", () => {
	const telemetry = {
		...createTelemetryState({
			modelSupportsReasoning: true,
			thinkingLevel: "medium",
			turnIndex: 4,
		}),
		tools: [
			{
				toolCallId: "read-1",
				name: "read",
				status: "completed" as const,
				startTime: 1,
				endTime: 2,
			},
		],
	};
	const unstyledConfig = {
		...defaultConfig,
		colors: Object.fromEntries(
			Object.keys(defaultConfig.colors).map((key) => [key, ""]),
		) as typeof defaultConfig.colors,
	};
	const labels = buildTelemetryLabels(
		{ model: { provider: "openai-codex", id: "gpt-5.3" } } as never,
		{
			telemetry,
			usageTotals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
			configCounts: {
				instructionFiles: { agentsMd: 0, claudeMd: 0, total: 0 },
				packages: 0,
			},
			skillCounts: { active: 2, total: 3 },
		} as never,
		unstyledConfig,
		{ fg: (_color: string, text: string) => text },
		"theme",
		{ connected: 2, total: 2 },
	);

	assert.deepEqual(
		[
			labels.projectCategoryLabel,
			labels.sessionCategoryLabel,
			labels.activityCategoryLabel,
			labels.usageCategoryLabel,
		],
		["Project", "Session", "Activity", "Usage"],
	);
	assert.equal(labels.thinkingLabel, "Thinking level: medium");
	assert.equal(labels.turnLabel, "Turn 4");
	assert.equal(labels.toolCountsLabel, "Tool read");
	assert.equal(labels.activeAgentsLabel, "Agent idle");
	assert.equal(labels.skillsLabel, "Skill 2/3");
	assert.equal(labels.mcpLabel, "MCP 2/2");
});

test("categorized footer stays within pathological narrow widths", () => {
	const rows = composeCategorizedFooterRows(
		{
			project: ["Project", "long project content"],
			session: ["Session", "long session content"],
			activity: ["Activity", "long activity content"],
			usage: ["Usage", "long usage content"],
		},
		separator,
		12,
	);

	assert.equal(rows.length, 4);
	for (const row of rows) {
		assert.equal(visibleWidth(row) <= 12, true);
		assert.equal(row.includes("…"), true);
	}
});
