/**
 * THE COURSE-RECORD TOOLS: a course-linked session's reach into the
 * learner's `learning` engine, the same record the tutor in Claude Code and
 * Claude Desktop reads and writes. Every tool is bound to the session's one
 * course, so the model never names a course. Results are the engine's own
 * JSON, verbatim; a refused save comes back as an error result naming the
 * field and the fix, and the model repairs and resends (a save that failed
 * is safe to resend; an answer already saved is refused).
 */

import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { healToolRecord } from "./heal.ts";
import type { CourseLink, CourseResult, CourseVerb } from "../../core/contracts/course.ts";
import type { CourseRecords } from "../../core/ports.ts";
import { shownHelpNote, withShownHelp } from "../../core/shown-help.ts";
import { engineConfidence } from "../../core/engine-confidence.ts";
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

/** An attempt records an answer of his, so it names it: any attempt but a
 *  re-mark, which names what it corrects. An exam result and his own
 *  report answer no question of the session. */
const recordsAnAnswer = (o: Record<string, unknown>) => (o.kind ?? "attempt") === "attempt" && !("corrects" in o);

/** The answers each session's saves named in this turn, after they went
 *  through: the session's record holds them only from the next turn. */
const savedThisTurn = new WeakMap<CourseToolContext, Set<string>>();

/** What a save's observations say, ruled by the answers they name: each
 *  observation as the engine reads it, without `question`, never a
 *  prediction unless he was asked to predict, and its confidence as he
 *  chose it; the question each
 *  names; and the first one refused, which saves nothing. Refused: an
 *  attempt that names no answer, a name that is no answer of this session,
 *  and an answer already saved (round 6: once an unreadable course read
 *  again, a 4 Nov answer was saved a second time, dated today). */
function namedQuestions(listed: readonly unknown[], answers: ReadonlyMap<string, AnsweredQuestion>, saved: ReadonlySet<string>): { observations: unknown[]; questions: (string | null)[]; refused: string | null } {
	const questions: (string | null)[] = [];
	let refused: string | null = null;
	const refuse = (why: string) => {
		refused ??= why;
	};
	const observations = listed.map((o, i) => {
		if (!isObject(o)) {
			questions.push(null);
			return o;
		}
		const { question, ...rest } = o;
		if (!("question" in o)) {
			if (recordsAnAnswer(rest)) {
				refuse(
					`observations[${i}]: name the answer it records with question, the id his answer carried, or "his-message" for an answer he gave in words in his message. ` +
						"A re-mark names none and names the attempt it corrects with corrects. An answer a save or a problem's conclude already recorded is saved: never save it again.",
				);
			}
			questions.push(null);
			return rest;
		}
		const named = typeof question === "string" ? question.trim() : "";
		questions.push(named || null);
		const answer = answers.get(named);
		if (!answer) {
			refuse(
				`observations[${i}].question: ${JSON.stringify(question)} is not an answer of this session. ` +
					'Copy the "question" id his answer carried, or name "his-message" for an answer he gave in words in his message.',
			);
			return rest;
		}
		if ((answer.recorded || saved.has(named)) && !("corrects" in rest)) {
			refuse(`observations[${i}].question: ${JSON.stringify(named)} is already saved, so it is not saved again. Leave it out and send the rest; a re-mark of it names its attempt with corrects.`);
		}
		const ruled: Record<string, unknown> = { ...rest };
		if (answer.predicted === false) delete ruled.predicted;
		if (answer.confidence !== undefined) {
			delete ruled.sure;
			Object.assign(ruled, engineConfidence(answer.confidence ?? undefined));
		}
		return ruled;
	});
	return { observations, questions, refused };
}

/**
 * Save one patch with the record's rules applied. Each attempt names the
 * answer it records (`question`); the field is the app's, so it is checked
 * against the session's answers and taken off before the engine reads the
 * patch. The answer then sets what only he and the question can say: it is
 * never a prediction unless he was asked to predict, and its confidence is
 * the one he chose, none when he chose none (round 6: a check saved as a
 * prediction, "gut feeling" saved as a guess over his Confident). An answer
 * already saved is refused. The shown-solution rule (shown-help.ts) saves
 * an attempt as helped when he saw its question solved before it was
 * asked. A concluded problem's attempts name its conclude (`problem`), the
 * answer they record. Every save of a session's answers comes through here.
 */
export async function saveCourse(ctx: CourseToolContext, changes: unknown, problem?: { id: string; seen: boolean }): Promise<CourseResult> {
	const patch = patchOf(changes);
	const listed = patch && Array.isArray(patch.observations) ? patch.observations : null;
	if (!patch || !listed) return ctx.records.run(ctx.course.workspace, { verb: "save", changes });
	const answers = ctx.answers ?? new Map<string, AnsweredQuestion>();
	const saved = savedThisTurn.get(ctx) ?? new Set<string>();
	savedThisTurn.set(ctx, saved);
	const named = problem ? { observations: listed, questions: listed.map(() => null), refused: null } : namedQuestions(listed, answers, saved);
	if (named.refused) return { ok: false, kind: "validation", message: named.refused };
	const ruled = withShownHelp(named.observations, (_o, i) => {
		const question = named.questions[i];
		return question ? answers.get(question)?.seenBefore === true : problem?.seen === true;
	});
	const result = await ctx.records.run(ctx.course.workspace, { verb: "save", changes: { ...patch, observations: ruled.observations } });
	if (result.ok) for (const key of problem ? [problem.id] : named.questions) if (key) saved.add(key);
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
			"an attempt that records his answer to a question names it with `question`, the id that answer carried, so his answer shows its mark; an answer he gave in words in his message names `\"his-message\"` (a re-mark names none: `corrects` links it); " +
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
				"the error names the field and the fix. Resending a save that failed is safe; an answer already saved is refused.",
			parameters: saveInput,
			execute: serverExecute("course_save", saveInput, (input) => call(ctx, { verb: "save", changes: input.changes })),
		},
	});
}
