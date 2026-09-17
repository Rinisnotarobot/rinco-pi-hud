/**
 * Build the README visuals from a real footer capture.
 *
 * Input:  footer.json from capture-footer.mts — ANSI rows per terminal width.
 * Output: assets/readme/hero.svg        identity + one real wide footer
 *         assets/readme/responsive.svg  the same footer at two narrower widths
 *
 * Palette comes from the extension's own defaults
 * (extensions/hud/config/schema.ts -> defaultConfig.colors), so the boards look
 * like the thing they document rather than a house style.
 *
 *   npx tsx assets/readme/source/build-assets.mts /tmp/hero-capture/footer.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..");

const P = {
	bg: "#0E0C15",
	panel: "#16131F",
	border: "#2C2640",
	text: "#F5F2F8",
	body: "#B9B2C0",
	muted: "#A99BAE",
	separator: "#716879",
	accent: "#F2A7C6",
	mauve: "#C7B8F5",
	mint: "#AEE5C5",
	peach: "#F6BC9A",
	sky: "#9FD3F2",
	sand: "#F3D98B",
	rose: "#FF8FA3",
};

/** ANSI SGR colors the footer emits, mapped onto the project's own palette. */
const ANSI_16: Record<number, string> = {
	30: P.panel,
	31: P.rose,
	32: P.mint,
	33: P.sand,
	34: P.sky,
	35: P.mauve,
	36: P.sky,
	37: P.text,
	90: P.muted,
	91: P.rose,
	92: P.mint,
	93: P.sand,
	94: P.sky,
	95: P.mauve,
	96: P.sky,
	97: P.text,
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type Span = { text: string; color?: string; bold: boolean };
type Capture = { width: number; rows: string[] };

function parseAnsi(line: string): Span[] {
	const spans: Span[] = [];
	let color: string | undefined;
	let bold = false;
	let rest = line;

	while (rest.length > 0) {
		const match = rest.match(/^\x1b\[([0-9;]*)m/);
		if (match) {
			const codes = (match[1] ?? "").split(";").filter(Boolean).map(Number);
			for (let index = 0; index < codes.length; index++) {
				const code = codes[index]!;
				if (code === 0) {
					color = undefined;
					bold = false;
				} else if (code === 1) bold = true;
				else if (code === 22) bold = false;
				else if (code === 39) color = undefined;
				else if (code === 38 && codes[index + 1] === 2) {
					color = `#${[codes[index + 2], codes[index + 3], codes[index + 4]]
						.map((value) => (value ?? 0).toString(16).padStart(2, "0"))
						.join("")}`;
					index += 4;
				} else if (ANSI_16[code]) color = ANSI_16[code];
			}
			rest = rest.slice(match[0].length);
			continue;
		}

		const next = rest.indexOf("\x1b");
		const chunk = next === -1 ? rest : rest.slice(0, next);
		if (chunk) {
			const last = spans.at(-1);
			if (last && last.color === color && last.bold === bold) last.text += chunk;
			else spans.push({ text: chunk, color, bold });
		}
		rest = next === -1 ? "" : rest.slice(next);
	}

	return spans;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One footer row, `xml:space="preserve"` keeps the real column spacing. */
function rowText(spans: Span[], x: number, y: number, size: number): string {
	const body = spans
		.map((span) => {
			const fill = span.color ? ` fill="${span.color}"` : "";
			const weight = span.bold ? ' font-weight="700"' : "";
			return `<tspan${fill}${weight}>${escape(span.text)}</tspan>`;
		})
		.join("");
	return `    <text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" xml:space="preserve">${body}</text>`;
}

function panel(
	capture: Capture,
	options: { x: number; y: number; width: number; header: string; note: string; guide?: number },
): { svg: string; height: number } {
	const size = 20;
	const lineHeight = 30;
	const headerHeight = 34;
	const rows = capture.rows.map(parseAnsi);
	const textX = options.x + 24;
	const first = options.y + headerHeight + 30;
	const last = first + (rows.length - 1) * lineHeight;
	const height = last + 24 - options.y;
	const mid = options.y + headerHeight / 2 + 6;

	const guide = options.guide
		? `    <line x1="${options.guide}" y1="${options.y + headerHeight}" x2="${options.guide}" y2="${options.y + height}" stroke="${P.separator}" stroke-dasharray="3 5" opacity="0.55"/>`
		: "";

	return {
		height,
		svg: `  <g id="panel-${capture.width}">
    <rect x="${options.x}" y="${options.y}" width="${options.width}" height="${height}" rx="14" fill="${P.panel}" stroke="${P.border}"/>
    <text x="${textX}" y="${mid}" font-family="${MONO}" font-size="18" fill="${P.muted}">${escape(options.header)}</text>
    <text x="${options.x + options.width - 24}" y="${mid}" text-anchor="end" font-family="${MONO}" font-size="18" fill="${P.muted}">${escape(options.note)}</text>
    <line x1="${options.x}" y1="${options.y + headerHeight}" x2="${options.x + options.width}" y2="${options.y + headerHeight}" stroke="${P.border}"/>
${guide}
${rows.map((spans, index) => rowText(spans, textX, first + index * lineHeight, size)).join("\n")}
  </g>`,
	};
}

function svgDocument(options: {
	title: string;
	desc: string;
	height: number;
	body: string;
}): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${options.height}" viewBox="0 0 1200 ${options.height}" role="img" aria-labelledby="t d" font-family="${SANS}">
  <title id="t">${escape(options.title)}</title>
  <desc id="d">${escape(options.desc)}</desc>
  <rect width="1200" height="${options.height}" rx="26" fill="${P.bg}"/>
${options.body}
</svg>
`;
}

export function buildHero(wide: Capture): string {
	const hero = panel(wide, {
		x: 56,
		y: 196,
		width: 1088,
		header: "extensions/hud/footer/index.ts",
		note: `render(${wide.width}) · ASCII icons`,
	});

	return svgDocument({
		title: "Rinco Pi HUD — a live HUD footer for the Pi terminal agent",
		desc: `The footer from a real Pi session, rendered at ${wide.width} columns: a Project row with directory, git branch, commit and Node version; a Session row with provider, model, thinking level and turn count; an Activity row with real tool counts; and a Usage row with context window, tokens, cache hit rate and cost.`,
		height: hero.height + 252,
		body: `  <g id="title-block">
    <text x="56" y="72" font-family="${MONO}" font-size="18" letter-spacing="2.4" fill="${P.accent}">PI · TUI FOOTER EXTENSION</text>
    <text x="56" y="126" font-size="60" font-weight="700" fill="${P.text}">Rinco Pi HUD<tspan fill="${P.accent}">.</tspan></text>
    <text x="56" y="162" font-size="22" fill="${P.body}">Live project, session, tool and cost status in your Pi footer.</text>
  </g>
${hero.svg}`,
	});
}

export function buildResponsive(captures: Capture[]): string {
	const top = 96;
	let y = top + 30;
	const blocks: string[] = [];
	for (const capture of captures) {
		const wraps = capture.rows.some((row) => row.replace(/\x1b\[[0-9;]*m/g, "").startsWith("          "));
		const built = panel(capture, {
			x: 56,
			y,
			width: 1088,
			header: `render(${capture.width})`,
			// The continuation column sits at character 10: one frame space plus
			// the nine-character group-label column.
			note: wraps ? `${capture.rows.length} rows · continuations align` : `${capture.rows.length} rows`,
			guide: wraps ? 56 + 24 + 10 * 12 - 6 : undefined,
		});
		y += built.height + 34;
		blocks.push(built.svg);
	}
	const height = y + 22;

	return svgDocument({
		title: "Rinco Pi HUD width-aware footer layout",
		desc: "The same Pi session footer rendered at 72 and 56 columns. Groups wrap only at complete segment boundaries, so the Activity row keeps its tool counts together; continuation lines realign under the separator column; a segment that no longer fits is truncated with an ellipsis instead of splitting the numbers.",
		height,
		body: `  <g id="board-title">
    <text x="56" y="${top - 40}" font-family="${MONO}" font-size="18" letter-spacing="2.4" fill="${P.accent}">WIDTH-AWARE LAYOUT</text>
    <text x="56" y="${top}" font-size="30" font-weight="700" fill="${P.text}">Wrap between segments, shorten only what cannot fit</text>
  </g>
${blocks.join("\n")}`,
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const input = process.argv[2] ?? "/tmp/hero-capture/footer.json";
	const capture = JSON.parse(readFileSync(input, "utf8")) as { widths: Capture[] };
	const byWidth = new Map(capture.widths.map((entry) => [entry.width, entry]));
	const pick = (width: number, fallbackIndex: number) =>
		byWidth.get(width) ?? capture.widths[fallbackIndex]!;

	writeFileSync(join(OUT_DIR, "hero.svg"), buildHero(pick(118, 0)));
	writeFileSync(
		join(OUT_DIR, "responsive.svg"),
		buildResponsive([pick(72, 1), pick(56, capture.widths.length - 1)]),
	);
	console.log(`wrote hero.svg and responsive.svg from ${input}`);
}
