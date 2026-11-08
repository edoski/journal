/**
 * THE COURSE-RECORD TOOLS: a course-linked session's reach into the
 * learner's `learning` engine, the same record the tutor in Claude Code and
 * Claude Desktop reads and writes. Every tool is bound to the session's one
 * course, so the model never names a course. Results are the engine's own
 * JSON, verbatim; a refused save comes back as an error result naming the
 * field and the fix, and the model repairs and resends (saves are safe to
 * repeat: the engine skips an identical observation within 30 minutes).
 */

import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { healToolRecord } from "./heal.ts";
import type { CourseLink, CourseResult, CourseVerb } from "../../core/contracts/course.ts";
import type { CourseRecords } from "../../core/ports.ts";

/** What the course tools close over. */
export interface CourseToolContext {
	course: CourseLink;
	records: CourseRecords;
}

/** The registered tool names (the transcript card registry and the prompt
 *  refer to these). */
export const COURSE_TOOL_NAMES = ["course_resume", "course_show", "course_search", "course_save"] as const;

const resumeInput = Type.Object({
	task: Type.Optional(Type.String({ minLength: 1, description: "Another open task's key, to resume that task instead of the focused one." })),
});

const showInput = Type.Object({
	handles: Type.Optional(
		Type.Array(Type.String({ minLength: 1 }), {
			minItems: 1,
			description: "Topic, observation (o12), knowledge, task or source handles to read whole.",
		}),
	),
	all: Type.Optional(Type.Boolean({ description: "true reads the whole record with standings (large; prefer handles)." })),
});

const searchInput = Type.Object({
	query: Type.String({ minLength: 1, description: "Words or a phrase, in any language the record uses." }),
});

const saveInput = Type.Object({
	changes: Type.Record(Type.String(), Type.Unknown(), {
		description:
			"One JSON merge patch for the course record: only what changed. `observations` is a list of new entries; " +
			"`topics`, `tasks`, `knowledge` merge by handle (a null entry removes it); `path`, `exam`, `preferences` merge by field; `focus` names the task to continue.",
	}),
});

async function call(ctx: CourseToolContext, verb: CourseVerb): Promise<string> {
	const result: CourseResult = await ctx.records.run(ctx.course.workspace, verb);
	if (result.ok) return JSON.stringify(result.json);
	if (result.kind === "validation") throw new Error(`Nothing was saved or read. ${result.message}`);
	throw new Error(result.message);
}

export function courseTools(ctx: CourseToolContext): Record<string, AgentTool<any>> {
	const course = `the course "${ctx.course.title}"`;
	return healToolRecord({
		course_resume: {
			name: "course_resume",
			label: "course_resume",
			description:
				`Open ${course}'s shared study record: today, last activity, exam countdown, due reviews (with each topic's level, gap, prompt and points), ` +
				"the path with levels and the current topic, weak topics, the open task with its goal, step and help, active topics with their standing, " +
				"recent evidence, relevant knowledge and preferences. Returns JSON.",
			parameters: resumeInput,
			execute: serverExecute("course_resume", resumeInput, (input) => call(ctx, { verb: "resume", task: input.task })),
		},
		course_show: {
			name: "course_show",
			label: "course_show",
			description: `Read whole items from ${course}'s record by handle: a topic with its standing and history, an observation, a knowledge entry, a task, a source. Returns JSON.`,
			parameters: showInput,
			execute: serverExecute("course_show", showInput, (input) => {
				if (input.all) return call(ctx, { verb: "show", handles: "all" });
				if (!input.handles?.length) throw new Error("Pass handles, or all: true.");
				return call(ctx, { verb: "show", handles: input.handles });
			}),
		},
		course_search: {
			name: "course_search",
			label: "course_search",
			description: `Find topics, observations, knowledge and tasks in ${course}'s record by words (accent-insensitive, light stemming). Returns JSON.`,
			parameters: searchInput,
			execute: serverExecute("course_search", searchInput, (input) => call(ctx, { verb: "search", query: input.query })),
		},
		course_save: {
			name: "course_save",
			label: "course_save",
			description:
				`Record into ${course}'s shared study record. Applies one merge patch and returns a receipt: new observation ids, the reviews it set, ` +
				"level changes, the focus and current path topic, the due count, and notes worth acting on. A refused patch saved nothing; " +
				"the error names the field and the fix. Repeating an identical save is safe.",
			parameters: saveInput,
			execute: serverExecute("course_save", saveInput, (input) => call(ctx, { verb: "save", changes: input.changes })),
		},
	});
}
