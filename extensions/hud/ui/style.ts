import type { ThemeColor, ThemeStyle } from "@earendil-works/pi-coding-agent";
import type { Color } from "@earendil-works/pi-tui";
import type { ColorSource, ColorSpec } from "../config/config.js";

type ThemeLike = {
	fg(color: string, text: string): string;
	style?: (text: string, options: ThemeStyle) => string;
	bold?: (text: string) => string;
	italic?: (text: string) => string;
	underline?: (text: string) => string;
};

export type { ThemeLike };

function isHexColor(value: string): boolean {
	return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function expandHexColor(hex: string): string {
	const body = hex.slice(1);
	if (body.length === 3) {
		return body
			.split("")
			.map((ch) => ch + ch)
			.join("");
	}
	return body;
}

function hexToAnsi(hex: string, isBackground = false): string {
	const normalized = expandHexColor(hex);
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return `\x1b[${isBackground ? 48 : 38};2;${r};${g};${b}m`;
}

const terminalColorCodes = new Map([
	["black", 30],
	["red", 31],
	["green", 32],
	["yellow", 33],
	["blue", 34],
	["purple", 35],
	["cyan", 36],
	["white", 37],
	["bright-black", 90],
	["bright-red", 91],
	["bright-green", 92],
	["bright-yellow", 93],
	["bright-blue", 94],
	["bright-purple", 95],
	["bright-cyan", 96],
	["bright-white", 97],
]);

const terminalStyleModifiers = new Map([
	["bold", 1],
	["dim", 2],
	["dimmed", 2],
	["italic", 3],
	["underline", 4],
]);

const themeColorNameMap = new Map([
	["red", "error"],
	["bright-red", "error"],
	["green", "success"],
	["bright-green", "success"],
	["yellow", "warning"],
	["bright-yellow", "warning"],
	["blue", "syntaxFunction"],
	["bright-blue", "syntaxFunction"],
	["cyan", "syntaxFunction"],
	["bright-cyan", "syntaxFunction"],
	["purple", "syntaxKeyword"],
	["bright-purple", "syntaxKeyword"],
	["black", "muted"],
	["bright-black", "muted"],
	["white", "text"],
	["bright-white", "text"],
]);

const themeStyleModifiers = new Set(["bold", "italic", "underline"]);

const themeColorTokens = new Set<ThemeColor>([
	"accent",
	"border",
	"borderAccent",
	"borderMuted",
	"success",
	"error",
	"warning",
	"muted",
	"dim",
	"text",
	"thinkingText",
	"userMessageText",
	"customMessageText",
	"customMessageLabel",
	"toolTitle",
	"toolOutput",
	"mdHeading",
	"mdLink",
	"mdLinkUrl",
	"mdCode",
	"mdCodeBlock",
	"mdCodeBlockBorder",
	"mdQuote",
	"mdQuoteBorder",
	"mdHr",
	"mdListBullet",
	"toolDiffAdded",
	"toolDiffRemoved",
	"toolDiffContext",
	"syntaxComment",
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxPunctuation",
	"thinkingOff",
	"thinkingMinimal",
	"thinkingLow",
	"thinkingMedium",
	"thinkingHigh",
	"thinkingXhigh",
	"thinkingMax",
	"scrollbarTrack",
	"scrollbarThumb",
	"searchMatchText",
	"bashMode",
]);

function terminalColorToAnsi(color: string, isBackground = false): string | undefined {
	const normalized = color.toLowerCase();
	const colorCode = terminalColorCodes.get(normalized);
	if (colorCode !== undefined) return `${isBackground ? colorCode + 10 : colorCode}`;

	if (/^(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(normalized)) {
		return `${isBackground ? 48 : 38};5;${normalized}`;
	}

	if (isHexColor(normalized)) return hexToAnsi(normalized, isBackground).slice(2, -1);
	return undefined;
}

function isExplicitTerminalColorToken(token: string): boolean {
	const normalized = token.toLowerCase();
	if (normalized.startsWith("fg:") || normalized.startsWith("bg:")) return true;
	if (isHexColor(normalized)) return true;
	return /^(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(normalized);
}

function isSupportedStyleToken(token: string): boolean {
	const normalized = token.toLowerCase();
	if (terminalStyleModifiers.has(normalized)) return true;
	if (terminalColorToAnsi(normalized) !== undefined) return true;

	const isForeground = normalized.startsWith("fg:");
	const isBackground = normalized.startsWith("bg:");
	if (isForeground || isBackground) {
		return terminalColorToAnsi(normalized.slice(3), isBackground) !== undefined;
	}

	return themeColorTokens.has(token as ThemeColor);
}

export function isSupportedColorSpec(style: ColorSpec): boolean {
	return parseStyle(style).supported;
}

function applyThemeModifiers(
	theme: ThemeLike,
	styleTokens: readonly string[],
	text: string,
): string {
	let rendered = text;
	for (const token of styleTokens) {
		const normalized = token.toLowerCase();
		if (normalized === "bold") rendered = theme.bold?.(rendered) ?? rendered;
		if (normalized === "italic") rendered = theme.italic?.(rendered) ?? rendered;
		if (normalized === "underline") rendered = theme.underline?.(rendered) ?? rendered;
	}
	return rendered;
}

export function safeThemeFg(theme: ThemeLike, color: string, text: string): string {
	try {
		return theme.fg(color, text);
	} catch {
		return text;
	}
}

function mapThemeColor(styleTokens: readonly string[]): string | undefined {
	let fallback: string | undefined;
	for (const token of styleTokens) {
		const normalized = token.toLowerCase();
		if (themeStyleModifiers.has(normalized)) continue;
		if (normalized === "dim" || normalized === "dimmed") {
			fallback = "muted";
			continue;
		}

		const mapped = themeColorNameMap.get(normalized);
		if (mapped) return mapped;
		return token;
	}
	return fallback;
}

/**
 * Colorize text using a theme color token or hex color.
 * Non-hex values are passed directly to `theme.fg()`; invalid tokens fall back
 * to unstyled text so a config typo does not break rendering.
 */
export function colorize(theme: ThemeLike, color: ColorSpec, text: string): string {
	if (isHexColor(color)) {
		try {
			if (theme.style) return theme.style(text, { fg: hexColor(color) });
		} catch {
			// Older/mock themes retain the original truecolor fallback.
		}
		return `${hexToAnsi(color)}${text}\x1b[39m`;
	}
	return safeThemeFg(theme, color, text);
}

type ParsedStyle = {
	readonly tokens: readonly string[];
	readonly codes: string;
	readonly options: Readonly<ThemeStyle>;
	readonly hasHex: boolean;
	readonly explicit: boolean;
	readonly supported: boolean;
};

// Cache syntax only: never retain a Theme or themed ANSI across theme changes.
const STYLE_CACHE_LIMIT = 256;
const STYLE_CACHE_MAX_LENGTH = 4096;
const styleCache = new Map<string, ParsedStyle>();

function hexColor(hex: string): Color {
	const normalized = expandHexColor(hex);
	return Object.freeze({
		kind: "rgb",
		r: Number.parseInt(normalized.slice(0, 2), 16),
		g: Number.parseInt(normalized.slice(2, 4), 16),
		b: Number.parseInt(normalized.slice(4, 6), 16),
	});
}

function parseStyle(style: string): ParsedStyle {
	const cached = styleCache.get(style);
	if (cached) return cached;
	const tokens = Object.freeze(style.trim().split(/\s+/).filter(Boolean));
	const codes: string[] = [];
	const options: ThemeStyle = {};
	let hasHex = false;
	for (const token of tokens) {
		const normalized = token.toLowerCase();
		const modifier = terminalStyleModifiers.get(normalized);
		if (modifier !== undefined) {
			codes.push(`${modifier}`);
			const attribute = normalized === "dimmed" ? "dim" : normalized;
			if (
				attribute === "bold" ||
				attribute === "dim" ||
				attribute === "italic" ||
				attribute === "underline"
			)
				options[attribute] = true;
			continue;
		}
		const isForeground = normalized.startsWith("fg:");
		const isBackground = normalized.startsWith("bg:");
		const colorName = isForeground || isBackground ? normalized.slice(3) : normalized;
		const code = terminalColorToAnsi(colorName, isBackground);
		if (!code) continue;
		codes.push(code);
		let color: Color;
		if (isHexColor(colorName)) {
			hasHex = true;
			color = hexColor(colorName);
		} else {
			const named = terminalColorCodes.get(colorName);
			color = Object.freeze({
				kind: "indexed",
				index: named === undefined ? Number(colorName) : named >= 90 ? named - 90 + 8 : named - 30,
			});
		}
		options[isBackground ? "bg" : "fg"] = color;
	}
	const parsed = Object.freeze({
		tokens,
		codes: codes.join(";"),
		options: Object.freeze(options),
		hasHex,
		explicit: tokens.some(isExplicitTerminalColorToken),
		supported: tokens.every(isSupportedStyleToken),
	});
	if (style.length <= STYLE_CACHE_MAX_LENGTH) {
		if (styleCache.size >= STYLE_CACHE_LIMIT) {
			const oldest = styleCache.keys().next().value;
			if (oldest !== undefined) styleCache.delete(oldest);
		}
		styleCache.set(style, parsed);
	}
	return parsed;
}

/**
 * Render Starship terminal styles. With a Theme, explicit RGB uses its color-mode encoder;
 * named/indexed-only styles and simple mocks retain the original terminal ANSI semantics.
 */
export function renderTerminalStyle(style: string, text: string, theme?: ThemeLike): string {
	const parsed = parseStyle(style);
	if (parsed.hasHex && theme?.style) {
		try {
			// Pass a fresh options object so a custom theme cannot mutate cached syntax.
			return theme.style(text, { ...parsed.options });
		} catch {
			// Preserve terminal styling for partial/legacy theme implementations.
		}
	}
	return parsed.codes ? `\x1b[${parsed.codes}m${text}\x1b[0m` : text;
}

/**
 * Apply Starship-style terminal styling first, falling back to Pi theme tokens for
 * legacy config values such as "accent" or "syntaxKeyword".
 */
export function renderStyle(theme: ThemeLike, style: ColorSpec, text: string): string {
	if (parseStyle(style).tokens.length === 0) return text;
	const styled = renderTerminalStyle(style, text, theme);
	return styled === text ? colorize(theme, style, text) : styled;
}

export function renderThemeStyle(theme: ThemeLike, style: ColorSpec, text: string): string {
	const parsed = parseStyle(style);
	const tokens = parsed.tokens;
	if (tokens.length === 0) return text;
	if (parsed.explicit) return renderTerminalStyle(style, text, theme);

	const color = mapThemeColor(tokens) ?? "text";
	return safeThemeFg(theme, color, applyThemeModifiers(theme, tokens, text));
}

export function renderStyleForSource(
	theme: ThemeLike,
	source: ColorSource,
	style: ColorSpec,
	text: string,
): string {
	return source === "terminal"
		? renderStyle(theme, style, text)
		: renderThemeStyle(theme, style, text);
}
