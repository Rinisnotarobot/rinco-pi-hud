import { posix, win32 } from "node:path";

/** Pure containment check: never interpret a sibling or an escaped path as repository-relative. */
export function repositoryRelativePath(cwd: string, root: string | undefined): string | undefined {
	if (!root || /[\0\r\n]/.test(cwd) || /[\0\r\n]/.test(root)) return undefined;
	const normalizedCwd = cwd.replace(/\\/g, "/");
	const normalizedRoot = root.replace(/\\/g, "/");
	const windows = /^[A-Za-z]:\//.test(normalizedCwd) || normalizedCwd.startsWith("//");
	const rootWindows = /^[A-Za-z]:\//.test(normalizedRoot) || normalizedRoot.startsWith("//");
	if (windows !== rootWindows) return undefined;
	const paths = windows ? win32 : posix;
	if (!paths.isAbsolute(normalizedCwd) || !paths.isAbsolute(normalizedRoot)) return undefined;
	const relative = paths.relative(normalizedRoot, normalizedCwd).replace(/\\/g, "/");
	if (relative === ".." || relative.startsWith("../") || paths.isAbsolute(relative)) {
		return undefined;
	}
	return relative || ".";
}
