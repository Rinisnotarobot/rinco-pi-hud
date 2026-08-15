import type { CategorizedFooterRows } from "./layout.js";

export interface ProjectFooterSegments {
	category: string;
	cwd: string;
	git: string;
	commit: string;
	metrics: string;
	runtime: string;
	packageVersion: string;
	configCounts: string;
	os: string;
	username: string;
}

export interface SessionFooterSegments {
	category: string;
	name: string;
	model: string;
	thinking: string;
	turn: string;
	duration: string;
}

export interface ActivityFooterSegments {
	category: string;
	tool: string;
	agent: string;
	skills: string;
	mcp: string;
	extensions: readonly string[];
}

export interface UsageFooterSegments {
	category: string;
	context: string;
	tokens: string;
	cache: string;
	cost: string;
	quota: string;
	time: string;
}

export interface CategorizedFooterGroupInput {
	project: ProjectFooterSegments;
	session: SessionFooterSegments;
	activity: ActivityFooterSegments;
	usage: UsageFooterSegments;
}

function compact(segments: readonly string[]): string[] {
	return segments.filter(Boolean);
}

/** Preserve the semantic order of the default footer independently from rendering. */
export function buildCategorizedFooterGroups(
	input: CategorizedFooterGroupInput,
): CategorizedFooterRows {
	return {
		project: compact([
			input.project.category,
			input.project.cwd,
			input.project.git,
			input.project.commit,
			input.project.metrics,
			input.project.runtime,
			input.project.packageVersion,
			input.project.configCounts,
			input.project.os,
			input.project.username,
		]),
		session: compact([
			input.session.category,
			input.session.name,
			input.session.model,
			input.session.thinking,
			input.session.turn,
			input.session.duration,
		]),
		activity: compact([
			input.activity.category,
			input.activity.tool,
			input.activity.agent,
			input.activity.skills,
			input.activity.mcp,
			...input.activity.extensions,
		]),
		usage: compact([
			input.usage.category,
			input.usage.context,
			input.usage.tokens,
			input.usage.cache,
			input.usage.cost,
			input.usage.quota,
			input.usage.time,
		]),
	};
}
