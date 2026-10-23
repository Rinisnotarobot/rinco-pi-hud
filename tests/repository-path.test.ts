import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import {
	emptyGitStatus,
	readGitStatus,
	type GitReadResult,
} from "../extensions/hud/segments/git.ts";
import { applyProjectRefreshToState } from "../extensions/hud/segments/project-state.ts";
import { repositoryRelativePath } from "../extensions/hud/segments/repository-root.ts";
import { createInitialState } from "../extensions/hud/state/index.ts";
import { formatCwdLabel } from "../extensions/hud/telemetry/format.ts";

const temporaryPaths: string[] = [];
afterEach(() => {
	for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});
function tempDirectory() {
	const path = realpathSync(mkdtempSync(join(tmpdir(), "hud-repository-path-")));
	temporaryPaths.push(path);
	return path;
}
function git(cwd: string, ...args: string[]) {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("repository root is '.', nested labels contain only relative components", () => {
	const options = {
		mode: "repository" as const,
		repositoryRoot: "/home/me/repo",
		home: "/home/me",
	};
	assert.equal(formatCwdLabel("/home/me/repo/", "dir", options), "dir .");
	assert.equal(formatCwdLabel("/home/me/repo/packages/app", "", options), "packages/app");
	assert.equal(formatCwdLabel("/home/me/repo/packages/app", "", { ...options, depth: 1 }), "…/app");
	assert.equal(
		formatCwdLabel("/home/me/repo/packages/app", "", { ...options, depth: 2 }),
		"packages/app",
	);
	assert.equal(formatCwdLabel("/home/me/repo", "", { ...options, depth: 1 }), ".");
});

test("containment handles root, separators, traversal, siblings and invalid roots safely", () => {
	assert.equal(repositoryRelativePath("/repo/src/../lib/", "/repo/"), "lib");
	assert.equal(repositoryRelativePath("/repo", "/"), "repo");
	assert.equal(repositoryRelativePath("/repo-sibling/src", "/repo"), undefined);
	assert.equal(repositoryRelativePath("/repo/../outside", "/repo"), undefined);
	assert.equal(repositoryRelativePath("/repo", "repo"), undefined);
	assert.equal(repositoryRelativePath("repo/src", "/repo"), undefined);
	assert.equal(repositoryRelativePath("/repo", ""), undefined);
	assert.equal(repositoryRelativePath("/repo", "/repo\0"), undefined);
	assert.equal(repositoryRelativePath("C:\\repo\\src", "C:\\repo"), "src");
	assert.equal(repositoryRelativePath("D:/repo/src", "C:/repo"), undefined);
	assert.equal(repositoryRelativePath("C:/repo2/src", "C:/repo"), undefined);
	assert.equal(repositoryRelativePath("//server/share/repo/src", "//server/share/repo"), "src");
});

test("unsafe or absent repository root falls back to unlimited full path, including ~", () => {
	for (const repositoryRoot of [
		undefined,
		"/home/me/repo",
		"/elsewhere",
		"relative",
		"/home/me/repo2/../../elsewhere",
	]) {
		assert.equal(
			formatCwdLabel("/home/me/repo2/a/b", "", {
				mode: "repository",
				repositoryRoot,
				home: "/home/me",
				depth: 1,
			}),
			"~/repo2/a/b",
		);
	}
	assert.equal(
		formatCwdLabel("/opt/project/a/b", "", { mode: "repository", depth: 1, home: "/home/me" }),
		"/opt/project/a/b",
	);
	assert.equal(
		formatCwdLabel("/home/me", "", { mode: "repository", depth: 1, home: "/home/me" }),
		"~",
	);
});

test("existing full depth and basename modes are unchanged", () => {
	assert.equal(
		formatCwdLabel("/home/me/repo/a/b", "", { mode: "full", depth: 1, home: "/home/me" }),
		"…/b",
	);
	assert.equal(
		formatCwdLabel("/home/me/repo/a/b", "", { mode: "full", depth: 0, home: "/home/me" }),
		"~/repo/a/b",
	);
	assert.equal(
		formatCwdLabel("/home/me/repo/a/b", "", { depth: 1, repositoryRoot: "/home/me/repo" }),
		"b",
	);
});

test("git refresh obtains actual root from nested cwd and a .git-file worktree", async () => {
	const base = tempDirectory();
	const repository = join(base, "main");
	mkdirSync(repository);
	git(repository, "init");
	git(
		repository,
		"-c",
		"user.name=HUD Test",
		"-c",
		"user.email=hud@example.invalid",
		"commit",
		"--allow-empty",
		"-m",
		"initial",
	);
	const nested = join(repository, "a", "b");
	mkdirSync(nested, { recursive: true });
	const result = await readGitStatus(nested);
	assert.equal(result.kind, "ok");
	if (result.kind !== "ok") throw new Error("Expected repository status");
	assert.equal(result.repositoryRoot, repository);
	const worktree = join(base, "worktree");
	git(repository, "worktree", "add", "-b", "hud-path-test", worktree);
	assert.match(readFileSync(join(worktree, ".git"), "utf8"), /^gitdir: /);
	const worktreeNested = join(worktree, "src");
	mkdirSync(worktreeNested);
	const worktreeResult = await readGitStatus(worktreeNested);
	assert.equal(worktreeResult.kind, "ok");
	if (worktreeResult.kind !== "ok") throw new Error("Expected worktree status");
	assert.equal(worktreeResult.repositoryRoot, worktree);
	assert.equal(
		formatCwdLabel(worktreeNested, "", {
			mode: "repository",
			repositoryRoot: worktreeResult.repositoryRoot,
		}),
		"src",
	);
});

test("every failed, non-repository or rootless refresh clears root without losing last-good labels", () => {
	for (const result of [
		{ kind: "error" },
		{ kind: "not_a_repo" },
		{ kind: "ok", status: emptyGitStatus() },
	] as GitReadResult[]) {
		const state = createInitialState(emptyGitStatus());
		applyProjectRefreshToState(state, {
			cwd: "/repo/src",
			previousCwd: undefined,
			git: { kind: "ok", status: { ...emptyGitStatus(), branch: "main" }, repositoryRoot: "/repo" },
			runtime: { kind: "ok" },
		});
		assert.equal(state.repositoryRoot, "/repo");
		assert.equal(state.repositoryCwd, "/repo/src");
		applyProjectRefreshToState(state, {
			cwd: "/repo/src",
			previousCwd: "/repo/src",
			git: result,
			runtime: { kind: "ok" },
		});
		assert.equal(state.repositoryRoot, undefined);
		assert.equal(state.repositoryCwd, "/repo/src");
		if (result.kind === "error") assert.equal(state.branch, "main");
	}
});

test("cwd change never revives old root; successful refresh replaces cwd and root together", () => {
	const state = createInitialState(emptyGitStatus());
	state.repositoryRoot = "/old";
	state.repositoryCwd = "/old/src";
	const cwd = "/new/src";
	assert.equal(
		formatCwdLabel(cwd, "", {
			mode: "repository",
			repositoryRoot: state.repositoryCwd === cwd ? state.repositoryRoot : undefined,
		}),
		cwd,
	);
	applyProjectRefreshToState(state, {
		cwd,
		previousCwd: "/old/src",
		git: { kind: "error" },
		runtime: { kind: "ok" },
	});
	assert.equal(state.repositoryRoot, undefined);
	assert.equal(state.repositoryCwd, cwd);
	applyProjectRefreshToState(state, {
		cwd,
		previousCwd: cwd,
		git: { kind: "ok", status: emptyGitStatus(), repositoryRoot: "/new" },
		runtime: { kind: "ok" },
	});
	assert.equal(state.repositoryRoot, "/new");
	assert.equal(state.repositoryCwd, cwd);
});

test("removing a real repository marker clears cached root on refresh", async () => {
	const cwd = tempDirectory();
	git(cwd, "init");
	writeFileSync(join(cwd, "file"), "test");
	const state = createInitialState(emptyGitStatus());
	applyProjectRefreshToState(state, {
		cwd,
		previousCwd: undefined,
		git: await readGitStatus(cwd),
		runtime: { kind: "ok" },
	});
	assert.equal(state.repositoryRoot, cwd);
	rmSync(join(cwd, ".git"), { recursive: true, force: true });
	const result = await readGitStatus(cwd);
	assert.equal(result.kind, "not_a_repo");
	applyProjectRefreshToState(state, {
		cwd,
		previousCwd: cwd,
		git: result,
		runtime: { kind: "ok" },
	});
	assert.equal(state.repositoryRoot, undefined);
});
