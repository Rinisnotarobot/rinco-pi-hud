import assert from "node:assert/strict";
import { test } from "vitest";
import { Theme } from "@earendil-works/pi-coding-agent";
import type { ThemeStyle } from "@earendil-works/pi-coding-agent";
import {
	colorize,
	isSupportedColorSpec,
	renderStyleForSource,
	renderTerminalStyle,
	type ThemeLike,
} from "../extensions/hud/ui/style.ts";

const mock: ThemeLike = {
	fg: (color, text) => `<${color}>${text}</${color}>`,
	bold: (text) => `<bold>${text}</bold>`,
	italic: (text) => `<italic>${text}</italic>`,
	underline: (text) => `<underline>${text}</underline>`,
};

// Supply the documented fallback roots; these tests only render concrete styles.
function concreteTheme(mode: "truecolor" | "256color"): Theme {
	return new Theme(
		{ muted: "#888888", text: "#ffffff", thinkingXhigh: "#abcdef" } as ConstructorParameters<
			typeof Theme
		>[0],
		{ selectedBg: "#000000" } as ConstructorParameters<typeof Theme>[1],
		mode,
	);
}

test("Pi 1.3.0 optional foreground tokens are accepted and rendered", () => {
	for (const token of ["thinkingMax", "scrollbarTrack", "scrollbarThumb", "searchMatchText"]) {
		assert.equal(isSupportedColorSpec(token), true);
		assert.equal(isSupportedColorSpec(`bold ${token}`), true);
		for (const source of ["theme", "terminal"] as const) {
			assert.equal(renderStyleForSource(mock, source, token, "x"), `<${token}>x</${token}>`);
		}
	}
	assert.equal(isSupportedColorSpec("thinkingMAX"), false);
	assert.equal(isSupportedColorSpec("notAThemeToken"), false);
	assert.equal(isSupportedColorSpec("selectedBg"), false);
});

test("terminal names, numeric colors and modifiers retain their existing ANSI semantics", () => {
	const theme = {
		...mock,
		style: () => {
			throw new Error("non-hex styles must not call Theme.style");
		},
	};
	for (const source of ["theme", "terminal"] as const) {
		assert.equal(
			renderStyleForSource(theme, source, "bold dim underline fg:202 bg:blue", "x"),
			"\x1b[1;2;4;38;5;202;44mx\x1b[0m",
		);
	}
	assert.equal(renderStyleForSource(theme, "terminal", "bold red", "x"), "\x1b[1;31mx\x1b[0m");
	assert.equal(
		renderStyleForSource(theme, "theme", "bold red", "x"),
		"<error><bold>x</bold></error>",
	);
	assert.equal(renderStyleForSource(theme, "theme", "dim green", "x"), "<success>x</success>");
	assert.equal(renderStyleForSource(theme, "theme", "dim", "x"), "<muted>x</muted>");
	assert.equal(
		renderTerminalStyle("bright-purple bg:bright-cyan 0", "x"),
		"\x1b[95;106;38;5;0mx\x1b[0m",
	);
	for (const style of ["", "bold dimmed italic underline", "fg:0 bg:255", "#AbC", "bg:#abcdef"])
		assert.equal(isSupportedColorSpec(style), true);
	for (const style of ["fg:256", "-1", "bg:#abcd", "unknown"])
		assert.equal(isSupportedColorSpec(style), false);
});

test("explicit RGB uses the active Pi Theme encoder in truecolor and 256-color modes", () => {
	const style = "bold dim underline fg:#AbC bg:#123456";
	const options: ThemeStyle = {
		fg: { kind: "rgb", r: 170, g: 187, b: 204 },
		bg: { kind: "rgb", r: 18, g: 52, b: 86 },
		bold: true,
		dim: true,
		underline: true,
	};
	for (const mode of ["truecolor", "256color"] as const) {
		const theme = concreteTheme(mode);
		const expected = theme.style("x", options);
		for (const source of ["theme", "terminal"] as const)
			assert.equal(renderStyleForSource(theme, source, style, "x"), expected);
		assert.equal(colorize(theme, "#AbC", "x"), theme.style("x", { fg: options.fg }));
		assert.match(expected, mode === "truecolor" ? /38;2;170;187;204/ : /38;5;/);
		assert.match(expected, mode === "truecolor" ? /48;2;18;52;86/ : /48;5;/);
		if (mode === "256color") assert.equal(expected.includes(";2;170;187;204"), false);
	}
});

test("hex styles preserve named and numeric colors, modifiers and last-color precedence", () => {
	const theme = concreteTheme("256color");
	const options: ThemeStyle = {
		fg: { kind: "indexed", index: 9 },
		bg: { kind: "indexed", index: 202 },
		bold: true,
		dim: true,
		italic: true,
		underline: true,
	};
	assert.equal(
		renderStyleForSource(
			theme,
			"terminal",
			"bold dimmed italic underline #abc fg:bright-red bg:202",
			"x",
		),
		theme.style("x", options),
	);
});

test("hex rendering keeps simple and throwing ThemeLike fallbacks", () => {
	const expected = "\x1b[1;2;4;38;2;170;187;204;48;2;18;52;86mx\x1b[0m";
	const style = "bold dim underline fg:#abc bg:#123456";
	const throwing = {
		...mock,
		style: () => {
			throw new Error("unsupported");
		},
	};
	for (const theme of [mock, throwing]) {
		for (const source of ["theme", "terminal"] as const)
			assert.equal(renderStyleForSource(theme, source, style, "x"), expected);
		assert.equal(colorize(theme, "#abc", "x"), "\x1b[38;2;170;187;204mx\x1b[39m");
	}
	assert.equal(renderTerminalStyle(style, "x"), expected);
	assert.equal(
		renderStyleForSource(
			{
				fg: () => {
					throw new Error("bad token");
				},
			},
			"theme",
			"unknown",
			"x",
		),
		"x",
	);
});

test("cached syntax never retains themed ANSI, text, or mutable style options", () => {
	let generation = 1;
	const theme = {
		...mock,
		fg: (color: string, text: string) => `${generation}:${color}:${text}`,
		style: (text: string, options: ThemeStyle) => {
			assert.equal(options.bold, true);
			assert.deepEqual(options.fg, { kind: "rgb", r: 170, g: 187, b: 204 });
			options.bold = false;
			return `${generation}:${text}`;
		},
	};
	assert.equal(renderStyleForSource(theme, "theme", "accent", "first"), "1:accent:first");
	assert.equal(renderStyleForSource(theme, "theme", "bold #abc", "first"), "1:first");
	generation = 2;
	assert.equal(renderStyleForSource(theme, "theme", "accent", "second"), "2:accent:second");
	assert.equal(renderStyleForSource(theme, "theme", "bold #abc", "second"), "2:second");
	assert.equal(
		renderStyleForSource(
			{ ...theme, style: (text) => `other:${text}` },
			"theme",
			"bold #abc",
			"third",
		),
		"other:third",
	);
	for (let i = 0; i < 600; i++) renderTerminalStyle(`fg:${i % 256} ${" ".repeat(i)}`, "x");
	assert.equal(
		renderStyleForSource(theme, "theme", "bold #abc", "after eviction"),
		"2:after eviction",
	);
});
