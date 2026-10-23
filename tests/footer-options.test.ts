import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { registerZentuiSettingsCommand } from "../extensions/hud/commands/settings.ts";
import {
	defaultConfig,
	type FooterOptionsPatch,
	saveFooterOptionsPatch,
} from "../extensions/hud/config/config.ts";

test("footer options persist supplied fields without destroying unknown configuration", async () => {
	const root = await mkdtemp(join(tmpdir(), "hud-footer-options-"));
	const path = join(root, "config.json");
	try {
		const original = {
			unknown: { nested: true },
			features: { statusLine: false, future: 3 },
			footerFormat: "$cwd",
			customValueColorMode: "original",
		};
		await writeFile(path, JSON.stringify(original));
		const config = saveFooterOptionsPatch(
			{
				compactFooterFormat: "\u001b[31m$cwd\u0000" + "x".repeat(5000),
				responsiveFooter: false,
				compactFooterMaxLines: 8,
				footerStyle: "hidden",
			},
			path,
		);
		const saved = JSON.parse(await readFile(path, "utf8"));
		assert.deepEqual(saved.unknown, original.unknown);
		assert.deepEqual(saved.features, original.features);
		assert.equal(saved.footerFormat, "$cwd");
		assert.equal(saved.customValueColorMode, "original");
		assert.ok(saved.compactFooterFormat.length <= 4096);
		assert.ok(!/[\u0000\u001b]/.test(saved.compactFooterFormat));
		assert.equal(config.compactFooterMaxLines, 8);
		assert.equal(config.footerStyle, "hidden");
		assert.equal(config.responsiveFooter, false);
		saveFooterOptionsPatch(
			{ compactFooterFormat: "", customValueColorMode: "zentui", compactFooterMaxLines: 1 },
			path,
		);
		const cleared = JSON.parse(await readFile(path, "utf8"));
		assert.equal(cleared.compactFooterFormat, "");
		assert.equal(cleared.customValueColorMode, "zentui");
		assert.equal(cleared.compactFooterMaxLines, 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("footer patches reject malformed values and unrecognized keys", async () => {
	const root = await mkdtemp(join(tmpdir(), "hud-footer-invalid-"));
	const path = join(root, "config.json");
	try {
		const original = {
			future: true,
			compactFooterMaxLines: 3,
			compactFooterFormat: "$cwd",
			responsiveFooter: true,
			footerStyle: "hud",
			customValueColorMode: "original",
		};
		await writeFile(path, JSON.stringify(original));
		for (const lines of [0, 9, 1.5, NaN, Infinity, "2", null]) {
			saveFooterOptionsPatch(
				{
					compactFooterMaxLines: lines,
					compactFooterFormat: 42,
					responsiveFooter: "false",
					footerStyle: "native",
					customValueColorMode: "invalid",
					injected: true,
				} as unknown as FooterOptionsPatch,
				path,
			);
			assert.deepEqual(JSON.parse(await readFile(path, "utf8")), original);
		}
		for (const patch of [null, undefined, [], Object.create({ footerStyle: "hidden" })]) {
			saveFooterOptionsPatch(patch as FooterOptionsPatch, path);
			assert.deepEqual(JSON.parse(await readFile(path, "utf8")), original);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function commandHarness() {
	type Options = Parameters<
		Parameters<typeof registerZentuiSettingsCommand>[0]["registerCommand"]
	>[1];
	let command: Options | undefined;
	const calls: unknown[] = [];
	const notices: string[] = [];
	const pages: string[][] = [];
	registerZentuiSettingsCommand(
		{
			registerCommand(_name: string, options: Options) {
				command = options;
			},
		} as never,
		{
			getConfig: () => defaultConfig,
			setColorSources() {},
			setUiFeatures(patch) {
				calls.push(["features", patch]);
			},
			setFooterOptions(patch) {
				calls.push(["options", patch]);
			},
			setFooterRows() {},
			setFooterSegments() {},
			setFooterFormat(value) {
				calls.push(["format", value]);
			},
			setIconMode() {},
			setContextStyle() {},
			setSeparator() {},
			setPathDisplay() {},
			setGitBranch() {},
			getActiveExtensionStatuses: () => new Map([["example", "status"]]),
			setExtensionStatusPlacement() {
				throw new Error("must not change status placement");
			},
			setExtensionStatusColorMode() {
				throw new Error("must not change status colors");
			},
			requestRender() {},
			settingsListTheme: {
				label: (s: string) => s,
				value: (s: string) => s,
				description: (s: string) => s,
				cursor: "> ",
				hint: (s: string) => s,
			} as never,
		},
	);
	return {
		calls,
		notices,
		pages,
		complete: (prefix: string) => command?.getArgumentCompletions?.(prefix),
		async invoke(args: string) {
			assert.ok(command);
			await command.handler(args, {
				hasUI: true,
				ui: {
					notify: (message: string) => notices.push(message),
					custom: async (
						factory: (
							tui: unknown,
							theme: unknown,
							keys: unknown,
							done: unknown,
						) => { render(width: number): string[] },
					) => {
						const theme = { fg: (_color: string, s: string) => s, bold: (s: string) => s };
						const view = factory({ requestRender() {} }, theme, {}, () => {});
						pages.push(view.render(200));
					},
				},
			} as never);
		},
	};
}

test("footer direct commands preserve ordering and clear compact templates", async () => {
	const harness = commandHarness();
	await harness.invoke("footer hidden");
	await harness.invoke("footer hud");
	await harness.invoke("footer native");
	await harness.invoke('compact-format "$cwd $context"');
	await harness.invoke("compact-format clear");
	await harness.invoke('format "$model"');
	assert.deepEqual(harness.calls, [
		["options", { footerStyle: "hidden" }],
		["features", { statusLine: true }],
		["options", { footerStyle: "hud" }],
		["features", { statusLine: true }],
		["features", { statusLine: false }],
		["options", { compactFooterFormat: "$cwd $context" }],
		["options", { compactFooterFormat: "" }],
		["format", "$model"],
	]);
	assert.ok((await harness.complete("compact-format"))?.length);
	assert.equal((await harness.complete("footer"))?.length, 3);
});

test("invalid footer command arguments do not mutate settings", async () => {
	const harness = commandHarness();
	for (const args of [
		"footer",
		"footer unknown",
		"footer hud extra",
		"compact-formatting nope",
		"formatting nope",
	])
		await harness.invoke(args);
	assert.deepEqual(harness.calls, []);
	assert.equal(harness.notices.length, 5);
});

test("settings shortcuts open their corresponding pages", async () => {
	const harness = commandHarness();
	await harness.invoke("layout");
	await harness.invoke("extensions");
	await harness.invoke("segments");
	assert.equal(harness.pages.length, 3);
	assert.match(harness.pages[0]!.join("\n"), /Footer content/);
	assert.match(harness.pages[0]!.join("\n"), /Responsive compact/);
	assert.match(harness.pages[0]!.join("\n"), /Compact max lines/);
	assert.match(harness.pages[0]!.join("\n"), /Custom value colors/);
	assert.match(harness.pages[1]!.join("\n"), /example placement/);
	assert.match(harness.pages[2]!.join("\n"), /Current directory/);
	assert.deepEqual(harness.calls, []);
});
