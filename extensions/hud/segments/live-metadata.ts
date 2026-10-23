import { isAbsolute } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const TTL = 30_000;
const GITHUB_KEYS = ["pr_number", "pr_url", "ci"];
const UNKNOWN_RATE = "— tok/s avg";
type Options = {
	getDemand: () => ReadonlySet<string>;
	isActive: () => boolean;
	onChange: () => void;
};
type Identity = { key: string; repo: string; branch: string; head: string };
type Cache = { key: string; at: number; values: Map<string, string> };
type Message = {
	role?: string;
	responseId?: unknown;
	usage?: { input?: number; output?: number };
	stopReason?: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

// Deliberately support github.com only. Never forward remote credentials to gh or the UI.
function githubRepo(remotes: string): string | undefined {
	const repos = new Set<string>();
	for (const line of remotes.trim().split("\n")) {
		const remote = /^\S+\s+(\S+)\s+\(fetch\)$/.exec(line)?.[1];
		const path =
			remote &&
			/^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(
				remote,
			)?.[1];
		if (path && path.split("/").every((part) => part !== "." && part !== ".."))
			repos.add(path.toLowerCase());
	}
	// Multiple distinct GitHub remotes are ambiguous (e.g. fork/upstream); fail closed.
	return repos.size === 1 ? [...repos][0] : undefined;
}

function ciLabel(value: unknown): string {
	if (!Array.isArray(value) || value.length > 1024) return "";
	let passing = false;
	let running = false;
	let unknown = false;
	for (const item of value) {
		const check = record(item);
		if (!check) {
			unknown = true;
			continue;
		}
		const state = String(check.conclusion || check.state || "").toUpperCase();
		if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(state))
			return "CI failed";
		if (
			["QUEUED", "IN_PROGRESS", "PENDING", "REQUESTED", "WAITING", "EXPECTED"].includes(
				String(check.status || check.state).toUpperCase(),
			)
		)
			running = true;
		else if (state === "SUCCESS") passing = true;
		else if (!["NEUTRAL", "SKIPPED"].includes(state)) unknown = true;
	}
	return running ? "CI running" : unknown ? "" : passing ? "CI passing" : "CI no checks";
}

/** Passive reads; sync is the only GitHub refresh trigger. stop is reversible by sync.
 * Public Pi 1.3 events: agent_start/end, turn_start, message_start/update/end.
 * turn_start is required: message_start may arrive only after the provider's first byte.
 * One agent_start..agent_end is an interaction; tools and inter-turn gaps are excluded.
 */
export function createLiveMetadata(pi: ExtensionAPI, options: Options) {
	let stopped = true;
	let cwd: string | undefined;
	let job: AbortController | undefined;
	let cache: Cache | undefined;
	let github = new Map<string, string>();
	let expiresAt = 0;
	let rate = UNKNOWN_RATE;
	let running = false;
	let startedAt: number | undefined;
	let authorized = false;
	let responseId: string | undefined;
	let output = 0;
	let elapsed = 0;
	let incomplete = false;

	const demanded = (key: string) => !stopped && options.isActive() && options.getDemand().has(key);
	const wantsGithub = () => GITHUB_KEYS.some(demanded);
	const notify = () => {
		try {
			options.onChange();
		} catch {
			/* A detached UI cannot break collection. */
		}
	};
	const clearRate = () => {
		rate = UNKNOWN_RATE;
		running = false;
		startedAt = undefined;
		authorized = false;
		responseId = undefined;
		output = elapsed = 0;
		incomplete = false;
	};
	const cancel = () => {
		job?.abort();
		job = undefined;
	};
	const clearGithub = () => {
		cancel();
		cache = undefined;
		github = new Map();
		expiresAt = 0;
	};

	async function collect(controller: AbortController, directory: string) {
		const active = () =>
			job === controller && !controller.signal.aborted && cwd === directory && wantsGithub();
		async function command(name: string, args: string[]): Promise<string> {
			if (!active()) throw new Error("Cancelled");
			const timeout = name === "git" ? 2000 : 10_000;
			const local = new AbortController();
			let timer: ReturnType<typeof setTimeout> | undefined;
			let abort: () => void = () => {};
			try {
				const result = await Promise.race([
					Promise.resolve().then(() =>
						pi.exec(name, args, { cwd: directory, timeout, signal: local.signal }),
					),
					new Promise<never>((_resolve, reject) => {
						abort = () => {
							local.abort();
							reject(new Error("Cancelled or timed out"));
						};
						controller.signal.addEventListener("abort", abort, { once: true });
						timer = setTimeout(abort, timeout);
					}),
				]);
				if (
					!active() ||
					result.code !== 0 ||
					result.killed ||
					Buffer.byteLength(result.stdout) > 1024 * 1024
				)
					throw new Error("Unavailable");
				return result.stdout.trim();
			} finally {
				clearTimeout(timer);
				controller.signal.removeEventListener("abort", abort);
			}
		}
		async function identity(): Promise<Identity> {
			const paths = await command("git", ["rev-parse", "--show-toplevel", "--absolute-git-dir"]);
			const branch = await command("git", ["symbolic-ref", "--quiet", "--short", "HEAD"]);
			const remotes = await command("git", ["remote", "-v"]);
			const head = (await command("git", ["rev-parse", "--verify", "HEAD"])).toLowerCase();
			const roots = paths.split("\n");
			const repo = githubRepo(remotes);
			if (
				roots.length !== 2 ||
				!roots.every(isAbsolute) ||
				/[\x00-\x1f\x7f]/.test(paths.replace("\n", "")) ||
				!repo ||
				!branch ||
				/^[\s-]|\s/.test(branch) ||
				!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)
			)
				throw new Error("No supported repository");
			return { key: JSON.stringify([paths, branch, remotes, head]), repo, branch, head };
		}
		let before: Identity | undefined;
		try {
			before = await identity();
			if (!active()) return;
			const now = Date.now();
			let next = cache;
			if (!next || next.key !== before.key || now < next.at || now >= next.at + TTL) {
				github = new Map();
				notify();
				const values = new Map<string, string>();
				try {
					const pr = record(
						JSON.parse(
							await command("gh", [
								"pr",
								"view",
								before.branch,
								"--repo",
								before.repo,
								"--json",
								"number,url,headRefOid,state,statusCheckRollup",
							]),
						),
					);
					const number = pr?.number;
					if (
						pr?.state === "OPEN" &&
						typeof number === "number" &&
						Number.isSafeInteger(number) &&
						number > 0 &&
						pr.headRefOid === before.head &&
						typeof pr.url === "string" &&
						pr.url.toLowerCase() === `https://github.com/${before.repo}/pull/${number}`
					) {
						values.set("pr_number", String(number));
						values.set("pr_url", pr.url);
						values.set("ci", ciLabel(pr.statusCheckRollup));
					}
				} catch {
					/* Missing gh/auth/PR and malformed responses are negative cached results. */
				}
				next = { key: before.key, at: Date.now(), values };
			}
			const after = await identity();
			if (!active()) return;
			if (after.key !== before.key) {
				cache = undefined;
				github = new Map();
				expiresAt = 0;
			} else {
				cache = next;
				github = next.values;
				expiresAt = next.at + TTL;
			}
		} catch {
			if (active()) {
				cache = undefined;
				github = new Map();
				expiresAt = 0;
			}
		} finally {
			if (job === controller) {
				job = undefined;
				notify();
			}
		}
	}

	pi.on("agent_start", () => {
		clearRate();
		if (demanded("token_rate")) running = true;
		notify();
	});
	pi.on("turn_start", () => {
		if (!running || !demanded("token_rate")) return;
		if (startedAt !== undefined) incomplete = true;
		startedAt = performance.now();
		authorized = true;
		responseId = undefined;
	});
	const observe = (message: Message) => {
		if (!running || !demanded("token_rate") || !authorized || message.role !== "assistant")
			return false;
		const id = typeof message.responseId === "string" ? message.responseId : undefined;
		if (id && responseId && id !== responseId) return false;
		if (id) responseId = id;
		return true;
	};
	pi.on("message_start", (event) => {
		observe(event.message);
	});
	pi.on("message_update", (event) => {
		observe(event.message);
	});
	pi.on("message_end", (event) => {
		if (!observe(event.message)) return;
		const message = event.message as Message;
		const duration = startedAt === undefined ? NaN : performance.now() - startedAt;
		authorized = false;
		startedAt = undefined;
		const tokens = message.usage?.output;
		const input = message.usage?.input;
		if (
			typeof tokens !== "number" ||
			!Number.isSafeInteger(tokens) ||
			tokens < 0 ||
			typeof input !== "number" ||
			!Number.isSafeInteger(input) ||
			input < 0 ||
			((message.stopReason === "error" || message.stopReason === "aborted") &&
				tokens === 0 &&
				input === 0) ||
			!Number.isFinite(duration) ||
			duration <= 0 ||
			!Number.isSafeInteger(output + tokens) ||
			elapsed + duration > Number.MAX_SAFE_INTEGER
		)
			incomplete = true;
		else {
			output += tokens;
			elapsed += duration;
		}
		rate =
			incomplete || elapsed <= 0
				? UNKNOWN_RATE
				: `${Math.round((output * 1000) / elapsed)} tok/s avg`;
		notify();
	});
	pi.on("agent_end", () => {
		if (running && startedAt !== undefined) {
			incomplete = true;
			rate = UNKNOWN_RATE;
		}
		running = false;
		authorized = false;
		startedAt = undefined;
		notify();
	});

	return {
		sync(ctx: ExtensionContext): void {
			if (!options.isActive()) {
				this.stop();
				return;
			}
			stopped = false;
			if (cwd !== ctx.cwd) {
				clearGithub();
				cwd = ctx.cwd;
			}
			if (!demanded("token_rate")) clearRate();
			if (!wantsGithub()) {
				clearGithub();
				return;
			}
			if (job) return;
			job = new AbortController();
			void collect(job, ctx.cwd);
		},
		reset(): void {
			clearGithub();
			clearRate();
			cwd = undefined;
			notify();
		},
		stop(): void {
			stopped = true;
			clearGithub();
			clearRate();
			cwd = undefined;
			notify();
		},
		values(): ReadonlyMap<string, string> {
			const values = new Map<string, string>();
			if (demanded("token_rate")) values.set("token_rate", rate);
			for (const [key, value] of github) {
				if (demanded(key) && value)
					values.set(key, key === "ci" && Date.now() >= expiresAt ? "CI stale" : value);
			}
			return values;
		},
	};
}
