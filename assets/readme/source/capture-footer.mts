/**
 * Capture real footer output for the README assets.
 *
 * Runs the extension's own `installFooter` render path against real inputs:
 * this repository's git/runtime/package state plus a real Pi session transcript
 * for tokens, cost, tool counts and turn count. Every requested width is
 * rendered from one shared state snapshot so the numbers agree across panels.
 *
 *   npx tsx assets/readme/source/capture-footer.mts [repo] [session.jsonl] [width...]
 *
 * Writes JSON to stdout: { widths: [{ width, rows: [ansi…] }], facts }.
 */
import { SessionManager, getLastAssistantUsage } from "@earendil-works/pi-coding-agent";
import { mergeConfig } from "../../../extensions/hud/config/normalize.ts";
import { installFooter } from "../../../extensions/hud/footer/index.ts";
import { emptyGitStatus, readGitStatus } from "../../../extensions/hud/segments/git.ts";
import { readRuntimeInfo } from "../../../extensions/hud/segments/runtime.ts";
import { readPackageVersion } from "../../../extensions/hud/segments/package-version.ts";
import { countConfigEntries } from "../../../extensions/hud/config/config-counts.ts";
import { createInitialState, syncState } from "../../../extensions/hud/state/index.ts";
import {
	updateTelemetryState,
	type TelemetryState,
} from "../../../extensions/hud/state/telemetry.ts";

const repo = process.argv[2] ?? process.cwd();
const sessionFile = process.argv[3] ?? process.env.PI_SESSION_FILE;
const widths = process.argv.slice(4).map(Number).filter((value) => value > 0);
if (!sessionFile) throw new Error("No session file: pass one as the second argument.");
const requestedWidths = widths.length > 0 ? widths : [118];

// ---------------------------------------------------------------- real inputs
const sessionManager = SessionManager.open(sessionFile, undefined, repo);
const entries = sessionManager.getEntries();

const modelChange = entries.find((entry) => entry.type === "model_change") as
	| { provider: string; modelId: string }
	| undefined;
const thinkingChange = [...entries]
	.reverse()
	.find((entry) => entry.type === "thinking_level_change") as { thinkingLevel?: string } | undefined;
const usage = getLastAssistantUsage(entries as never);
const messages = entries.filter((entry) => entry.type === "message") as Array<{
	message: { role: string; content: unknown };
}>;

let turns = 0;
const toolCalls: Array<{ id: string; name: string }> = [];
for (const { message } of messages) {
	if (message.role === "user" && Array.isArray(message.content)) {
		if (message.content.some((part: { type?: string }) => part.type === "text")) turns += 1;
	}
	if (message.role === "assistant" && Array.isArray(message.content)) {
		for (const part of message.content as Array<{ type: string; id?: string; name?: string }>) {
			if (part.type === "toolCall" && part.id && part.name) {
				toolCalls.push({ id: part.id, name: part.name });
			}
		}
	}
}

const contextWindow = 1_000_000;
const tokens = usage
	? (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0)
	: 0;

const ctx = {
	cwd: repo,
	model: {
		id: modelChange?.modelId ?? "unknown",
		provider: modelChange?.provider ?? "unknown",
		contextWindow,
		reasoning: true,
	},
	sessionManager,
	getContextUsage: () => ({ tokens, contextWindow, percent: (tokens / contextWindow) * 100 }),
	ui: { setFooter: (factory: unknown) => ((captured = factory), { dispose() {} }) },
} as never;

let captured: unknown;

// ------------------------------------------------------- real repository state
const state = createInitialState(emptyGitStatus());
const git = await readGitStatus(repo, { readExactTag: true });
if (git.kind === "ok") Object.assign(state, git.status);
const runtime = await readRuntimeInfo(repo);
if (runtime.kind === "ok") state.runtime = runtime.runtime;
state.packageVersion = readPackageVersion(repo) ?? undefined;
state.configCounts = countConfigEntries(repo);
state.sessionStartEpoch = Date.parse(String(entries[0]?.timestamp ?? "")) || Date.now();
state.telemetry = {
	...state.telemetry,
	turnIndex: turns,
	thinkingLevel: thinkingChange?.thinkingLevel ?? "off",
	modelSupportsReasoning: true,
};

// Replay the session's real tool calls so tool counts come from real usage.
// Every call is closed out: the transcript is already finished as far as the
// footer is concerned, so nothing should read as still running.
const startedAt = Date.parse(String(entries[0]?.timestamp ?? "")) || 0;
let telemetry: TelemetryState = state.telemetry;
for (const [index, call] of toolCalls.entries()) {
	telemetry = updateTelemetryState(telemetry, {
		type: "tool-call",
		toolCallId: call.id,
		name: call.name,
		args: null,
		at: startedAt + index,
	});
}
for (const [index, call] of toolCalls.entries()) {
	telemetry = updateTelemetryState(telemetry, {
		type: "tool-result",
		toolCallId: call.id,
		isError: false,
		at: startedAt + index + 1,
	});
}
state.telemetry = telemetry;
syncState(state, ctx, "c");

// ------------------------------------------------------------ real render path
const config = mergeConfig({
	icons: { mode: "ascii" },
	// The live quota segment would print the maintainer's real account balance.
	footerSegments: { codexUsage: false },
});

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
	italic: (text: string) => text,
	underline: (text: string) => text,
};

installFooter(ctx, state, () => config, {
	setRequestRender() {},
	scheduleProjectRefresh() {},
});

const instance = (
	captured as (
		tui: unknown,
		theme: unknown,
		data: unknown,
	) => { render(width: number): string[] }
)(
	{ requestRender() {} },
	theme,
	{ onBranchChange: () => () => {}, getExtensionStatuses: () => new Map<string, string>() },
);

process.stdout.write(
	JSON.stringify(
		{
			widths: requestedWidths.map((width) => ({
				width,
				rows: instance.render(width).map((row) => row.trimEnd()),
			})),
			facts: {
				model: `${ctx.model.provider}/${ctx.model.id}`,
				session: sessionFile.split("/").pop(),
				contextPercent: ((tokens / contextWindow) * 100).toFixed(0),
				tokens,
				cost: state.usageTotals.cost,
				tools: toolCalls.length,
				turns,
				branch: state.branch,
				git: git.kind === "ok" ? git.status : null,
				runtime: state.runtime ? `${state.runtime.name} ${state.runtime.version}` : null,
				package: state.packageVersion,
			},
		},
		null,
		2,
	),
);
