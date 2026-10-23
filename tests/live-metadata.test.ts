import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createLiveMetadata } from "../extensions/hud/segments/live-metadata.ts";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const ctx = (cwd = "/repo") => ({ cwd }) as ExtensionContext;
const result = (stdout: string, code = 0) => ({ stdout, stderr: "", killed: false, code });
const pr = (head = HEAD, checks: unknown = [{ status: "COMPLETED", conclusion: "SUCCESS" }]) =>
	JSON.stringify({
		number: 42,
		url: "https://github.com/Owner/Repo/pull/42",
		state: "OPEN",
		headRefOid: head,
		statusCheckRollup: checks,
	});

function harness(names = ["pr_number", "pr_url", "ci"]) {
	const handlers = new Map<string, (event: never) => void>();
	const demand = new Set(names);
	let active = true;
	let head = HEAD;
	let remote = "origin git@github.com:Owner/Repo.git (fetch)";
	let query: () => Promise<ReturnType<typeof result>> = async () => result(pr());
	const exec = vi.fn(async (command: string, args: string[]) => {
		if (command === "gh") return query();
		if (args.includes("--show-toplevel")) return result("/repo\n/repo/.git");
		if (args[0] === "symbolic-ref") return result("feature");
		if (args[0] === "remote") return result(remote);
		return result(head);
	});
	const pi = {
		exec,
		on: (name: string, handler: (event: never) => void) => {
			handlers.set(name, handler);
		},
	} as unknown as ExtensionAPI;
	const onChange = vi.fn();
	const live = createLiveMetadata(pi, {
		getDemand: () => demand,
		isActive: () => active,
		onChange,
	});
	const emit = (name: string, message?: unknown) => handlers.get(name)?.({ message } as never);
	return {
		live,
		demand,
		exec,
		emit,
		onChange,
		setHead: (value: string) => {
			head = value;
		},
		setRemote: (value: string) => {
			remote = value;
		},
		setQuery: (value: typeof query) => {
			query = value;
		},
		setActive: (value: boolean) => {
			active = value;
		},
	};
}
async function flush() {
	for (let i = 0; i < 120; i++) await Promise.resolve();
}
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("demand-driven GitHub metadata", () => {
	it("does not execute anything for token-only or inactive demand", async () => {
		const h = harness(["token_rate"]);
		h.live.sync(ctx());
		await flush();
		expect(h.exec).not.toHaveBeenCalled();
		h.demand.add("ci");
		h.setActive(false);
		h.live.sync(ctx());
		await flush();
		expect(h.exec).not.toHaveBeenCalled();
		expect(h.live.values().size).toBe(0);
	});

	it("queries read-only PR/head/checks, caches for 30 seconds, and filters reads", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100_000);
		const h = harness();
		h.live.sync(ctx());
		await flush();
		expect(Object.fromEntries(h.live.values())).toEqual({
			pr_number: "42",
			pr_url: "https://github.com/Owner/Repo/pull/42",
			ci: "CI passing",
		});
		h.live.sync(ctx());
		await flush();
		expect(h.exec.mock.calls.filter(([cmd]) => cmd === "gh")).toHaveLength(1);
		expect(h.exec.mock.calls.find(([cmd]) => cmd === "gh")?.[1]).toEqual([
			"pr",
			"view",
			"feature",
			"--repo",
			"owner/repo",
			"--json",
			"number,url,headRefOid,state,statusCheckRollup",
		]);
		vi.setSystemTime(130_000);
		expect(h.live.values().get("ci")).toBe("CI stale");
		h.live.sync(ctx());
		await flush();
		expect(h.exec.mock.calls.filter(([cmd]) => cmd === "gh")).toHaveLength(2);
		h.demand.clear();
		h.live.sync(ctx());
		expect(h.live.values().size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(["stop", "cwd", "reset", "demand"])(
		"rejects old asynchronous results after %s",
		async (boundary) => {
			const h = harness();
			let finish!: (value: ReturnType<typeof result>) => void;
			h.setQuery(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			h.live.sync(ctx());
			await flush();
			if (boundary === "stop") h.live.stop();
			if (boundary === "reset") h.live.reset();
			if (boundary === "cwd") {
				h.setRemote("origin https://example.org/x/y.git (fetch)");
				h.live.sync(ctx("/different"));
			}
			if (boundary === "demand") {
				h.demand.clear();
				h.live.sync(ctx());
			}
			finish(result(pr()));
			await flush();
			expect(h.live.values().size).toBe(0);
		},
	);

	it("rejects PR head mismatch and revalidates local identity after gh", async () => {
		const h = harness();
		h.setQuery(async () => result(pr(OTHER)));
		h.live.sync(ctx());
		await flush();
		expect(h.live.values().size).toBe(0);
		h.live.reset();
		h.setQuery(async () => {
			h.setHead(OTHER);
			return result(pr());
		});
		h.live.sync(ctx());
		await flush();
		expect(h.live.values().size).toBe(0);
	});

	it("never calls gh for non-GitHub or credential-bearing remotes", async () => {
		for (const remote of [
			"origin https://gitlab.com/x/y.git (fetch)",
			"origin https://user:secret@github.com/x/y.git (fetch)",
		]) {
			const h = harness();
			h.setRemote(remote);
			h.live.sync(ctx());
			await flush();
			expect(h.exec.mock.calls.every(([cmd]) => cmd === "git")).toBe(true);
			expect(h.live.values().size).toBe(0);
		}
	});

	it("negative-caches missing gh/auth/PR, handles no checks and timeout", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100_000);
		const h = harness();
		h.setQuery(async () => {
			throw new Error("unavailable");
		});
		h.live.sync(ctx());
		await flush();
		h.live.sync(ctx());
		await flush();
		expect(h.exec.mock.calls.filter(([cmd]) => cmd === "gh")).toHaveLength(1);
		expect(h.live.values().size).toBe(0);
		h.live.reset();
		h.setQuery(async () => result(pr(HEAD, [])));
		h.live.sync(ctx());
		await flush();
		expect(h.live.values().get("ci")).toBe("CI no checks");
		h.live.reset();
		h.setQuery(() => new Promise(() => {}));
		h.live.sync(ctx());
		await flush();
		await vi.advanceTimersByTimeAsync(10_000);
		await flush();
		expect(h.live.values().size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("completed interaction token rate", () => {
	it("sums completed output/durations, includes first-byte wait, excludes tools/gaps and holds until next interaction", () => {
		let now = 0;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const h = harness(["token_rate"]);
		h.live.sync(ctx());
		const message = (output: number) => ({
			role: "assistant",
			usage: { input: 100, output },
			stopReason: "stop",
		});
		h.emit("agent_start");
		h.emit("turn_start");
		now = 1000;
		h.emit("message_start", message(0));
		now = 1500;
		h.emit("message_update", message(90));
		expect(h.live.values().get("token_rate")).toBe("— tok/s avg");
		now = 2000;
		h.emit("message_end", message(100));
		expect(h.live.values().get("token_rate")).toBe("50 tok/s avg");
		h.emit("message_end", message(100)); // duplicate ignored
		now = 12_000;
		h.emit("message_end", { role: "toolResult" });
		h.emit("turn_start");
		now = 13_000;
		h.emit("message_update", message(20));
		expect(h.live.values().get("token_rate")).toBe("50 tok/s avg");
		now = 14_000;
		h.emit("message_end", message(300));
		h.emit("agent_end");
		expect(h.live.values().get("token_rate")).toBe("100 tok/s avg");
		now = 90_000;
		expect(h.live.values().get("token_rate")).toBe("100 tok/s avg");
		h.emit("agent_start");
		expect(h.live.values().get("token_rate")).toBe("— tok/s avg");
	});

	it("keeps unknown for missing final usage, aborted placeholders, zero duration or unclosed calls", () => {
		let now = 0;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const h = harness(["token_rate"]);
		h.live.sync(ctx());
		for (const message of [
			{ role: "assistant" },
			{ role: "assistant", stopReason: "aborted", usage: { input: 0, output: 0 } },
		]) {
			h.emit("agent_start");
			h.emit("turn_start");
			now += 1000;
			h.emit("message_end", message);
			h.emit("agent_end");
			expect(h.live.values().get("token_rate")).toBe("— tok/s avg");
		}
		h.emit("agent_start");
		h.emit("turn_start");
		h.emit("agent_end");
		expect(h.live.values().get("token_rate")).toBe("— tok/s avg");
		h.emit("agent_start");
		h.emit("turn_start");
		h.emit("message_end", { role: "assistant", usage: { input: 1, output: 50 } });
		expect(h.live.values().get("token_rate")).toBe("— tok/s avg");
		h.live.stop();
		h.emit("agent_start");
		expect(h.live.values().size).toBe(0);
		h.live.sync(ctx());
		expect(h.live.values().get("token_rate")).toBe("— tok/s avg");
	});
});
