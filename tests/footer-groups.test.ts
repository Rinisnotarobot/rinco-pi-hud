import assert from "node:assert/strict";
import { test } from "vitest";
import { buildCategorizedFooterGroups } from "../extensions/hud/footer/groups.ts";

test("footer groups preserve semantic order and discard unavailable segments", () => {
	const groups = buildCategorizedFooterGroups({
		project: {
			category: "Project",
			cwd: "repo",
			git: "main",
			commit: "abc123",
			metrics: "+2 −1",
			runtime: "Node 24",
			packageVersion: "v1.0.0",
			configCounts: "Config 2",
			os: "Linux",
			username: "user@host",
		},
		session: {
			category: "Session",
			name: "work",
			model: "gpt-5.3",
			thinking: "Thinking level: medium",
			turn: "Turn 4",
			duration: "Duration 2m",
		},
		activity: {
			category: "Activity",
			tool: "",
			agent: "Agent idle",
			skills: "Skill 2/3",
			mcp: "MCP 2/2",
			extensions: ["Status A", "", "Status B"],
		},
		usage: {
			category: "Usage",
			context: "35%/200k",
			tokens: "↑ 4k ↓ 1k",
			cache: "",
			cost: "$ 0.03",
			quota: "Codex 76%",
			time: "Time 20:05",
		},
	});

	assert.deepEqual(groups, {
		project: [
			"Project",
			"repo",
			"main",
			"abc123",
			"+2 −1",
			"Node 24",
			"v1.0.0",
			"Config 2",
			"Linux",
			"user@host",
		],
		session: ["Session", "work", "gpt-5.3", "Thinking level: medium", "Turn 4", "Duration 2m"],
		activity: ["Activity", "Agent idle", "Skill 2/3", "MCP 2/2", "Status A", "Status B"],
		usage: ["Usage", "35%/200k", "↑ 4k ↓ 1k", "$ 0.03", "Codex 76%", "Time 20:05"],
	});
});
