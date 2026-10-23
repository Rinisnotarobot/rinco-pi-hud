import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { Theme, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { mergeConfig } from "../extensions/hud/config/normalize.ts";
import { saveColorSourcesPatch } from "../extensions/hud/config/persist.ts";
import { defaultConfig } from "../extensions/hud/config/schema.ts";
import { installFooter } from "../extensions/hud/footer/index.ts";
import { emptyGitStatus } from "../extensions/hud/segments/git.ts";
import { runtimeMetadata } from "../extensions/hud/segments/runtime.ts";
import { createInitialState } from "../extensions/hud/state/index.ts";
import { renderStyleForSource, type ThemeLike } from "../extensions/hud/ui/style.ts";

type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;

function createTheme(appearance: "dark" | "light", mode: "truecolor" | "256color"): Theme {
	const accent = appearance === "dark" ? "#cba6f7" : "#8839ef";
	const foreground = Object.fromEntries(
		[
			"accent",
			"syntaxVariable",
			"syntaxType",
			"syntaxNumber",
			"syntaxFunction",
			"syntaxKeyword",
			"success",
			"error",
			"warning",
			"toolDiffAdded",
			"toolDiffRemoved",
			"customMessageLabel",
			"thinkingXhigh",
		].map((token) => [token, accent]),
	);
	return new Theme(
		{
			...foreground,
			text: appearance === "dark" ? "#cdd6f4" : "#4c4f69",
			muted: appearance === "dark" ? "#a6adc8" : "#6c6f85",
			dim: appearance === "dark" ? "#6c7086" : "#9ca0b0",
		} as ConstructorParameters<typeof Theme>[0],
		{ selectedBg: appearance === "dark" ? "#1e1e2e" : "#eff1f5" } as ConstructorParameters<
			typeof Theme
		>[1],
		mode,
		{ appearance },
	);
}

function setupFooter(initialTheme: Theme, footerFormat = "") {
	let activeTheme = initialTheme;
	const liveTheme: ThemeLike = {
		fg: (color, text) => activeTheme.fg(color as Parameters<Theme["fg"]>[0], text),
		style: (text, options) => activeTheme.style(text, options),
		bold: (text) => activeTheme.bold(text),
		italic: (text) => activeTheme.italic(text),
		underline: (text) => activeTheme.underline(text),
	};
	const state = createInitialState(emptyGitStatus());
	state.branch = "main";
	state.runtime = {
		...runtimeMetadata.find((runtime) => runtime.name === "gleam")!,
		version: "v1",
	};
	const config = mergeConfig({ icons: { mode: "ascii" }, contextStyle: "text", footerFormat });
	let footer: ReturnType<FooterFactory> | undefined;
	const ctx = {
		cwd: "/tmp/hud-theme-test",
		getContextUsage: () => ({ percent: 80, contextWindow: 200_000 }),
		ui: {
			setFooter(factory: FooterFactory) {
				footer = factory(
					{ requestRender() {} } as never,
					liveTheme as never,
					{
						getExtensionStatuses: () => new Map(),
						onBranchChange: () => () => {},
					} as never,
				);
			},
		},
	} as unknown as ExtensionContext;
	installFooter(ctx, state, () => config, {
		setRequestRender() {},
		scheduleProjectRefresh() {},
	});
	return {
		render: () => footer!.render(400).join("\n"),
		setTheme(theme: Theme) {
			activeTheme = theme;
			footer!.invalidate();
		},
		dispose: () => footer?.dispose?.(),
	};
}

describe("automatic HUD theme colors", () => {
	it("defaults to semantic theme colors, including configs without a color source", () => {
		expect(defaultConfig.colorSources.starship).toBe("theme");
		for (const input of [{}, { colorSources: { starship: "invalid" } }]) {
			const config = mergeConfig(input);
			expect(config.colorSources.starship).toBe("theme");
			for (const style of Object.values(config.colors)) {
				expect(style).not.toMatch(/#|fg:|bg:|\d/);
			}
			expect(config.colors.cwd).toBe("bold accent");
			expect(config.colors.contextNormal).toBe("success");
			expect(config.colors.contextWarning).toBe("bold warning");
			expect(config.colors.contextError).toBe("bold error");
		}
	});

	it("keeps the Sakura RGB palette when terminal colors are selected explicitly", () => {
		const config = mergeConfig({ colorSources: { starship: "terminal" } });
		expect(config.colors.cwd).toBe("bold #F2A7C6");
		expect(config.colors.gitBranch).toBe("bold #C7B8F5");
		expect(config.colors.contextError).toBe("bold #FF8FA3");
		for (const style of Object.values(config.colors)) expect(style).toMatch(/#[\da-f]{6}/i);
	});

	it("switches default palettes without persisting them or replacing custom colors", () => {
		const dir = mkdtempSync(join(tmpdir(), "hud-theme-config-"));
		const path = join(dir, "config.json");
		try {
			writeFileSync(path, JSON.stringify({ colors: { cost: "bold #abcdef" } }));
			const terminal = saveColorSourcesPatch({ starship: "terminal" }, path);
			expect(terminal.colors.cwd).toBe("bold #F2A7C6");
			const themed = saveColorSourcesPatch({ starship: "theme" }, path);
			expect(themed.colors.cwd).toBe("bold accent");
			expect(themed.colors.cost).toBe("bold #abcdef");
			expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
				colors: { cost: "bold #abcdef" },
				colorSources: { starship: "theme" },
			});
			const theme = createTheme("dark", "truecolor");
			expect(renderStyleForSource(theme, "theme", themed.colors.cost, "cost")).toBe(
				theme.style("cost", { fg: { kind: "rgb", r: 171, g: 205, b: 239 }, bold: true }),
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	for (const mode of ["truecolor", "256color"] as const) {
		for (const format of ["", "$cwd $git_branch $runtime $context $cost"]) {
			it(`recolors ${format ? "custom templates" : "default rows"} on dark/light switches (${mode})`, () => {
				const dark = createTheme("dark", mode);
				const light = createTheme("light", mode);
				const footer = setupFooter(dark, format);
				try {
					const before = footer.render();
					expect(before).toContain(dark.fg("accent", dark.bold("hud-theme-test")));
					expect(before).toContain(dark.fg("warning", dark.bold("80%/200k")));
					footer.setTheme(light);
					const after = footer.render();
					expect(after).toContain(light.fg("accent", light.bold("hud-theme-test")));
					expect(after).toContain(light.fg("warning", light.bold("80%/200k")));
					expect(after).not.toBe(before);
					expect(stripVTControlCharacters(after)).toBe(stripVTControlCharacters(before));
					expect(after).not.toContain("38;2;242;167;198");
					expect(after).not.toContain("38;2;255;175;243");
					if (mode === "256color") expect(after).not.toMatch(/\x1b\[(?:38|48);2;/);
				} finally {
					footer.dispose();
				}
			});
		}
	}

	it("gives every built-in runtime a theme-compatible style while retaining its terminal style", () => {
		const theme: ThemeLike = { fg: (color, text) => `<${color}>${text}` };
		for (const runtime of runtimeMetadata) {
			const style = runtime.themeStyle ?? runtime.style;
			const rendered = renderStyleForSource(theme, "theme", style, "runtime");
			expect(rendered, runtime.name).toMatch(/^<\w+>runtime$/);
			expect(rendered, runtime.name).not.toContain("\x1b[");
		}
		expect(runtimeMetadata.find((runtime) => runtime.name === "gleam")?.style).toBe("bold #FFAFF3");
		expect(runtimeMetadata.find((runtime) => runtime.name === "typst")?.style).toBe("bold #0093A7");
	});
});
