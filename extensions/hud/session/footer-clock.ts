import type { PolishedTuiConfig } from "../config/config.js";
import { parseFooterFormat, type FormatToken } from "../footer/format.js";

export interface FooterClockNeeds {
	wallClock: boolean;
	duration: boolean;
	activity: boolean;
}

/** Only clocks actually referenced by the visible layout need periodic work. */
export function footerClockNeeds(
	config: PolishedTuiConfig,
	hasRunningTools: boolean,
): FooterClockNeeds {
	if (!config.features.statusLine) return { wallClock: false, duration: false, activity: false };
	if (config.footerFormat) {
		const names = new Set<string>();
		const visit = (tokens: readonly FormatToken[]) => {
			for (const token of tokens) {
				if (token.kind === "var") names.add(token.name);
				if (token.kind === "group") visit(token.tokens);
			}
		};
		visit(parseFooterFormat(config.footerFormat));
		return {
			wallClock: names.has("time"),
			duration: names.has("session_duration") || names.has("duration"),
			activity: hasRunningTools && names.has("running_tools"),
		};
	}
	return {
		wallClock: config.footerRows.usage && config.footerSegments.time,
		duration: config.footerRows.session && config.footerSegments.sessionDuration,
		activity: hasRunningTools && config.footerRows.activity && config.footerSegments.runningTools,
	};
}
