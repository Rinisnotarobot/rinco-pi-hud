import assert from "node:assert/strict";
import { test } from "vitest";
import {
	parseFooterFormat,
	renderFormatSplit,
	type FormatToken,
} from "../extensions/hud/footer/format.ts";

function assertFrozen(tokens: readonly FormatToken[]): void {
	assert.equal(Object.isFrozen(tokens), true);
	for (const token of tokens) {
		assert.equal(Object.isFrozen(token), true);
		if (token.kind === "group") assertFrozen(token.tokens);
	}
}

test("repeated footer formats reuse a deeply immutable AST", () => {
	const format = "cache:$cwd($sep$gitBranch(inner:${tokens}))$fill$cost";
	const tokens = parseFooterFormat(format);
	assert.strictEqual(parseFooterFormat(format), tokens);
	assertFrozen(tokens);
	const first = tokens[0];
	assert.ok(first);
	assert.equal(Reflect.set(first, "value", "polluted"), false);
	assert.equal(Reflect.set(tokens, "0", { kind: "text", value: "polluted" }), false);
	assert.throws(() => (tokens as FormatToken[]).push({ kind: "fill" }), TypeError);
	const group = tokens.find((token) => token.kind === "group");
	assert.ok(group && group.kind === "group");
	assert.throws(() => (group.tokens as FormatToken[]).splice(0), TypeError);
	assert.deepEqual(parseFooterFormat(format), tokens);
	assert.equal(
		renderFormatSplit(tokens, (name) => name.toUpperCase()).left,
		"cache:CWDSEPGITBRANCHinner:TOKENS",
	);
});

test("cached formats render current variables without caching values or themes", () => {
	const tokens = parseFooterFormat("$cwd($sep$branch)$fill${model}$fill$cost");
	assert.deepEqual(
		renderFormatSplit(
			tokens,
			(name) =>
				({ cwd: "one", sep: " | ", branch: "main", model: "model A", cost: "$1" })[name] ?? "",
		),
		{ left: "one | main", middle: "model A", right: "$1" },
	);
	assert.deepEqual(
		renderFormatSplit(
			parseFooterFormat("$cwd($sep$branch)$fill${model}$fill$cost"),
			(name) => ({ cwd: "two", sep: " | ", model: "model B", cost: "$2" })[name] ?? "",
		),
		{ left: "two", middle: "model B", right: "$2" },
	);
});

test("format AST cache evicts old entries and bypasses oversized strings", () => {
	const format = "old-cache-entry:$cwd";
	const old = parseFooterFormat(format);
	for (let i = 0; i < 128; i++) parseFooterFormat(`unique-cache-${i}:$tokens`);
	const reparsed = parseFooterFormat(format);
	assert.notStrictEqual(reparsed, old);
	assert.deepEqual(reparsed, old);
	assert.strictEqual(parseFooterFormat(format), reparsed);
	const oversized = `${"x".repeat(16385)}$cwd`;
	const large = parseFooterFormat(oversized);
	assert.notStrictEqual(parseFooterFormat(oversized), large);
	assert.deepEqual(parseFooterFormat(oversized), large);
	assertFrozen(large);
});

test("cached parser retains groups, fill boundaries and unmatched delimiters", () => {
	const cases: Array<
		[string, Record<string, string>, { left: string; middle: string; right: string }]
	> = [
		["", {}, { left: "", middle: "", right: "" }],
		["(text only)", {}, { left: "text only", middle: "", right: "" }],
		["($sep$missing)", { sep: " | " }, { left: "", middle: "", right: "" }],
		["($sep)", { sep: " | " }, { left: "", middle: "", right: "" }],
		[
			"a($missing(inner:$present))b",
			{ present: "yes" },
			{ left: "ainner:yesb", middle: "", right: "" },
		],
		["$cwd) ${tokens}", { cwd: "repo", tokens: "42" }, { left: "repo) 42", middle: "", right: "" }],
		["open($cwd", { cwd: "repo" }, { left: "openrepo", middle: "", right: "" }],
		["a$fill(b$fill)c$fill d$fill e", {}, { left: "a", middle: "bc", right: " d e" }],
	];
	for (const [format, values, expected] of cases) {
		const tokens = parseFooterFormat(format);
		assertFrozen(tokens);
		assert.strictEqual(parseFooterFormat(format), tokens);
		assert.deepEqual(
			renderFormatSplit(tokens, (name) => values[name] ?? ""),
			expected,
		);
	}
});
