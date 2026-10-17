import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test, vi } from "vitest";
import { clearRuntimeInfoCache, readRuntimeInfo } from "../extensions/hud/segments/runtime.ts";

const { version, envVersion } = vi.hoisted(() => ({
	version: vi.fn<() => Promise<string | undefined>>(),
	envVersion: vi.fn<() => Promise<string | undefined>>(),
}));
// Entire definition table is mocked: no test can launch Python or another toolchain.
vi.mock("../extensions/hud/segments/runtime-definitions.ts", () => ({
	runtimeDefinitions: [
		{
			name: "python",
			symbol: "py",
			style: "yellow",
			detect: { files: ["pyproject.toml"] },
			version,
		},
		{
			name: "conda",
			symbol: "c",
			style: "green",
			detect: {
				env: (env: Record<string, string | undefined>) =>
					Boolean(env.CONDA_DEFAULT_ENV) && !env.PIXI_ENVIRONMENT_NAME,
			},
			version: envVersion,
		},
	],
}));

let cwd: string;
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
	clearRuntimeInfoCache();
	version.mockResolvedValue("v3.12");
	envVersion.mockResolvedValue(undefined);
	vi.stubEnv("CONDA_DEFAULT_ENV", undefined);
	vi.stubEnv("PIXI_ENVIRONMENT_NAME", undefined);
	cwd = mkdtempSync(join(tmpdir(), "hud-runtime-cache-"));
	writeFileSync(join(cwd, "pyproject.toml"), "");
});
afterEach(() => {
	clearRuntimeInfoCache();
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.resetAllMocks();
	rmSync(cwd, { recursive: true, force: true });
});

async function runtimeVersion() {
	const result = await readRuntimeInfo(cwd);
	assert.equal(result.kind, "ok");
	return result.kind === "ok" ? result.runtime?.version : undefined;
}

function deferVersion() {
	let resolve!: (value: string | undefined) => void;
	const promise = new Promise<string | undefined>((done) => {
		resolve = done;
	});
	version.mockReturnValueOnce(promise);
	return resolve;
}

test("successful versions are cached for 60 seconds and then reprobed", async () => {
	assert.equal(await runtimeVersion(), "v3.12");
	version.mockResolvedValue("v3.13");
	await vi.advanceTimersByTimeAsync(59_999);
	assert.equal(await runtimeVersion(), "v3.12");
	assert.equal(version.mock.calls.length, 1);
	await vi.advanceTimersByTimeAsync(1);
	assert.equal(await runtimeVersion(), "v3.13");
	assert.equal(version.mock.calls.length, 2);
});

test("missing versions use a short TTL and retry even if markers do not change", async () => {
	version.mockResolvedValueOnce(undefined);
	assert.equal(await runtimeVersion(), undefined);
	await vi.advanceTimersByTimeAsync(4_999);
	assert.equal(await runtimeVersion(), undefined);
	assert.equal(version.mock.calls.length, 1);
	await vi.advanceTimersByTimeAsync(1);
	assert.equal(await runtimeVersion(), "v3.12");
	assert.equal(version.mock.calls.length, 2);
});

test("rejected probes are briefly cached, then retried successfully", async () => {
	version.mockRejectedValueOnce(new Error("transient probe failure"));
	assert.deepEqual(await readRuntimeInfo(cwd), { kind: "error" });
	await vi.advanceTimersByTimeAsync(4_999);
	assert.deepEqual(await readRuntimeInfo(cwd), { kind: "error" });
	assert.equal(version.mock.calls.length, 1);
	await vi.advanceTimersByTimeAsync(1);
	assert.equal(await runtimeVersion(), "v3.12");
	assert.equal(version.mock.calls.length, 2);
});

test("directory read errors do not prevent retry after recovery", async () => {
	const missing = join(cwd, "missing");
	assert.deepEqual(await readRuntimeInfo(missing), { kind: "error" });
	mkdirSync(missing);
	writeFileSync(join(missing, "pyproject.toml"), "");
	const result = await readRuntimeInfo(missing);
	assert.equal(result.kind === "ok" && result.runtime?.version, "v3.12");
});

test("no-runtime results expire quickly so unchanged directory entries can be rechecked", async () => {
	rmSync(join(cwd, "pyproject.toml"));
	const target = join(tmpdir(), `${cwd.split("/").pop()}-manifest`);
	symlinkSync(target, join(cwd, "pyproject.toml"));
	assert.deepEqual(await readRuntimeInfo(cwd), { kind: "ok", runtime: undefined });
	try {
		// The marker becomes valid without changing the top-level entry names.
		writeFileSync(target, "");
		await vi.advanceTimersByTimeAsync(4_999);
		assert.deepEqual(await readRuntimeInfo(cwd), { kind: "ok", runtime: undefined });
		await vi.advanceTimersByTimeAsync(1);
		assert.equal(await runtimeVersion(), "v3.12");
		assert.equal(version.mock.calls.length, 1);
	} finally {
		rmSync(target, { force: true });
	}
});

test("cwd and directory marker changes bypass cached versions", async () => {
	await runtimeVersion();
	writeFileSync(join(cwd, "new-file"), "");
	await runtimeVersion();
	assert.equal(version.mock.calls.length, 2);
	const other = mkdtempSync(join(tmpdir(), "hud-runtime-other-"));
	try {
		writeFileSync(join(other, "pyproject.toml"), "");
		await readRuntimeInfo(other);
		assert.equal(version.mock.calls.length, 3);
	} finally {
		rmSync(other, { recursive: true, force: true });
	}
});

test("PATH changes invalidate version cache immediately", async () => {
	await runtimeVersion();
	vi.stubEnv("PATH", "/mock/toolchain");
	version.mockResolvedValue("v3.13");
	assert.equal(await runtimeVersion(), "v3.13");
	assert.equal(version.mock.calls.length, 2);
});

test("environment detection changes invalidate both no-runtime and detected-runtime cache", async () => {
	rmSync(join(cwd, "pyproject.toml"));
	assert.deepEqual(await readRuntimeInfo(cwd), { kind: "ok", runtime: undefined });
	vi.stubEnv("CONDA_DEFAULT_ENV", "test-env");
	const detected = await readRuntimeInfo(cwd);
	assert.equal(detected.kind === "ok" && detected.runtime?.name, "conda");
	vi.stubEnv("PIXI_ENVIRONMENT_NAME", "pixi");
	assert.deepEqual(await readRuntimeInfo(cwd), { kind: "ok", runtime: undefined });
	assert.equal(envVersion.mock.calls.length, 1);
});

test("concurrent callers share a probe and its cached result", async () => {
	const resolve = deferVersion();
	const first = readRuntimeInfo(cwd);
	const second = readRuntimeInfo(cwd);
	assert.equal(version.mock.calls.length, 1);
	resolve("v3.12");
	assert.deepEqual(await first, await second);
	await runtimeVersion();
	assert.equal(version.mock.calls.length, 1);
});

test("clear prevents an outstanding probe from repopulating the cache", async () => {
	const resolve = deferVersion();
	const old = readRuntimeInfo(cwd);
	clearRuntimeInfoCache();
	resolve("old");
	await old;
	assert.equal(await runtimeVersion(), "v3.12");
	assert.equal(version.mock.calls.length, 2);
});

test("clear lets a new probe start and old completion cannot overwrite it", async () => {
	const resolveOld = deferVersion();
	const old = readRuntimeInfo(cwd);
	clearRuntimeInfoCache();
	const resolveNew = deferVersion();
	const fresh = readRuntimeInfo(cwd);
	assert.equal(version.mock.calls.length, 2);
	resolveNew("new");
	await fresh;
	resolveOld("old");
	await old;
	assert.equal(await runtimeVersion(), "new");
	assert.equal(version.mock.calls.length, 2);
});

test("old probe cleanup cannot remove the new in-flight probe after clear", async () => {
	const resolveOld = deferVersion();
	const old = readRuntimeInfo(cwd);
	clearRuntimeInfoCache();
	const resolveNew = deferVersion();
	const fresh = readRuntimeInfo(cwd);
	resolveOld("old");
	await old;
	const joined = readRuntimeInfo(cwd);
	assert.equal(version.mock.calls.length, 2);
	resolveNew("new");
	assert.deepEqual(await joined, await fresh);
});
