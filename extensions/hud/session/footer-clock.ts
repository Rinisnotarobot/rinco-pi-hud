import type { PolishedTuiConfig } from "../config/config.js";
import { footerTemplateReferences } from "../footer/demand.js";

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
	if (!config.features.statusLine || config.footerStyle === "hidden")
		return { wallClock: false, duration: false, activity: false };
	const names = footerTemplateReferences(config);
	const defaultLayout = !config.footerFormat;
	return {
		wallClock:
			names.has("time") || (defaultLayout && config.footerRows.usage && config.footerSegments.time),
		duration:
			names.has("session_duration") ||
			(defaultLayout && config.footerRows.session && config.footerSegments.sessionDuration),
		activity:
			hasRunningTools &&
			(names.has("running_tools") ||
				(defaultLayout && config.footerRows.activity && config.footerSegments.runningTools)),
	};
}
