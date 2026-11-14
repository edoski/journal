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
import { shownHelpNote, withShownHelp } from "../../core/shown-help.ts";
import type { AnsweredQuestion } from "../../core/native-messages.ts";
import { studyDay, withDayWords } from "../../core/day-words.ts";

/** What the course tools close over. */
export interface CourseToolContext {
	course: CourseLink;
	records: CourseRecords;
	/** Whether the record groups its topics into arcs, read when the turn
	 *  starts: the agent reads the arcs doctrine only then. */
	arcs: boolean;
	/** The questions he answered in this session and the problems that
	 *  ended, by the id a saved attempt names as its `question`
	 *  (native-messages.ts `answeredQuestionsOf`), read from the session's
	 *  record when the turn starts: an answer always arrives before the turn
	 *  that records it. Absent: none yet. */
	answers?: ReadonlyMap<string, AnsweredQuestion>;
}

/** A patch as the engine reads it: the object, or its JSON text, which the
 *  tutor often sends; null when it is neither. */
function patchOf(changes: unknown): Record<string, unknown> | null {
	let value = changes;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** What a save's `question` fields say: the observations without them, as
 *  the engine reads them, the question each names, and the first one that
 *  names no answer of this session. */
function namedQuestions(listed: readonly unknown[], answers: ReadonlyMap<string, AnsweredQuestion>): { observations: unknown[]; questions: (string | null)[]; refused: string | null } {
	const questions: (string | null)[] = [];
	let refused: string | null = null;
	const observations = listed.map((o, i) => {
		if (!isObject(o) || !("question" in o)) {
			questions.push(null);
			return o;
		}
		const { question, ...rest } = o;
		const named = typeof question === "string" ? question.trim() : "";
		if (!answers.has(named) && refused === null) {
			refused =
				`observations[${i}].question: ${JSON.stringify(question)} is not an answer of this session. ` +
				'Copy the "question" id his answer carried, or leave the field out for an answer he gave in words.';
		}
		questions.push(named || null);
		return rest;
	});
	return { observations, questions, refused };
}

/**
 * Save one patch with the shown-solution rule applied (shown-help.ts): an
 * attempt saved as unaided on a question whose solution he saw before it
 * was asked is saved helped, and the receipt says so. Each observation may
 * name the answer it records (`question`); the field is the app's, so it is
 * checked against the session's answers and taken off before the engine
 * reads the patch. `seen` says the same for attempts that name none, as a
 * concluded problem's. Every save of a session's answers comes through here.
 */
export async function saveCourse(ctx: CourseToolContext, changes: unknown, seen: (o: Record<string, unknown>) => boolean = () => false): Promise<CourseResult> {
	const patch = patchOf(changes);
	const listed = patch && Array.isArray(patch.observations) ? patch.observations : null;
	if (!patch || !listed) return ctx.records.run(ctx.course.workspace, { verb: "save", changes });
	const answers = ctx.answers ?? new Map<string, AnsweredQuestion>();
	const named = namedQuestions(listed, answers);
	if (named.refused) return { ok: false, kind: "validation", message: named.refused };
	const ruled = withShownHelp(named.observations, (o, i) => {
		const question = named.questions[i];
		return question ? answers.get(question)?.seenBefore === true : seen(o);
	});
	const result = await ctx.records.run(ctx.course.workspace, { verb: "save", changes: { ...patch, observations: ruled.observations } });
	const note = shownHelpNote(ruled.helped);
	if (!result.ok || !note || typeof result.json !== "object" || result.json === null) return result;
	const receipt = result.json as Record<string, unknown>;
	const notes = Array.isArray(receipt.notes) ? receipt.notes : [];
	return { ...result, json: { ...receipt, notes: [...notes, note] } };
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
			"an attempt that records his answer to a question names it with `question`, the id that answer carried, so his answer shows its mark (a re-mark names none: `corrects` links it); " +
			"`topics`, `tasks`, `knowledge` merge by handle (a null entry removes it); `path`, `exam`, `preferences` merge by field; `focus` names the task to continue. " +
			"Texts the learner reads later (topic titles, gaps and notes, task titles, goals and steps, observation texts) put every piece of math in `$…$` LaTeX, never bare (`$\\sin(x^2)$`, not sin(x^2)).",
	}),
});

/** What the tutor reads when the lesson's course was deleted: a save there
 *  would write a fresh, untitled record and bring the course back as a
 *  ghost beside its successor (round 3, 14 Nov 2026). */
export const COURSE_DELETED_FOR_TUTOR =
	"This lesson's course was deleted, so nothing was saved. Tell the learner in one plain sentence that the course is gone and its lessons stay as history.";

async function call(ctx: CourseToolContext, verb: CourseVerb): Promise<string> {
	if ((verb.verb === "save" || (verb.verb === "sources" && "add" in verb)) && ctx.records.forgotten?.(ctx.course.workspace)) {
		throw new Error(COURSE_DELETED_FOR_TUTOR);
	}
	const result: CourseResult = verb.verb === "save" ? await saveCourse(ctx, verb.changes) : await ctx.records.run(ctx.course.workspace, verb);
	if (result.ok) return JSON.stringify(withDayWords(result.json, studyDay()));
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
