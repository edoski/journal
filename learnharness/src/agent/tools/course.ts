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
import { sameQuestionKey, shownHelpNote, withShownHelp } from "../../core/shown-help.ts";
import { engineConfidence } from "../../core/engine-confidence.ts";
import { RUNG_HELP } from "../../core/practice-attempts.ts";
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
	/** What a re-mark may correct (answer-marks.ts `remarkableOf`), read
	 *  with `answers`. Absent: the rule is not applied. */
	remarkable?: { saved: ReadonlySet<string>; disputed: ReadonlySet<string> };
	/** Keeps a save's links with the lesson the moment the engine took it:
	 *  each answer it named and the observation that records it (round 8:
	 *  a restart between the engine's write and the transcript's lost the
	 *  answer's mark). */
	onSaved?: (links: { question: string; observation: string }[]) => void;
	/** The session is a review (session-opening.ts `openedAsReview`): what
	 *  it leaves stays with the topic, whose review carries it, so a save
	 *  here keeps no task (round 9, 2 m4: a review turned into teaching saved
	 *  "Re-learn checking independence"). */
	review?: boolean;
	/** The steps of this session's lesson plan as they stand when a save
	 *  runs (the plan may be written in the same turn). Absent: none. */
	planSteps?: () => readonly { id: string; title: string }[];
}

/** A save that creates a course topic out of a step of the session's own
 *  plan, by its id or its title (round 10, 3 m8: the Poisson lesson's
 *  steps "The limit $(1+\frac{x}{n})^n \to e^x$" and "The exponential
 *  series" became course topics with their own reviews on Home's map). A
 *  topic named with no title updates one the course has, so it passes. */
function planStepAsTopic(ctx: CourseToolContext, patch: Record<string, unknown> | null): string | null {
	const steps = ctx.planSteps?.() ?? [];
	const topics = patch?.topics;
	if (steps.length === 0 || typeof topics !== "object" || topics === null || Array.isArray(topics)) return null;
	const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
	const made = Object.entries(topics as Record<string, unknown>).filter(([handle, t]) => {
		const title = typeof t === "object" && t !== null ? (t as { title?: unknown }).title : undefined;
		return typeof title === "string" && steps.some((s) => s.id === handle || norm(s.title) === norm(title));
	});
	if (made.length === 0) return null;
	return `topics: ${made.map(([h]) => h).join(", ")} ${made.length > 1 ? "are steps" : "is a step"} of this lesson's plan, not ${made.length > 1 ? "course topics" : "a course topic"}. A step lives on the lesson's map; what he did on it is saved to the lesson's own topic. Leave ${made.length > 1 ? "them" : "it"} out of topics and send the rest.`;
}

/** Why a review's save is refused: it keeps a task. A task removed (null)
 *  is allowed. */
export const REVIEW_TASK_REFUSED =
	"tasks: this session is his review, and a review saves no task: what is left of it stays with the topic, whose review carries it. Leave tasks and focus out and send the rest.";

function reviewTaskRefused(ctx: CourseToolContext, patch: Record<string, unknown> | null): string | null {
	if (!ctx.review || !patch) return null;
	const tasks = patch.tasks;
	const kept = tasks !== null && typeof tasks === "object" && Object.values(tasks).some((t) => t !== null);
	return kept || (typeof patch.focus === "string" && patch.focus !== "") ? REVIEW_TASK_REFUSED : null;
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

/** A counted answer that was not right, saved with a question as its
 *  text: the one he answered, or any question. His Mistakes list shows an
 *  open mistake's text, and round 9 (2 m1) read "Find the eigenspace $E_2$
 *  of…" there, never the slip. A prediction and a Show me keep theirs. */
function questionAsText(o: Record<string, unknown>, answer: AnsweredQuestion): boolean {
	if (answer.predicted || answer.showMe || !recordsAnAnswer(o) || (o.result !== "partial" && o.result !== "incorrect") || o.gave_up) return false;
	const text = typeof o.text === "string" ? sameQuestionKey(o.text) : "";
	return text.endsWith("?") || (answer.asked !== undefined && text.toLowerCase() === answer.asked.toLowerCase());
}

/** The answers each session's saves named in this turn, after they went
 *  through: the session's record holds them only from the next turn. */
const savedThisTurn = new WeakMap<CourseToolContext, Set<string>>();

/** The attempts each session's saves recorded in this turn, from their
 *  receipts: this session saved them, so it may set them right in the same
 *  turn, though `remarkable` was read before they existed. */
const recordedThisTurn = new WeakMap<CourseToolContext, Set<string>>();

/** The help a Show me gave, in the words practice's Show me saves (its
 *  R5 rung): one rule for a shown answer, in a lesson as in practice
 *  (round 8, 2 M3: a lesson's Show me was saved as no help). */
export const SHOW_ME_HELP = RUNG_HELP.R5;

/** Why a re-mark is refused: it corrects an attempt this session did not
 *  save and he did not dispute (round 8, 2 m1: the tutor silently re-marked
 *  an older answer to a different question). A dispute's ruling corrects
 *  only an attempt he disputed; his own statement (a self_report) may
 *  correct any. Null when it may stand. */
function remarkRefused(o: Record<string, unknown>, i: number, remarkable: CourseToolContext["remarkable"]): string | null {
	if (!remarkable || (o.kind ?? "attempt") === "self_report" || !Array.isArray(o.corrects)) return null;
	const disputed = "disputed" in o;
	const allowed = disputed ? remarkable.disputed : remarkable.saved;
	const outside = o.corrects.filter((id): id is string => typeof id === "string" && !allowed.has(id));
	if (outside.length === 0) return null;
	return disputed
		? `observations[${i}].corrects: he disputed no mark of ${outside.join(", ")}. A ruling re-marks only the attempts his dispute named.`
		: `observations[${i}].corrects: ${outside.join(", ")} ${outside.length > 1 ? "were" : "was"} not saved in this session, and he did not dispute ${outside.length > 1 ? "them" : "it"}, so ${outside.length > 1 ? "they stand" : "it stands"} as recorded: never re-mark an answer on your own. Leave the re-mark out; a new answer is simply a new attempt.`;
}

/** What a save's observations say, ruled by the answers they name: each
 *  observation as the engine reads it, without `question`, never a
 *  prediction unless he was asked to predict, and its confidence as he
 *  chose it; the question each
 *  names; and the first one refused, which saves nothing. Refused: an
 *  attempt that names no answer, a name that is no answer of this session,
 *  and an answer already saved (round 6: once an unreadable course read
 *  again, a 4 Nov answer was saved a second time, dated today). */
function namedQuestions(
	listed: readonly unknown[],
	answers: ReadonlyMap<string, AnsweredQuestion>,
	saved: ReadonlySet<string>,
	remarkable?: CourseToolContext["remarkable"],
): { observations: unknown[]; questions: (string | null)[]; refused: string | null } {
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
		const remark = remarkRefused(rest, i, remarkable);
		if (remark) refuse(remark);
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
		if (questions.slice(0, -1).includes(named) && !("corrects" in rest)) {
			refuse(`observations[${i}].question: ${JSON.stringify(named)} is named by an earlier observation of this save, and one answer is one observation with one result: list every topic it was asked on in that observation's topics, and send it once.`);
		}
		if ((answer.recorded || saved.has(named)) && !("corrects" in rest)) {
			refuse(`observations[${i}].question: ${JSON.stringify(named)} is already saved, so it is not saved again. Leave it out and send the rest; a re-mark of it names its attempt with corrects.`);
		}
		const ruled: Record<string, unknown> = { ...rest };
		if (questionAsText(rest, answer)) {
			refuse(
				`observations[${i}].text: a not-right answer's text says what went wrong, in a line he reads in his Mistakes list days later ("Took $(1,2)$ as a vector of $E_2$; it gives $2x+y=4$, not $0$"), never the question. Send it again with that text.`,
			);
		}
		if (answer.predicted === true) ruled.predicted = true;
		else if (answer.predicted === false) delete ruled.predicted;
		if (answer.showMe && !("corrects" in rest)) {
			Object.assign(ruled, { result: "incorrect", gave_up: true, shown: true });
			if (typeof ruled.help !== "string" || ruled.help.trim().toLowerCase() === "none") ruled.help = SHOW_ME_HELP;
		}
		if (answer.confidence !== undefined) {
			delete ruled.sure;
			Object.assign(ruled, engineConfidence(answer.confidence ?? undefined));
		}
		return ruled;
	});
	return { observations, questions, refused };
}

/** Why a re-mark the tutor makes unasked is refused: it brings another
 *  response than the attempt it corrects, so it is a new answer saved over
 *  an old mark (round 11, 2 n4: his new answer on the eigen-equation raised
 *  the seeded o34 from partly right, prompted, to right on his own, with no
 *  word to him and no card of its own). A ruling on his dispute and his own
 *  report are his to word. Null when every such re-mark keeps its answer;
 *  the record is read only for a save that holds one. */
async function remarkWithNewAnswer(ctx: CourseToolContext, observations: readonly unknown[]): Promise<string | null> {
	const remarks = observations.flatMap((o, i) =>
		isObject(o) && (o.kind ?? "attempt") === "attempt" && !("disputed" in o) && Array.isArray(o.corrects) && typeof o.response === "string" && o.response.trim()
			? [{ i, response: o.response, targets: o.corrects.filter((t): t is string => typeof t === "string") }]
			: [],
	);
	if (remarks.length === 0) return null;
	const shown = await ctx.records.run(ctx.course.workspace, { verb: "show", handles: [...new Set(remarks.flatMap((r) => r.targets))] });
	if (!shown.ok) return null;
	const items = ((shown.json as { items?: Record<string, { response?: unknown }> } | null)?.items ?? {}) as Record<string, { response?: unknown }>;
	const squash = (text: unknown) => (typeof text === "string" ? text.replace(/[\s$]+/g, "").toLowerCase() : "");
	for (const { i, response, targets } of remarks) {
		const changed = targets.find((t) => t in items && squash(items[t]!.response) !== squash(response));
		if (!changed) continue;
		const was = typeof items[changed]!.response === "string" ? `its response was ${JSON.stringify(items[changed]!.response)}` : "it holds no response";
		return `observations[${i}].corrects: ${changed} is another answer (${was}), so this is not a re-mark of it. A re-mark keeps the answer it corrects and sets only its mark, and you tell him in one line what changed. His new answer is a new attempt: name its question (or "his-message"), leave corrects out, and send it again.`;
	}
	return null;
}

/** The observation ids a save's receipt gives (`saved`). */
function receiptIds(json: unknown): string[] {
	const saved = (json as { saved?: unknown } | null)?.saved;
	return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
}

/** Hands the lesson each named answer's observation id, from the
 *  receipt's `saved` (one id per observation, in the save's order). */
function keepLinks(ctx: CourseToolContext, questions: readonly (string | null)[], json: unknown): void {
	const saved = (json as { saved?: unknown } | null)?.saved;
	if (!ctx.onSaved || !Array.isArray(saved)) return;
	const links = questions.flatMap((question, i) => (question && typeof saved[i] === "string" ? [{ question, observation: saved[i] as string }] : []));
	if (links.length) ctx.onSaved(links);
}

/**
 * Save one patch with the record's rules applied. Each attempt names the
 * answer it records (`question`); the field is the app's, so it is checked
 * against the session's answers and taken off before the engine reads the
 * patch. The answer then sets what only he and the question can say: it is
 * never a prediction unless he was asked to predict, and its confidence is
 * the one he chose, none when he chose none (round 6: a check saved as a
 * prediction, "gut feeling" saved as a guess over his Confident); an
 * answer to a question asked as a prediction is always one (round 8); and
 * a Show me is an attempt he gave up after its answer was shown, as in
 * practice (round 8). An answer already saved is refused, and so is a
 * re-mark of an attempt this session did not save and he did not dispute. The shown-solution rule (shown-help.ts) saves
 * an attempt as helped when he saw its question solved before it was
 * asked. A concluded problem's attempts name its conclude (`problem`), the
 * answer they record. Every save of a session's answers comes through here.
 */
export async function saveCourse(ctx: CourseToolContext, changes: unknown, problem?: { id: string; seen: boolean }): Promise<CourseResult> {
	const patch = patchOf(changes);
	const reviewTask = reviewTaskRefused(ctx, patch) ?? planStepAsTopic(ctx, patch);
	if (reviewTask) return { ok: false, kind: "validation", message: reviewTask };
	const listed = patch && Array.isArray(patch.observations) ? patch.observations : null;
	if (!patch || !listed) return ctx.records.run(ctx.course.workspace, { verb: "save", changes });
	const answers = ctx.answers ?? new Map<string, AnsweredQuestion>();
	const saved = savedThisTurn.get(ctx) ?? new Set<string>();
	savedThisTurn.set(ctx, saved);
	const recorded = recordedThisTurn.get(ctx) ?? new Set<string>();
	recordedThisTurn.set(ctx, recorded);
	const remarkable = ctx.remarkable && { saved: new Set([...ctx.remarkable.saved, ...recorded]), disputed: ctx.remarkable.disputed };
	const named = problem ? { observations: listed, questions: listed.map(() => null), refused: null } : namedQuestions(listed, answers, saved, remarkable);
	if (named.refused) return { ok: false, kind: "validation", message: named.refused };
	const newAnswer = await remarkWithNewAnswer(ctx, named.observations);
	if (newAnswer) return { ok: false, kind: "validation", message: newAnswer };
	const ruled = withShownHelp(named.observations, (_o, i) => {
		const question = named.questions[i];
		return question ? answers.get(question)?.seenBefore === true : problem?.seen === true;
	});
	const result = await ctx.records.run(ctx.course.workspace, { verb: "save", changes: { ...patch, observations: ruled.observations } });
	if (result.ok) for (const key of problem ? [problem.id] : named.questions) if (key) saved.add(key);
	if (result.ok) for (const id of receiptIds(result.json)) recorded.add(id);
	if (result.ok && !problem) keepLinks(ctx, named.questions, result.json);
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

/** What the tutor reads after the record itself failed (round 8: one
 *  refused save made it tell him "I can't confirm your last answer was
 *  saved" of an answer saved on 4 November). The lesson already shows him
 *  when the record can't be read. */
export const RECORD_FAILED_FOR_TUTOR =
	"Answers saved before are still saved. The app shows the learner when his course record can't be read, so never tell him an answer may not have been saved: teach on, and send this save again on a later turn.";

async function call(ctx: CourseToolContext, verb: CourseVerb): Promise<string> {
	if ((verb.verb === "save" || (verb.verb === "sources" && "add" in verb)) && ctx.records.forgotten?.(ctx.course.workspace)) {
		throw new Error(COURSE_DELETED_FOR_TUTOR);
	}
	const result: CourseResult = verb.verb === "save" ? await saveCourse(ctx, verb.changes) : await ctx.records.run(ctx.course.workspace, verb);
	if (result.ok) return JSON.stringify(withDayWords(result.json, studyDay()));
	if (result.kind === "validation") throw new Error(`Nothing was saved or read. ${result.message}`);
	throw new Error(`${result.message.replace(/\.?\s*$/, ".")} ${RECORD_FAILED_FOR_TUTOR}`);
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
