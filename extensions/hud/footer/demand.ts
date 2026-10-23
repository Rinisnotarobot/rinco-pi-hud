import type { PolishedTuiConfig } from "../config/config.js";
import { FOOTER_FORMAT_ALIASES } from "../config/config.js";
import { parseFooterFormat, type FormatToken } from "./format.js";

/** Compact demand is opt-in, independent of current terminal width. */
export function footerTemplateReferences(config: PolishedTuiConfig): Set<string> {
	const references = new Set<string>();
	const visit = (tokens: readonly FormatToken[]) => {
		for (const token of tokens) {
			if (token.kind === "group") visit(token.tokens);
			if (token.kind === "var") {
				const name = Object.hasOwn(FOOTER_FORMAT_ALIASES, token.name)
					? FOOTER_FORMAT_ALIASES[token.name]!
					: token.name;
				if (!["join_sep", "wrap", "wrap_sep"].includes(name)) references.add(name);
			}
		}
	};
	if (!config.features.statusLine || config.footerStyle === "hidden") return references;
	visit(parseFooterFormat(config.footerFormat));
	if (config.responsiveFooter) visit(parseFooterFormat(config.compactFooterFormat));
	return references;
}

export function demandedPublisherKeys(config: PolishedTuiConfig): Set<string> {
	const references = footerTemplateReferences(config);
	return new Set(
		Object.entries(config.footerVariables)
			.filter(([alias]) => references.has(alias))
			.map(([, key]) => key),
	);
}
