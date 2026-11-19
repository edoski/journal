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
import type { CourseMap } from "../../core/contracts/course-map.ts";
import { sameQuestionKey, shownHelpNote, withShownHelp } from "../../core/shown-help.ts";
import { engineConfidence } from "../../core/engine-confidence.ts";
import { RUNG_HELP } from "../../core/practice-attempts.ts";
import type { AnsweredQuestion } from "../../core/native-messages.ts";
import { studyDay, withDayWords } from "../../core/day-words.ts";
import { DOUBT } from "../../core/voice-check.ts";

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
	/** The attempts his disputes named, the only ones a re-mark may
	 *  correct (answer-marks.ts `remarkableOf`), read with `answers`.
	 *  Absent: none. */
	remarkable?: { disputed: ReadonlySet<string> };
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
	/** The topics a review was opened on (`ChatRecord.topics`): a task on
	 *  none of them, saved once its plan taught here, is the lesson the
	 *  review took up (`lessonTakenUp`), never one the review keeps. */
	reviewTopics?: readonly string[];
	/** The topics this session teaches as its lesson when a save runs
	 *  (session-opening.ts `lessonTopicsOf`): an answer on none of them is
	 *  saved `aside`, so a check in a side question never starts its topic
	 *  (round 17, m3). Absent or empty: no answer is aside. */
	lessonTopics?: () => readonly string[];
	/** The steps of this session's lesson plan as they stand when a save
	 *  runs (the plan may be written in the same turn). Absent: none. */
	planSteps?: () => readonly { id: string; title: string }[];
	/** Every course's map as the daily plan reads them, so a close names
	 *  each day whole across his courses (round 15, m3). Absent: this
	 *  course's alone. */
	courses?: () => Promise<readonly CourseMap[]>;
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

/** Each answer on none of the lesson's topics marked `aside`: a check in a
 *  side question is kept, and counts once its topic has an answer of its
 *  own, but never starts it or takes its first lesson away (round 17, m3:
 *  one Guessing answer on Similar matrices in the Linear maps lesson left
 *  it "Right, but a guess" with no Start, and moved Diagonalization). */
function asideOf(ctx: CourseToolContext, observations: readonly unknown[]): unknown[] {
	const lesson = ctx.lessonTopics?.() ?? [];
	if (lesson.length === 0) return [...observations];
	return observations.map((o) => {
		if (!isObject(o) || (o.kind ?? "attempt") !== "attempt" || "corrects" in o || !Array.isArray(o.topics) || o.topics.length === 0) return o;
		return o.topics.some((t) => lesson.includes(t as string)) ? o : { ...o, aside: true };
	});
}

/** Why a review's save is refused: it keeps a task. A task removed (null)
 *  is allowed. */
export const REVIEW_TASK_REFUSED =
	"tasks: this session is his review, and a review saves no task: what is left of it stays with the topic, whose review carries it. Leave tasks and focus out and send the rest.";

function reviewTaskRefused(ctx: CourseToolContext, patch: Record<string, unknown> | null): string | null {
	if (!ctx.review || !patch) return null;
	const tasks = isObject(patch.tasks) ? patch.tasks : {};
	const kept = Object.entries(tasks).filter(([, t]) => t !== null);
	const lesson = kept.filter(([, t]) => takesUpLesson(ctx, t)).map(([key]) => key);
	const refused = kept.some(([key]) => !lesson.includes(key)) || (typeof patch.focus === "string" && patch.focus !== "" && !lesson.includes(patch.focus));
	return refused ? REVIEW_TASK_REFUSED : null;
}

/** Whether a task a review saves is the lesson the session took up: on
 *  topics, none of them the review's, once a plan taught here. Saving it
 *  makes the session that topic's lesson (`lessonTakenUp`), so its page
 *  resumes it and the review's own topic keeps its review; a focus is kept
 *  only on such a task (round 18, M3: a review of Inclusion-exclusion began
 *  Expectation's lesson on his ask, with a plan that named no goal, and its
 *  close's save of the Expectation lesson's task was refused, so its page
 *  had nothing to resume). */
function takesUpLesson(ctx: CourseToolContext, task: unknown): boolean {
	const topics = isObject(task) && Array.isArray(task.topics) ? task.topics.filter((t): t is string => typeof t === "string" && t !== "") : [];
	const opened = ctx.reviewTopics ?? [];
	return topics.length > 0 && topics.every((t) => !opened.includes(t)) && (ctx.planSteps?.() ?? []).length > 0;
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

/** The sentence of doubt his answer held beside a Confident meter that
 *  the saved response leaves out, or null (round 18, m3: on sheet part
 *  (c), Confident, he wrote "Honestly not sure, gut feeling.", and o132's
 *  response dropped it; the card and `sure: confident` were right). */
function doubtDropped(o: Record<string, unknown>, answer: AnsweredQuestion): string | null {
	if (answer.confidence !== "confident" || !answer.words || !recordsAnAnswer(o)) return null;
	const said = answer.words.split(/(?<=[.!?])\s+|\n+/).find((s) => DOUBT.test(s));
	if (!said) return null;
	const response = typeof o.response === "string" ? o.response : "";
	return DOUBT.test(response) ? null : said.trim();
}

/** The answers each session's saves named in this turn, after they went
 *  through: the session's record holds them only from the next turn. */
const savedThisTurn = new WeakMap<CourseToolContext, Set<string>>();

/** The help a Show me gave, in the words practice's Show me saves (its
 *  R5 rung): one rule for a shown answer, in a lesson as in practice
 *  (round 8, 2 M3: a lesson's Show me was saved as no help). */
export const SHOW_ME_HELP = RUNG_HELP.R5;

/** Why a re-mark is refused: he did not ask for it. Only a ruling on his
 *  dispute re-marks an attempt, and only one the dispute named; his own
 *  statement (a self_report) may correct any (Edo, round 14 m12: the tutor
 *  re-marked older answers unasked, "I've changed the mark on your earlier
 *  answer…", o43 over the seeded o37). Null when it may stand. */
function remarkRefused(o: Record<string, unknown>, i: number, remarkable: CourseToolContext["remarkable"]): string | null {
	if ((o.kind ?? "attempt") === "self_report" || !Array.isArray(o.corrects)) return null;
	const targets = o.corrects.filter((id): id is string => typeof id === "string");
	if (!("disputed" in o)) {
		return `observations[${i}].corrects: he did not dispute ${targets.join(", ") || "it"}, so ${targets.length > 1 ? "they stand" : "it stands"} as recorded: never re-mark an answer on your own, and say nothing to him of its mark or its help: not that it was wrong, not what it should have been, and never that a mark changed. Leave the re-mark out; a new answer is simply a new attempt.`;
	}
	const outside = targets.filter((id) => !remarkable?.disputed.has(id));
	return outside.length === 0 ? null : `observations[${i}].corrects: he disputed no mark of ${outside.join(", ")}. A ruling re-marks only the attempts his dispute named.`;
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
	// A problem whose conclude could not save its attempts: whatever this
	// save sends for it, the conclude's own observations go, first try and
	// final answer, once (round 15, M3: the pair was refused as two results
	// for one answer, and only the first try was saved). Any other answer
	// keeps one observation with one result.
	const replays = new Set<number>();
	const replayed = new Set<string>();
	const expanded: unknown[] = [];
	for (const o of listed) {
		const named = isObject(o) && typeof o.question === "string" ? o.question.trim() : "";
		const replay = named ? answers.get(named)?.replay : undefined;
		const open = replay && !answers.get(named)!.recorded && !saved.has(named) && !("corrects" in (o as Record<string, unknown>));
		if (!open) {
			expanded.push(o);
			continue;
		}
		if (replayed.has(named)) continue;
		replayed.add(named);
		for (const r of replay) {
			replays.add(expanded.length);
			expanded.push({ ...r, question: named });
		}
	}
	const observations = expanded.map((o, i) => {
		if (!isObject(o)) {
			questions.push(null);
			return o;
		}
		const { question, ...rest } = o;
		if (replays.has(i)) {
			questions.push(question as string);
			return rest;
		}
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
		if (answer.dropped && !("corrects" in rest)) {
			refuse(`observations[${i}].question: the problem he left was dropped with nothing recorded (Done for today, or his discard), so nothing of it is saved, and his newest message answers nothing since. Save nothing for it.`);
		}
		if (questions.slice(0, -1).includes(named) && !("corrects" in rest)) {
			refuse(`observations[${i}].question: ${JSON.stringify(named)} is named by an earlier observation of this save, and one answer is one observation with one result: list every topic it was asked on in that observation's topics, and send it once.`);
		}
		if ((answer.recorded || saved.has(named)) && !("corrects" in rest)) {
			refuse(`observations[${i}].question: ${JSON.stringify(named)} is already saved, so it is not saved again. Leave it out and send the rest; a re-mark of it names its attempt with corrects.`);
		}
		const ruled: Record<string, unknown> = { ...rest };
		const doubt = doubtDropped(rest, answer);
		if (doubt) {
			refuse(
				`observations[${i}].response: he wrote ${JSON.stringify(doubt)} with his meter on Confident, and the response leaves it out. His words of doubt stay in response, as he wrote them, beside his answer: the meter sets \`sure\`, his words say what he doubted. Send it again with them.`,
			);
		}
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

/** A ruling keeps the confidence he gave the answer it re-marks, since a
 *  ruling judges his answer and he never gave it another (round 14, m12: a
 *  re-mark saved `sure: confident` over an answer he never marked). Each
 *  re-mark takes the `sure` of the first attempt it corrects, none when
 *  that had none; the record is read only for a save that holds one. */
async function remarksKeepConfidence(ctx: CourseToolContext, observations: readonly unknown[]): Promise<unknown[]> {
	const remarks = observations.flatMap((o, i) => (isObject(o) && (o.kind ?? "attempt") === "attempt" && Array.isArray(o.corrects) && typeof o.corrects[0] === "string" ? [{ i, target: o.corrects[0] as string }] : []));
	if (remarks.length === 0) return [...observations];
	const shown = await ctx.records.run(ctx.course.workspace, { verb: "show", handles: [...new Set(remarks.map((r) => r.target))] });
	if (!shown.ok) return [...observations];
	const items = ((shown.json as { items?: Record<string, { sure?: unknown }> } | null)?.items ?? {}) as Record<string, { sure?: unknown }>;
	const kept = [...observations];
	for (const { i, target } of remarks) {
		if (!(target in items)) continue;
		const { sure: _given, ...rest } = kept[i] as Record<string, unknown>;
		const sure = items[target]!.sure;
		kept[i] = typeof sure === "string" ? { ...rest, sure } : rest;
	}
	return kept;
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
	const named = problem ? { observations: listed, questions: listed.map(() => null), refused: null } : namedQuestions(listed, answers, saved, ctx.remarkable);
	if (named.refused) return { ok: false, kind: "validation", message: named.refused };
	const ruled = withShownHelp(await remarksKeepConfidence(ctx, named.observations), (_o, i) => {
		const question = named.questions[i];
		return question ? answers.get(question)?.seenBefore === true : problem?.seen === true;
	});
	const result = await ctx.records.run(ctx.course.workspace, { verb: "save", changes: { ...patch, observations: asideOf(ctx, ruled.observations) } });
	if (result.ok) for (const key of problem ? [problem.id] : named.questions) if (key) saved.add(key);
	// A problem's attempts are kept under its conclude, so its card shows while
	// the turn still runs (round 15, 2 D2: First try / Then came only after a
	// slow turn-end read).
	if (result.ok) keepLinks(ctx, problem ? listed.map(() => problem.id) : named.questions, result.json);
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
				"level changes, the focus and current path topic, the due count, and notes worth acting on. " +
				"Its `starts_moved` lists each first lesson his study today moved off a day he was told: your closing words say it, its new day and its `moved` cause as written, and, with `past_exam`, that it now comes after the exam. " +
				"A refused patch saved nothing; " +
				"the error names the field and the fix. Resending a save that failed is safe; an answer already saved is refused.",
			parameters: saveInput,
			execute: serverExecute("course_save", saveInput, (input) => call(ctx, { verb: "save", changes: input.changes })),
		},
	});
}
