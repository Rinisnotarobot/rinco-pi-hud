import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Count MCP namespaces with exposed runtime tools, not configuration entries or connections.
 * Pi owns configuration, trust, credentials, and connections. getMcpServers() only lists
 * extension registrations, whereas getAllTools() includes tools from file-configured servers
 * and extensions, including codemode/deferred tools absent from the active tool set.
 * Hidden tools remain registered after a server is disabled or removed, so exclude them.
 * Resource-only servers cannot be identified through this public API and are not counted.
 */
export function getMcpServerCount(pi: Pick<ExtensionAPI, "getAllTools">): number {
	try {
		const namespaces = new Set<string>();
		for (const tool of pi.getAllTools()) {
			const namespace = tool.namespace?.name;
			if (
				tool.exposure !== "hidden" &&
				namespace &&
				/^mcp__[A-Za-z0-9_]+$/.test(namespace) &&
				tool.name.startsWith(`${namespace}__`)
			) {
				namespaces.add(namespace);
			}
		}
		return namespaces.size;
	} catch {
		return 0;
	}
}
