import { stripVTControlCharacters } from "node:util";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	compileCompactFormatSplit,
	parseFooterFormat,
	renderFormatTokens,
	type CompactBoundaryKind,
	type CompactFormatChunk,
} from "./format.js";

type Chunk = { text: string; boundary: CompactBoundaryKind };
type Row = { text: string; truncated: boolean };

// Ignore all VT controls (including OSC hyperlinks), not just SGR color codes.
const measure = (text: string): number => visibleWidth(stripVTControlCharacters(text));
const hasContent = (text: string): boolean => Boolean(stripVTControlCharacters(text).trim());

/** Keep truncated OSC hyperlinks from swallowing following separators/padding. */
function truncate(text: string, width: number, ellipsis: string): string {
	if (width <= 0) return "";
	const result = truncateToWidth(text, width, ellipsis);
	let activeLink = false;
	for (const match of result.matchAll(/\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]*)(?:\x07|\x1b\\)/g)) {
		activeLink = Boolean(match[1]);
	}
	return result + (activeLink ? "\x1b]8;;\x07" : "");
}

function fit(text: string, width: number): Row {
	return { text: truncate(text, width, "…"), truncated: measure(text) > width };
}

function omit(row: Row, width: number): Row {
	if (row.truncated) return row;
	return { text: truncate(row.text, width - 1, "") + "…", truncated: true };
}

function connector(chunk: Chunk, separator: string): string {
	return chunk.boundary === "separator" ? separator : " ";
}

/** Greedy block packing; never carry a separator over a line boundary. */
function pack(chunks: readonly Chunk[], width: number, limit: number, separator: string): string[] {
	if (!chunks.length) return [];
	const rows: Row[] = [];
	let current: Row | undefined;
	for (const chunk of chunks) {
		const fitted = fit(chunk.text, width);
		if (!current) {
			current = fitted;
			continue;
		}
		const candidate = current.text + connector(chunk, separator) + fitted.text;
		if (measure(candidate) <= width) {
			current = { text: candidate, truncated: fitted.truncated };
		} else if (rows.length + 1 < limit) {
			rows.push(current);
			current = fitted;
		} else {
			current = omit(current, width);
			break;
		}
	}
	if (current) rows.push(current);
	return rows.map((row) => row.text);
}

/** Reserve right blocks first, in template order, then fill remaining left budgets. */
function packZones(
	left: readonly Chunk[],
	right: readonly Chunk[],
	width: number,
	limit: number,
	separator: string,
): string[] {
	const rightRows = pack(right, width, limit, separator);
	if (!rightRows.length) return pack(left, width, limit, separator);
	const leftRows: Row[] = [];
	const budgets: number[] = [];
	let next = 0;
	for (let index = 0; index < limit && (next < left.length || index < rightRows.length); index++) {
		const rightText = rightRows[index] ?? "";
		const budget = Math.max(0, width - measure(rightText) - (rightText ? 1 : 0));
		budgets.push(budget);
		let current: Row = { text: "", truncated: false };
		while (budget > 0 && next < left.length) {
			const chunk = left[next];
			if (!chunk) break;
			const join = current.text ? connector(chunk, separator) : "";
			if (current.text && measure(current.text + join + chunk.text) > budget) break;
			const fitted = fit(chunk.text, budget);
			current = { text: current.text + join + fitted.text, truncated: fitted.truncated };
			next++;
		}
		leftRows.push(current);
	}
	if (next < left.length) {
		let last = leftRows.length - 1;
		while (last >= 0 && !leftRows[last]?.text) last--;
		const row = leftRows[last];
		if (row) leftRows[last] = omit(row, budgets[last] ?? 0);
		else {
			const index = rightRows.length - 1;
			rightRows[index] = omit(
				{
					text: rightRows[index] ?? "",
					truncated: stripVTControlCharacters(rightRows[index] ?? "").endsWith("…"),
				},
				width,
			).text;
		}
	}
	return leftRows
		.map((row, index) => {
			const rightText = rightRows[index] ?? "";
			return rightText
				? row.text +
						" ".repeat(Math.max(0, width - measure(row.text) - measure(rightText))) +
						rightText
				: row.text;
		})
		.filter(Boolean);
}

/** Render a compact template without retaining caller values in the syntax cache. */
export function renderCompactFooter(
	format: string,
	renderVariable: (name: string) => string,
	extensionStatuses: readonly string[],
	separator: string,
	width: number,
	maxLines: number,
): string[] {
	const innerWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
	if (innerWidth === 0) return [""];
	const limit = Math.max(1, Math.min(8, Math.floor(maxLines) || 1));
	const compact = compileCompactFormatSplit(parseFooterFormat(format));
	const render = (chunks: readonly CompactFormatChunk[]): Chunk[] => {
		const result: Chunk[] = [];
		for (const chunk of chunks) {
			const values =
				chunk.kind === "extensions"
					? extensionStatuses
					: [renderFormatTokens(chunk.tokens, renderVariable)];
			let first = true;
			for (const value of values) {
				if (!hasContent(value)) continue;
				result.push({ text: value.trim(), boundary: first ? chunk.boundary : "space" });
				first = false;
			}
		}
		return result;
	};
	const left = render(compact.left);
	const right = render(compact.right);
	const rows = compact.alignRight
		? packZones(left, right, innerWidth, limit, separator)
		: pack(left, innerWidth, limit, separator);
	return rows.length ? rows : [""];
}
