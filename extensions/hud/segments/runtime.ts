import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runtimeDefinitions, type RuntimeDef } from "./runtime-definitions.js";

export type RuntimeMetadata = {
	name: string;
	symbol: string;
	style: string;
};

export type RuntimeInfo = Pick<RuntimeMetadata, "name" | "symbol" | "style"> & {
	version?: string;
};

export type RuntimeReadResult = { kind: "ok"; runtime?: RuntimeInfo } | { kind: "error" };

type RuntimeCacheEntry = {
	fingerprint: string;
	runtime: RuntimeInfo | undefined;
};

const RUNTIME_CACHE_MAX = 32;
const runtimeInfoCache = new Map<string, RuntimeCacheEntry>();

export function clearRuntimeInfoCache(): void {
	runtimeInfoCache.clear();
}

function topLevelFingerprint(entries: readonly string[]): string {
	return entries.slice().sort().join("\0");
}

function cacheRuntimeInfo(
	cwd: string,
	fingerprint: string,
	runtime: RuntimeInfo | undefined,
): void {
	// Drop prior fingerprints for the same cwd so stale marker sets do not linger.
	for (const key of runtimeInfoCache.keys()) {
		if (key === cwd || key.startsWith(`${cwd}\0`)) runtimeInfoCache.delete(key);
	}
	const key = `${cwd}\0${fingerprint}`;
	runtimeInfoCache.set(key, { fingerprint, runtime });
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
	({ name, symbol, style }) => ({
		name,
		symbol,
		style,
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

	const fingerprint = topLevelFingerprint(entries);
	const cacheKey = `${cwd}\0${fingerprint}`;
	const cached = runtimeInfoCache.get(cacheKey);
	if (cached && cached.fingerprint === fingerprint) {
		return { kind: "ok", runtime: cached.runtime };
	}

	try {
		const runtime = detectRuntime(cwd, entries);
		if (!runtime) {
			cacheRuntimeInfo(cwd, fingerprint, undefined);
			return { kind: "ok", runtime: undefined };
		}
		const info: RuntimeInfo = {
			name: runtime.name,
			symbol: runtime.symbol,
			style: runtime.style,
			version: await runtime.version(cwd),
		};
		cacheRuntimeInfo(cwd, fingerprint, info);
		return { kind: "ok", runtime: info };
	} catch {
		return { kind: "error" };
	}
}
