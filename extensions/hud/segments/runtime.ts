import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runtimeDefinitions, type RuntimeDef } from "./runtime-definitions.js";

export type RuntimeMetadata = {
	name: string;
	symbol: string;
	style: string;
	/** Semantic alternative for built-in RGB/indexed terminal styles. */
	themeStyle?: string;
};

export type RuntimeInfo = RuntimeMetadata & {
	version?: string;
};

export type RuntimeReadResult = { kind: "ok"; runtime?: RuntimeInfo } | { kind: "error" };

type RuntimeCacheEntry = {
	result: RuntimeReadResult;
	expiresAt: number;
};

const RUNTIME_CACHE_MAX = 32;
const RUNTIME_CACHE_TTL_MS = 60_000;
const RUNTIME_RETRY_TTL_MS = 5_000;
const runtimeInfoCache = new Map<string, RuntimeCacheEntry>();
const runtimeReadsInFlight = new Map<string, Promise<RuntimeReadResult>>();
let cacheEpoch = 0;

export function clearRuntimeInfoCache(): void {
	cacheEpoch += 1;
	runtimeInfoCache.clear();
	// New callers must not join a probe started before the clear.
	runtimeReadsInFlight.clear();
}

function topLevelFingerprint(entries: readonly string[]): string {
	return entries.slice().sort().join("\0");
}

function cacheRuntimeInfo(key: string, result: RuntimeReadResult): void {
	const ttl =
		result.kind === "ok" && result.runtime?.version ? RUNTIME_CACHE_TTL_MS : RUNTIME_RETRY_TTL_MS;
	runtimeInfoCache.set(key, { result, expiresAt: Date.now() + ttl });
	while (runtimeInfoCache.size > RUNTIME_CACHE_MAX) {
		const oldest = runtimeInfoCache.keys().next().value;
		if (oldest === undefined) break;
		runtimeInfoCache.delete(oldest);
	}
}

export type RuntimeEnvironment = Record<string, string | undefined>;

export type DetectionSpec = {
	extensions?: readonly string[];
	files?: readonly string[];
	folders?: readonly string[];
	env?: (env: RuntimeEnvironment) => boolean;
	excludedFiles?: readonly string[];
};

// --- Detection utilities ---

function hasAnyFile(cwd: string, names: readonly string[]): boolean {
	return names.some((name) => existsSync(join(cwd, name)));
}

function hasAnyFolder(cwd: string, names: readonly string[]): boolean {
	return names.some((name) => {
		try {
			return statSync(join(cwd, name)).isDirectory();
		} catch {
			return false;
		}
	});
}

function entryExtensions(entry: string): string[] {
	const baseName = entry.split(/[\\/]/).pop() ?? entry;
	if (!baseName || baseName.startsWith(".")) return [];

	const firstDot = baseName.indexOf(".");
	if (firstDot === -1) return [];

	const extensions = [baseName.slice(firstDot + 1)];
	const lastDot = baseName.lastIndexOf(".");
	if (lastDot !== firstDot) extensions.push(baseName.slice(lastDot + 1));
	return extensions;
}

function hasAnyExtension(entries: readonly string[], extensions: readonly string[]): boolean {
	const extensionSet = new Set(extensions);
	return entries.some((entry) =>
		entryExtensions(entry).some((extension) => extensionSet.has(extension)),
	);
}

function matchesDetection(
	cwd: string,
	entries: string[],
	spec: DetectionSpec,
	env: RuntimeEnvironment,
): boolean {
	if (spec.excludedFiles && hasAnyFile(cwd, spec.excludedFiles)) return false;
	return Boolean(
		(spec.files && hasAnyFile(cwd, spec.files)) ||
		(spec.folders && hasAnyFolder(cwd, spec.folders)) ||
		(spec.extensions && hasAnyExtension(entries, spec.extensions)) ||
		spec.env?.(env),
	);
}

// Definitions are pre-sorted by priority in runtime-definitions.ts.
const sortedRuntimes = runtimeDefinitions;

export const runtimeMetadata: RuntimeMetadata[] = runtimeDefinitions.map(
	({ name, symbol, style, themeStyle }) => ({
		name,
		symbol,
		style,
		themeStyle,
	}),
);

export function detectRuntime(
	cwd: string,
	entries: string[],
	env: RuntimeEnvironment = process.env,
): RuntimeDef | undefined {
	for (const runtime of sortedRuntimes) {
		if (matchesDetection(cwd, entries, runtime.detect, env)) return runtime;
	}
	return undefined;
}

export async function readRuntimeInfo(cwd: string): Promise<RuntimeReadResult> {
	let entries: string[];
	try {
		entries = readdirSync(cwd);
	} catch {
		// readdir failure is treated as a transient error so last-good can be kept.
		return { kind: "error" };
	}

	// Detection uses shell variables and version commands inherit the environment.
	// Include all variables (including PATH and toolchain-manager settings) so a
	// changed environment never reuses the old probe. JSON avoids key collisions.
	const env = { ...process.env };
	const environment = Object.keys(env)
		.sort()
		.map((key) => [key, env[key]]);
	// Hash environment values so cache keys do not retain plaintext credentials.
	const environmentKey = createHash("sha256").update(JSON.stringify(environment)).digest("hex");
	const cacheKey = JSON.stringify([cwd, topLevelFingerprint(entries), environmentKey]);
	const cached = runtimeInfoCache.get(cacheKey);
	if (cached) {
		if (Date.now() < cached.expiresAt) return cached.result;
		runtimeInfoCache.delete(cacheKey);
	}
	const inFlight = runtimeReadsInFlight.get(cacheKey);
	if (inFlight) return inFlight;

	const epoch = cacheEpoch;
	const read = async (): Promise<RuntimeReadResult> => {
		try {
			const runtime = detectRuntime(cwd, entries, env);
			if (!runtime) return { kind: "ok", runtime: undefined };
			return {
				kind: "ok",
				runtime: {
					name: runtime.name,
					symbol: runtime.symbol,
					style: runtime.style,
					themeStyle: runtime.themeStyle,
					version: await runtime.version(cwd),
				},
			};
		} catch {
			return { kind: "error" };
		}
	};
	const pending = read()
		.then((result) => {
			// Clearing the cache must also invalidate outstanding writers.
			if (epoch === cacheEpoch) cacheRuntimeInfo(cacheKey, result);
			return result;
		})
		.finally(() => {
			if (runtimeReadsInFlight.get(cacheKey) === pending) {
				runtimeReadsInFlight.delete(cacheKey);
			}
		});
	runtimeReadsInFlight.set(cacheKey, pending);
	return pending;
}
