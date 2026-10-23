import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { test } from "vitest";
import { renderCompactFooter } from "../extensions/hud/footer/compact.ts";
import {
	collectFooterFormatReferences,
	compileCompactFormat,
	compileCompactFormatSplit,
	parseFooterFormat,
	renderFormatSplit,
	renderFormatTokens,
	type FormatToken,
} from "../extensions/hud/footer/format.ts";

const variables = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const render = (format: string, values: Record<string, string> = {}) =>
	renderFormatTokens(parseFooterFormat(format), variables({ sep: " | ", ...values }));
const compact = (
	format: string,
	width: number,
	maxLines = 2,
	values: Record<string, string> = {},
	statuses: readonly string[] = [],
) => renderCompactFooter(format, variables(values), statuses, " | ", width, maxLines);
const plain = (text: string) => stripVTControlCharacters(text);
const widthOf = (text: string) => visibleWidth(plain(text));

test("join_sep filters empty fields and ANSI/OSC wrapper whitespace without changing retained styling", () => {
	const red = "\x1b[31m项目\x1b[0m";
	const whitespace = "\x1b[31m  \x1b[0m\x1b]8;;https://example.com\x07 \x1b]8;;\x07";
	assert.equal(
		render("$join_sep$a$join_sep$b$join_sep$c$join_sep", { a: red, b: whitespace, c: "🙂" }),
		`${red} | 🙂`,
	);
	assert.equal(render("$a$join_sep$b", { a: whitespace }), "");
	assert.equal(render("$a$join_sep$b", { b: "B" }), "B");
	assert.equal(
		render("$a$join_sep$b", { a: "A", b: "B", sep: "\x1b[2m • \x1b[0m" }),
		"A\x1b[2m • \x1b[0mB",
	);
});

test("join scopes are local to groups and never cross fill or wrap boundaries", () => {
	assert.equal(
		render("$a$join_sep($b$join_sep$c)$join_sep$d", { a: "A", c: "C", d: "D" }),
		"A | C | D",
	);
	assert.equal(render("$a$join_sep($b$join_sep$c)$join_sep$d", { a: "A", d: "D" }), "A | D");
	for (const boundary of ["$fill", "$wrap", "$wrap_sep"]) {
		assert.equal(render(`$a$join_sep${boundary}$b`, { a: "A", b: "B" }), "AB");
		assert.equal(render(`$a${boundary}$join_sep$b`, { a: "A", b: "B" }), "AB");
	}
	assert.deepEqual(
		renderFormatSplit(
			parseFooterFormat("$a$join_sep$fill$join_sep$b"),
			variables({ a: "A", b: "B", sep: " | " }),
		),
		{ left: "A", middle: "", right: "B" },
	);
});

test("legacy output remains verbatim and wide wrap markers never call renderVariable", () => {
	assert.equal(
		render("  $a($sep$b)  literal $fill end", { a: "A", b: "B" }),
		"  A | B  literal  end",
	);
	assert.equal(render("($sep$empty)($literal)", { sep: " | ", literal: "X" }), "X");
	assert.equal(
		renderFormatTokens(parseFooterFormat("a$wrap b$wrap_sep c"), () => {
			throw new Error("structural callback");
		}),
		"a b c",
	);
});

test("readonly compact compiler uses only first top-level fill and extension_statuses is structural", () => {
	const tokens = parseFooterFormat(
		" $extensions $wrap_sep $extension_statuses $fill right$wrap tail$fill end",
	);
	const split = compileCompactFormatSplit(tokens);
	assert.equal(split.alignRight, true);
	assert.equal(split.left.length, 2);
	assert.deepEqual(split.left[0], {
		kind: "tokens",
		tokens: [{ kind: "var", name: "extensions" }],
		boundary: "space",
	});
	assert.deepEqual(split.left[1], { kind: "extensions", boundary: "separator" });
	assert.equal(split.right.length, 2);
	assert.equal(compileCompactFormat(parseFooterFormat("($a$fill$b)$wrap$c")).length, 2);
	assert.equal(compileCompactFormatSplit(parseFooterFormat("($fill$a)")).alignRight, false);
	assert.deepEqual(
		[
			...collectFooterFormatReferences(
				parseFooterFormat(
					"$extensions$extension_statuses$wrap$wrap_sep$join_sep($cwd$alias)$sep$toString",
				),
				{ alias: "model" },
			),
		],
		["extensions", "cwd", "model", "sep", "toString"],
	);
});

test("compact boundaries pack blocks and only put separators between same-line content", () => {
	assert.deepEqual(compact("aaa$wrap_sep bbb$wrap ccc", 12), ["aaa | bbb", "ccc"]);
	assert.deepEqual(compact("aaa$wrap_sep bbb$wrap ccc", 20), ["aaa | bbb ccc"]);
	assert.deepEqual(compact("aaa$wrap_sep$missing$wrap_sep bbb", 5), ["aaa", "bbb"]);
	assert.deepEqual(
		compact("$extensions$wrap_sep$extension_statuses", 30, 2, { extensions: "3 packages" }, [
			"first",
			"second",
		]),
		["3 packages | first second"],
	);
	assert.deepEqual(compact("$extension_statuses", 5, 3, {}, ["abc", "def", "ghi"]), [
		"abc",
		"def",
		"ghi",
	]);
});

test("compact reserves right blocks in order, aligns right, and signals omitted left content", () => {
	assert.deepEqual(compact("left$fill R$wrap_sep S", 10), ["left R | S"]);
	assert.deepEqual(compact("left$fill R$wrap_sep S", 6), [" R | S", "left"]);
	assert.deepEqual(compact("$fill R$wrap_sep S$wrap T", 3, 2), ["  R", "S T"]);
	assert.deepEqual(compact("left$fill RIGHT$wrap OTHER", 5, 1).map(plain), ["RIGH…"]);
	assert.deepEqual(compact("abcdef$fill x$fill$join_sep y", 15), ["abcdef      x y"]);
});

test("compact clamps line limits to 1..8 and marks every omission", () => {
	const format = Array.from({ length: 12 }, (_, i) => `block${i}`).join("$wrap_sep ");
	for (const limit of [-3, 0, 1, 2, 8, 99]) {
		const rows = compact(format, 7, limit);
		assert.equal(rows.length, Math.max(1, Math.min(8, limit)));
		assert.ok(plain(rows.at(-1) ?? "").endsWith("…"));
		assert.ok(
			rows.every(
				(row) => widthOf(row) <= 7 && !plain(row).startsWith(" | ") && !plain(row).endsWith(" | "),
			),
		);
	}
	assert.deepEqual(compact("abcdefghijkl$wrap next", 4, 1).map(plain), ["abc…"]);
});

test("compact handles Unicode, ANSI, OSC hyperlinks and width zero/one safely", () => {
	const link = "\x1b]8;;https://example.com\x1b\\界界界\x1b]8;;\x1b\\";
	const styled = "\x1b[31m🙂é中文\x1b[0m";
	for (let width = 0; width <= 20; width++) {
		for (const limit of [1, 2, 8]) {
			const rows = compact("$a$wrap_sep$b$fill$c$wrap_sep$d", width, limit, {
				a: link,
				b: styled,
				c: "右侧🙂",
				d: "é",
			});
			assert.ok(rows.length >= 1 && rows.length <= limit);
			assert.ok(
				rows.every((row) => widthOf(row) <= width),
				JSON.stringify({ width, rows }),
			);
			assert.ok(rows.every((row) => !row.includes("\ufffd")));
		}
	}
	assert.deepEqual(compact("abc", 0), [""]);
	assert.deepEqual(compact("abc", 1).map(plain), ["…"]);
	assert.deepEqual(compact("a$wrap b", 1, 1), ["…"]);
	assert.deepEqual(compact("$a", 4, 1, { a: link }).map(plain), ["界…"]);
	const truncated = compact("$a$wrap b", 4, 2, { a: link })[0] ?? "";
	assert.match(truncated, /\x1b\]8;;(?:\x07|\x1b\\)/);
	assert.deepEqual(compact("$fill$empty", 8), [""]);
});

test("enhancements preserve the deeply frozen bounded parser cache", () => {
	const format = "cache-enhanced:($a$join_sep($b))$wrap$extension_statuses$fill$c";
	const ast = parseFooterFormat(format);
	const frozen = (tokens: readonly FormatToken[]) => {
		assert.ok(Object.isFrozen(tokens));
		for (const token of tokens) {
			assert.ok(Object.isFrozen(token));
			if (token.kind === "group") frozen(token.tokens);
		}
	};
	frozen(ast);
	const before = JSON.stringify(ast);
	compileCompactFormatSplit(ast);
	compact(format, 30, 2, { a: "A" }, ["status"]);
	assert.equal(JSON.stringify(ast), before);
	assert.strictEqual(parseFooterFormat(format), ast);
	for (let i = 0; i < 128; i++) parseFooterFormat(`enhanced-eviction-${i}`);
	assert.notStrictEqual(parseFooterFormat(format), ast);
	const huge = "x".repeat(16385);
	assert.notStrictEqual(parseFooterFormat(huge), parseFooterFormat(huge));
});
