import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import {
	formatDeepSeekBalance,
	isDeepSeekModel,
	parseDeepSeekBalance,
	queryDeepSeekBalance,
} from "../extensions/hud/telemetry/deepseek-balance.ts";

describe("DeepSeek balance", () => {
	it("recognizes only the deepseek provider", () => {
		assert.equal(isDeepSeekModel({ provider: "deepseek" }), true);
		assert.equal(isDeepSeekModel({ provider: "openai-codex" }), false);
		assert.equal(isDeepSeekModel({ provider: "token-switch" }), false);
		assert.equal(isDeepSeekModel(undefined), false);
	});

	it("prefers the CNY balance when the account reports several currencies", () => {
		const balance = parseDeepSeekBalance({
			is_available: true,
			balance_infos: [
				{ currency: "USD", total_balance: "15.50" },
				{ currency: "CNY", total_balance: "110.00" },
			],
		});

		assert.deepEqual(balance, { amount: 110, currency: "CNY" });
		assert.equal(formatDeepSeekBalance(balance), "deepseek ¥110.00");
	});

	it("falls back to the first reported currency and formats unknown codes verbatim", () => {
		assert.deepEqual(
			parseDeepSeekBalance({ balance_infos: [{ currency: "usd", total_balance: "4.2" }] }),
			{ amount: 4.2, currency: "USD" },
		);
		assert.equal(formatDeepSeekBalance({ amount: 4.2, currency: "HKD" }), "deepseek 4.20 HKD");
	});

	it("rejects malformed balances", () => {
		assert.throws(() => parseDeepSeekBalance(null), /balance_infos/);
		assert.throws(() => parseDeepSeekBalance({}), /balance_infos/);
		assert.throws(() => parseDeepSeekBalance({ balance_infos: [] }), /balance_infos/);
		assert.throws(() => parseDeepSeekBalance({ balance_infos: "CNY" }), /balance_infos/);
		assert.throws(
			() => parseDeepSeekBalance({ balance_infos: [{ total_balance: "1.00" }] }),
			/currency/,
		);
		assert.throws(
			() => parseDeepSeekBalance({ balance_infos: [{ currency: "CNY" }] }),
			/total_balance/,
		);
		assert.throws(
			() => parseDeepSeekBalance({ balance_infos: [{ currency: "CNY", total_balance: "" }] }),
			/total_balance/,
		);
		assert.throws(
			() =>
				parseDeepSeekBalance({ balance_infos: [{ currency: "CNY", total_balance: "12.00 CNY" }] }),
			/total_balance/,
		);
	});

	it("queries the documented endpoint without exposing the key", async () => {
		const requestedUrls: string[] = [];
		let authorization = "";
		const fetchImpl: typeof fetch = async (input, init) => {
			requestedUrls.push(String(input));
			authorization = new Headers(init?.headers).get("Authorization") ?? "";
			return new Response(
				JSON.stringify({
					is_available: true,
					balance_infos: [{ currency: "CNY", total_balance: "110.00" }],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		};

		const balance = await queryDeepSeekBalance({
			apiKey: "test-key",
			fetchImpl,
			timeoutMs: 1000,
		});

		assert.deepEqual(requestedUrls, ["https://api.deepseek.com/user/balance"]);
		assert.equal(authorization, "Bearer test-key");
		assert.deepEqual(balance, { amount: 110, currency: "CNY" });
	});

	it("rejects unsuccessful, oversized, and invalid JSON responses", async () => {
		const responses = [
			new Response("", { status: 401 }),
			new Response("x".repeat(64 * 1024 + 1), { status: 200 }),
			new Response("not json", { status: 200 }),
		];
		for (const response of responses) {
			await assert.rejects(
				queryDeepSeekBalance({
					apiKey: "test-key",
					fetchImpl: async () => response,
					timeoutMs: 1000,
				}),
				/DeepSeek/,
			);
		}
	});

	it("reports external cancellation without leaking credentials", async () => {
		const fetchImpl: typeof fetch = async (_input, init) => {
			assert.equal(init?.signal?.aborted, true);
			throw new Error("aborted");
		};

		await assert.rejects(
			queryDeepSeekBalance({
				apiKey: "test-key",
				fetchImpl,
				timeoutMs: 1000,
				signal: AbortSignal.abort(),
			}),
			/was cancelled/,
		);
	});

	it("requires a DeepSeek API key", async () => {
		await assert.rejects(queryDeepSeekBalance({ apiKey: "", timeoutMs: 1000 }), /API key/);
		await assert.rejects(queryDeepSeekBalance({ timeoutMs: 1000 }), /API key/);
	});
});
