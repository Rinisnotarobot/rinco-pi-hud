import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { registerZentuiSettingsCommand } from "../extensions/hud/commands/settings.ts";
import { mergeConfig } from "../extensions/hud/config/normalize.ts";
import { saveFooterRowsPatch } from "../extensions/hud/config/persist.ts";
import { defaultConfig, type FooterRowsConfig } from "../extensions/hud/config/schema.ts";

test("footer rows are visible by default and normalize independent switches", () => {
	const defaults = mergeConfig({});
	const configured = mergeConfig({
		footerRows: {
			project: false,
			activity: false,
		},
	});

	assert.deepEqual(defaults.footerRows, {
		project: true,
		session: true,
		activity: true,
		usage: true,
	});
	assert.deepEqual(configured.footerRows, {
		project: false,
		session: true,
		activity: false,
		usage: true,
	});
});

test("footer row switches persist independently", async () => {
	const root = await mkdtemp(join(tmpdir(), "hud-row-controls-"));
	const path = join(root, "config.json");
	try {
		const config = saveFooterRowsPatch({ project: false, usage: false }, path);

		assert.equal(config.footerRows.project, false);
		assert.equal(config.footerRows.session, true);
		assert.equal(config.footerRows.activity, true);
		assert.equal(config.footerRows.usage, false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

type CommandHandler = (args: string, ctx: unknown) => Promise<void>;

function createCommandHarness(footerRows: FooterRowsConfig = defaultConfig.footerRows) {
	let handler: CommandHandler | undefined;
	let completions: ((prefix: string) => Array<{ value: string }> | null) | undefined;
	const patches: Partial<FooterRowsConfig>[] = [];
	const notifications: Array<{ message: string; level: string }> = [];
	let renderRequests = 0;

	registerZentuiSettingsCommand(
		{
			registerCommand(
				_name: string,
				options: { handler: CommandHandler; getArgumentCompletions: typeof completions },
			) {
				handler = options.handler;
				completions = options.getArgumentCompletions;
			},
		} as never,
		{
			getConfig: () => ({ ...defaultConfig, footerRows: { ...footerRows } }),
			setColorSources: () => {},
			setUiFeatures: () => {},
			setFooterRows: (patch) => patches.push(patch),
			setFooterSegments: () => {},
			setFooterFormat: () => {},
			setIconMode: () => {},
			setContextStyle: () => {},
			setSeparator: () => {},
			setPathDisplay: () => {},
			setGitBranch: () => {},
			getActiveExtensionStatuses: () => new Map(),
			setExtensionStatusPlacement: () => {},
			setExtensionStatusColorMode: () => {},
			requestRender: () => {
				renderRequests += 1;
			},
		},
	);

	return {
		invoke: async (args: string) => {
			assert.ok(handler);
			await handler(args, {
				hasUI: true,
				ui: {
					notify: (message: string, level: string) => notifications.push({ message, level }),
				},
			});
		},
		complete: (prefix: string) => completions?.(prefix) ?? null,
		patches,
		notifications,
		get renderRequests() {
			return renderRequests;
		},
	};
}

for (const row of ["project", "session", "activity", "usage"] as const) {
	test(`/zentui row ${row} toggle flips and renders that row`, async () => {
		const harness = createCommandHarness();

		await harness.invoke(`row ${row} toggle`);

		assert.deepEqual(harness.patches, [{ [row]: false }]);
		assert.equal(harness.renderRequests, 1);
		assert.deepEqual(harness.notifications, [
			{ message: `${row[0]?.toUpperCase()}${row.slice(1)} row: disabled`, level: "info" },
		]);
	});
}

test("footer row command supports explicit enable and disable actions", async () => {
	const disabledUsage = { ...defaultConfig.footerRows, usage: false };
	const enableHarness = createCommandHarness(disabledUsage);
	const disableHarness = createCommandHarness();

	await enableHarness.invoke("row usage enable");
	await disableHarness.invoke("row project disable");

	assert.deepEqual(enableHarness.patches, [{ usage: true }]);
	assert.deepEqual(disableHarness.patches, [{ project: false }]);
});

test("footer row command rejects unknown rows and advertises row completions", async () => {
	const harness = createCommandHarness();

	await harness.invoke("row secrets toggle");

	assert.deepEqual(harness.patches, []);
	assert.equal(harness.notifications[0]?.level, "warning");
	assert.match(
		harness.notifications[0]?.message ?? "",
		/row \[project\|session\|activity\|usage\]/,
	);
	assert.deepEqual(
		harness.complete("row pro")?.map((item) => item.value),
		["row project enable", "row project disable", "row project toggle"],
	);
});
