export const DEEPSEEK_PROVIDER_ID = "deepseek";
const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const MAX_RESPONSE_BODY_BYTES = 64 * 1024;

// DeepSeek reports one entry per currency; CNY is the default top-up currency,
// so an account holding both reads out its CNY balance.
const PREFERRED_CURRENCY = "CNY";
const CURRENCY_SYMBOLS: Record<string, string> = { CNY: "¥", USD: "$" };

export type DeepSeekModel = { provider: string };

export type DeepSeekBalance = { amount: number; currency: string };

type QueryDeepSeekBalanceOptions = {
	apiKey?: string;
	fetchImpl?: typeof fetch;
	timeoutMs: number;
	signal?: AbortSignal;
};

export function isDeepSeekModel(model: Pick<DeepSeekModel, "provider"> | undefined): boolean {
	return model?.provider === DEEPSEEK_PROVIDER_ID;
}

export function parseDeepSeekBalance(payload: unknown): DeepSeekBalance {
	const infos = readBalanceInfos(payload);
	return infos.find((info) => info.currency === PREFERRED_CURRENCY) ?? infos[0]!;
}

export function formatDeepSeekBalance(balance: DeepSeekBalance): string {
	const symbol = CURRENCY_SYMBOLS[balance.currency];
	return symbol
		? `deepseek ${symbol}${balance.amount.toFixed(2)}`
		: `deepseek ${balance.amount.toFixed(2)} ${balance.currency}`;
}

export async function queryDeepSeekBalance({
	apiKey,
	fetchImpl = fetch,
	timeoutMs,
	signal,
}: QueryDeepSeekBalanceOptions): Promise<DeepSeekBalance> {
	if (!apiKey?.trim()) {
		throw new Error(
			"No DeepSeek API key is available. Use a DeepSeek model or run /login for DeepSeek.",
		);
	}

	const controller = new AbortController();
	const abortFromExternal = () => controller.abort();
	if (signal?.aborted) controller.abort();
	else signal?.addEventListener("abort", abortFromExternal, { once: true });
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetchImpl(DEEPSEEK_BALANCE_URL, {
			method: "GET",
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			redirect: "error",
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`DeepSeek balance endpoint returned HTTP ${response.status}.`);
		}

		const text = await response.text();
		if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BODY_BYTES) {
			throw new Error("DeepSeek balance response exceeded the size limit.");
		}
		let payload: unknown;
		try {
			payload = JSON.parse(text) as unknown;
		} catch {
			throw new Error("DeepSeek balance response was not valid JSON.");
		}
		return parseDeepSeekBalance(payload);
	} catch (error) {
		if (controller.signal.aborted) {
			throw new Error(
				signal?.aborted
					? "DeepSeek balance query was cancelled."
					: `Timed out after ${Math.round(timeoutMs / 1000)}s while fetching the DeepSeek balance.`,
			);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", abortFromExternal);
	}
}

function readBalanceInfos(payload: unknown): DeepSeekBalance[] {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new Error("DeepSeek balance response did not contain balance_infos.");
	}
	const infos = (payload as Record<string, unknown>).balance_infos;
	if (!Array.isArray(infos) || infos.length === 0) {
		throw new Error("DeepSeek balance response did not contain balance_infos.");
	}
	return infos.map(parseBalanceInfo);
}

function parseBalanceInfo(entry: unknown, index: number): DeepSeekBalance {
	const label = `balance_infos[${index}]`;
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
		throw new Error(`DeepSeek ${label} was not an object.`);
	}

	const record = entry as Record<string, unknown>;
	const currency = record.currency;
	if (typeof currency !== "string" || !currency.trim()) {
		throw new Error(`DeepSeek ${label}.currency was not a currency code.`);
	}

	const total = record.total_balance;
	if (typeof total !== "string" || !total.trim()) {
		throw new Error(`DeepSeek ${label}.total_balance was not a decimal string.`);
	}
	const amount = Number(total);
	if (!Number.isFinite(amount)) {
		throw new Error(`DeepSeek ${label}.total_balance was not a finite number.`);
	}

	return { amount, currency: currency.trim().toUpperCase() };
}
