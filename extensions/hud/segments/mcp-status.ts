import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_CONFIG_BYTES = 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readServerNames(path: string): string[] {
	try {
		const stats = statSync(path);
		if (!stats.isFile() || stats.size > MAX_CONFIG_BYTES) return [];
		const config: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(config) || !isRecord(config.mcpServers)) return [];
		return Object.entries(config.mcpServers)
			.filter(([name, entry]) => /^[A-Za-z0-9_-]+$/.test(name) && isRecord(entry))
			.map(([name]) => name);
	} catch {
		return [];
	}
}

/** Count file-configured server entries, including disabled ones, without resolving secrets
 * or starting connections. Project entries override global entries with the same name.
 * This is not a connection count or a validation of individual server settings. */
export function countConfiguredMcpServers(cwd: string, agentDir: string): number {
	const globalNames = agentDir ? readServerNames(join(agentDir, "mcp.json")) : [];
	const projectNames = readServerNames(join(cwd, ".pi", "mcp.json"));
	return new Set([...globalNames, ...projectNames]).size;
}
