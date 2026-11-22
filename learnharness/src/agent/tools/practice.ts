/**
 * THE PRACTICE TOOLS (practice sessions, owner design 2026-10-04): the
 * practice agent's ENTIRE toolset — `problem` (pose: terminates the turn;
 * the commitment rides the call's arguments, hidden from the learner UI)
 * and `conclude` (end the problem: normal result, the turn continues so
 * the same reply can reveal + pose the next). The gating law (owner
 * ruling): an agent cannot pose while a problem is active and cannot
 * conclude with nothing active — activeProblemOf is the single fold both
 * gates read.
 *
 * Mechanics-only descriptions (the doctrine ruling, 2026-10-04): the tool
 * descriptions carry WHAT to pass and WHAT happens — the theory, the
 * commit-before-pose law, the hint ladder all live in the system prompt
 * (prompts/practice/10-doctrine.md).
 */

import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { jobTools, type JobToolContext } from "./jobs.ts";
import { teachHandoffTool } from "./handoff.ts";
import { nameSessionTool } from "./name-session.ts";
import type { ChatStore } from "../../core/ports.ts";
import type { SteerMessage } from "../../core/contracts/jobs.ts";
import { activeProblemOf, finalSubmissionOf, seenBeforeAsked } from "../../core/native-messages.ts";
import { boundaryParse } from "../../core/tool-parts.ts";
import type { LhMessage } from "../../core/native-messages.ts";
import { concludeResult, invalidInputResult, problemResult } from "../tool-execute.ts";
import { healEncodedArguments, healToolRecord } from "./heal.ts";
import { saveCourse, type CourseToolContext } from "./course.ts";
import { studyDay, withDayWords } from "../../core/day-words.ts";
import type { LhMarkerMessage } from "../../core/native-messages.ts";
import { CONCLUDE_ACK_TEXT } from "../../core/contracts/chat.ts";
import { CONFIDENCE_STATES } from "../../core/contracts/course.ts";
import { concludedSavesOf, conclusionProblem, practiceObservations, recordLineProblem, type PracticeConclusion } from "../../core/practice-attempts.ts";


/** The record-reading context the gates need (the plan-tools idiom). */
export interface PracticeToolContext {
	chatId: string;
	chatStore: { getChat(id: string): { messages: LhMessage[]; kind?: string; answerSaves?: Readonly<Record<string, readonly string[]>> } | null } & Partial<Pick<ChatStore, "nameSession">>;
	/** THE RARELY-NEEDED SET (owner round 10, 2026-10-05): the research +
	 *  pdf jobs (both keyless). Absent (tests) = absent from the registry. */
	jobs?: JobToolContext;
	/** Queue a handoff's wake: present = the `teach` handoff is registered
	 *  (the composition root always passes it). */
	deliver?: (steer: SteerMessage) => void;
}

/** TURN-SCOPED GATE STATE (the BKT incident, 2026-10-05): the gates used
 *  to read the STORED record — but the record freezes at the turn's
 *  write-ahead (persistTurn lands only at turn END), so a mid-turn
 *  conclude → pose pair could never see each other: every conclude
 *  succeeded against the stale record and every following pose died on
 *  "a problem is already active" until the model gave up ("the problem
 *  slot is stuck"). The gate seeds ONCE from the record at construction
 *  (one practiceTools per turn — chat-handler builds the agent per
 *  request, so there is no cross-turn leakage), and the executes flip
 *  this closure — the intra-turn truth the record cannot hold yet. */
export interface PracticeGate {
	problemActive: boolean;
}

/** Seed the turn's gate from the record (result-aware activeProblemOf —
 *  only a cleanly-posed problem counts). */
export function createPracticeGate(ctx: PracticeToolContext): PracticeGate {
	const record = ctx.chatStore.getChat(ctx.chatId);
	return { problemActive: record ? activeProblemOf(record.messages) !== null : false };
}

// ─── problem: the pose ───────────────────────────────────────────────────────

export const problemInputObject = Type.Object({
	statement: Type.String({
		description:
			"REQUIRED — the problem as the learner sees it (markdown + LaTeX). Must be self-contained and " +
			"solvable from the session's material. NEVER announces the target proposition.",
	}),
	mode: Type.Union([Type.Literal("recall"), Type.Literal("discrimination"), Type.Literal("composition")], {
		description: "REQUIRED — the demand mode: recall, discrimination, or composition (bare words, no quotes).",
	}),
	topics: Type.Array(Type.String({ minLength: 1 }), {
		minItems: 1,
		description:
			"REQUIRED — the course topic handle(s) this problem exercises, from the course record. " +
			"The attempt is saved under the same handles.",
	}),
	modelSolution: Type.String({
		description: "REQUIRED — the full solution, moves in order, committed BEFORE the learner sees the problem. This IS the reveal — conclude shows it verbatim; never re-author it.",
	}),
});

export type ProblemInput = Static<typeof problemInputObject>;

export function problemTool(gate: PracticeGate): AgentTool<typeof problemInputObject> {
	return {
		name: "problem",
		label: "problem",
		description:
			"Pose one practice problem. Ends the turn — the learner works in the thinking field; their thinking " +
			"traces and answer commits arrive back as labeled messages. The modelSolution rides this call's " +
			"arguments and stays hidden from the learner until you conclude (conclude shows it verbatim — the " +
			"reveal needs no new field). Only one problem may be active — conclude it before posing the next.",
		parameters: problemInputObject,
		executionMode: "sequential",
		prepareArguments: (args: unknown) => healEncodedArguments(args, problemInputObject) as never,
		execute: async (_toolCallId, _input) => {
			if (gate.problemActive) {
				return invalidInputResult("problem", [
					"a problem is already active — call conclude on it before posing the next one",
				]);
			}
			gate.problemActive = true;
			return problemResult();
		},
	};
}

// ─── conclude: the end of a problem ──────────────────────────────────────────

function attemptResult(description: string) {
	return Type.Union([Type.Literal("correct"), Type.Literal("partial"), Type.Literal("incorrect")], { description });
}

function brokeAtField() {
	return Type.Optional(
		Type.String({
			minLength: 1,
			description:
				"When an answer to a problem with several topics was incorrect or partial: the handle of the topic where it first broke. The miss is charged to that topic alone, and no other topic is credited. One answer has one result: never a result per topic. A problem whose labelled parts went differently gives parts instead.",
		}),
	);
}

/** A problem's labelled parts that went differently (round 8's per-part
 *  charging, kept one result per topic by round 14's M2). */
function partsField() {
	return Type.Optional(
		Type.Array(
			Type.Object({
				part: Type.String({ minLength: 1, description: "The part's label as the problem's statement writes it: \"(a)\", \"2)\"." }),
				topics: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, description: "The posed topics this part tests, each in this part alone." }),
				result: attemptResult("This part's result."),
			}),
			{
				minItems: 2,
				description:
					"Only when the problem's statement has labelled parts ((a), (b)… or 1), 2)…) that test different topics and went differently: each part, the topics it tests and its result, so each topic takes its own part's result. Each topic in one part at most; a topic in no part takes result, which is the whole answer's (partial when the parts differ). A problem with no labelled parts has one result: never parts. Leave brokeAt out.",
			},
		),
	);
}

/** The record sentence's ask, on the conclusion and its first try: the
 *  line his topic's history reads for the answer (round 11, 2 n5: the
 *  history showed the whole problem, and a first try as "First try"). */
const RECORD_DESCRIPTION =
	"What he did on this answer, as one short line for his course record in the words a lesson save uses, with math in `$…$` LaTeX: what he got right or where it broke (\"Subtracted the rank from the rows instead of the columns\", \"Found both eigenvalues from the trace and determinant\"), never the problem's statement. His topic's history reads it. Required for every answer, a right one included.";

export const concludeInputObject = Type.Object({
	outcome: Type.Union(
		[
			Type.Literal("solved"),
			Type.Literal("solvedWithHints"),
			Type.Literal("movedOn"),
			Type.Literal("surrendered"),
			Type.Literal("dismissed"),
		],
		{ description: "REQUIRED — the outcome: solved, solvedWithHints, movedOn, or surrendered — bare words, no quotes (dismissed is synthesized, never yours)." },
	),
	verdict: Type.String({
		description: "REQUIRED — the plain-language verdict, shown to the learner on the card: addressed to him as \"you\", what was credited, where it broke, with math in `$…$` LaTeX. On a wrong answer: localize the break, do NOT give the correction.",
	}),
	rung: Type.Union(
		[Type.Literal("R0"), Type.Literal("R1"), Type.Literal("R2"), Type.Literal("R3"), Type.Literal("R4"), Type.Literal("R5"), Type.Null()],
		{ description: "REQUIRED — the rung of the strongest hint actually given before he answered or gave up, judged by what it said: R0 through R5, or null = no hint was given (bare, no quotes). The solution revealed after he gives up is not a hint." },
	),
	missClass: Type.Union(
		[
			Type.Literal("cue"),
			Type.Literal("discrimination"),
			Type.Literal("execution"),
			Type.Literal("careless"),
			Type.Literal("structural"),
			Type.Null(),
		],
		{ description: "REQUIRED — the miss classification: cue, discrimination, execution, careless, or structural — or null = no miss (bare, no quotes)." },
	),
	retest: Type.Boolean({ description: "REQUIRED — true marks the problem for a fresh-surface retest before the session ends." }),
	result: Type.Union([attemptResult("correct, partial or incorrect"), Type.Null()], {
		description:
			"REQUIRED — the attempt's result for his course record: correct, partial (part of it right: some of its parts right and others not, or a right answer reached by reasoning that does not hold; a verdict that names a part he got right is never incorrect) or incorrect; giving up is incorrect. A right guess is correct; his confidence travels separately. null only with movedOn when he claimed no answer at all, as when he asked to be taught instead: nothing is recorded.",
	}),
	response: Type.String({ description: "REQUIRED — his final answer, in a short line, with math in `$…$` LaTeX (it is recorded as the attempt the learner reads later)." }),
	record: Type.Optional(Type.String({ minLength: 1, description: RECORD_DESCRIPTION })),
	chose: Type.Optional(
		Type.String({
			minLength: 1,
			description:
				"When his final answer used a wrongly chosen method: that method's course topic handle. A wrong method he later corrected goes in firstTry.chose.",
		}),
	),
	brokeAt: brokeAtField(),
	parts: partsField(),
	firstTry: Type.Optional(
		Type.Object(
			{
				result: Type.Union([Type.Literal("partial"), Type.Literal("incorrect")], {
					description: "REQUIRED — the result of his first answer: partial or incorrect, since a right first answer solved the problem and is the conclusion itself.",
				}),
				response: Type.String({ description: "REQUIRED — his first answer, in a short line, with math in `$…$` LaTeX." }),
				record: Type.Optional(Type.String({ minLength: 1, description: RECORD_DESCRIPTION })),
				sure: Type.Union([...CONFIDENCE_STATES.map((s) => Type.Literal(s)), Type.Null()], {
					description:
						"REQUIRED — the Confidence line of the submission that made this first claim (guessing, neutral or confident), or null when it had none. A working note before the claim is not the claim.",
				}),
				chose: Type.Optional(
					Type.String({ minLength: 1, description: "When the first answer used a wrongly chosen method: that method's course topic handle." }),
				),
				brokeAt: brokeAtField(),
				parts: partsField(),
			},
			{ description: "When the problem took more than one answer of his: his first unaided answer, which did not solve it, its result and his confidence in it. Never his final answer again; a question or a request is not an answer." },
		),
	),
});

export type ConcludeInput = Static<typeof concludeInputObject>;

/** Where a conclusion is recorded: the session's record (for the pose and
 *  the submissions) and its course. */
export interface ConcludeRecording {
	ctx: PracticeToolContext;
	course: CourseToolContext;
}

/** True when he pressed Explain instead on this problem before submitting
 *  any work on it: he asked to be taught, so nothing was attempted. */
function explainedBeforeAnyWork(messages: readonly LhMessage[], problemCallId: string): boolean {
	const onProblem = messages
		.filter((m): m is LhMessage & LhMarkerMessage => m.role === "custom")
		.filter((m) => (m.details as { problemCallId?: unknown } | null)?.problemCallId === problemCallId);
	const explained = onProblem.some((m) => m.customType === "practice-request" && (m.details as { request?: unknown }).request === "explain");
	const worked = onProblem.some((m) => m.customType === "practice-thinking" || (m.customType === "practice-request" && typeof (m.details as { text?: unknown }).text === "string"));
	return explained && !worked;
}

/** How many answers of his the session holds on this problem: his work,
 *  and the work he had written when he asked for help. */
function answersOn(messages: readonly LhMessage[], problemCallId: string): number {
	return messages.filter((m) => {
		if (m.role !== "custom") return false;
		const details = m.details as { problemCallId?: unknown; text?: unknown } | null;
		if (details?.problemCallId !== problemCallId) return false;
		return m.customType === "practice-thinking" || (m.customType === "practice-request" && typeof details.text === "string");
	}).length;
}

/** What the tutor reads when the problem's answer was saved before the app
 *  restarted: the receipt that follows is that save's. */
const ALREADY_SAVED =
	"This problem's answer was already marked and saved before the app restarted, so nothing new is saved and the problem is closed. Tell him in plain words how his answer was marked, from this receipt, and answer what his newest message asks; never grade it again.";

/** Keep a problem's saved attempts under the call that posed it, the moment
 *  the engine takes them (concludedSavesOf). */
function keepUnderPose(rec: ConcludeRecording, poseCallId: string, json: unknown): void {
	const saved = (json as { saved?: unknown } | null)?.saved;
	if (!Array.isArray(saved)) return;
	const links = saved.filter((id): id is string => typeof id === "string").map((observation) => ({ question: poseCallId, observation }));
	if (links.length > 0) rec.course.onSaved?.(links);
}

/** Save a concluded problem's attempts; a refusal names what to fix. An
 *  attempt the record would not take is kept as `unsaved`, the conclude's
 *  own observations, which a later save writes as they are. */
async function recordConclusion(rec: ConcludeRecording, input: ConcludeInput, concludeCallId: string): Promise<{ refused?: string; text: string; unsaved?: Record<string, unknown>[] }> {
	if (input.outcome === "dismissed") return { text: "" };
	const record = rec.ctx.chatStore.getChat(rec.ctx.chatId);
	const active = record ? activeProblemOf(record.messages) : null;
	// The record keeps the pose's raw arguments, so it is read the way the
	// tool boundary accepted it (a `topics` sent as a JSON string included).
	const pose = active ? boundaryParse<ProblemInput>(problemInputObject, active.input) : undefined;
	if (!record || !active || !pose) {
		return { text: "The attempt could not be recorded: the posed problem was not found in the session record." };
	}
	// Saved already, by a turn a restart cut short before its transcript was
	// written: nothing is saved twice (round 19, M3).
	const kept = concludedSavesOf(record, active.toolCallId);
	if (kept.length > 0) return { text: `${ALREADY_SAVED} Course record: ${JSON.stringify({ saved: kept })}` };
	const topics = pose.topics;
	if (explainedBeforeAnyWork(record.messages, active.toolCallId)) {
		return { text: "No attempt recorded: he asked to be taught before submitting any work on this problem." };
	}
	const conclusion: PracticeConclusion = {
		outcome: input.outcome,
		rung: input.rung,
		result: input.result,
		response: input.response,
		...(input.record ? { record: input.record } : {}),
		...(input.chose ? { chose: input.chose } : {}),
		// A result per topic, sent unasked, gives one answer two results.
		...("byTopic" in input ? { byTopic: (input as { byTopic?: unknown }).byTopic } : {}),
		...(input.brokeAt ? { brokeAt: input.brokeAt } : {}),
		...(input.parts ? { parts: input.parts } : {}),
		...(input.firstTry ? { firstTry: input.firstTry } : {}),
	};
	const problem = conclusionProblem(conclusion, topics, pose.statement);
	if (problem) return { refused: problem, text: "" };
	// A first try is an answer of his before the final one, which the
	// session holds, never the tutor's claim alone (round 16, M2: one answer
	// after a hint was saved twice, once as a right first try).
	if (answersOn(record.messages, active.toolCallId) < 2) delete conclusion.firstTry;
	const bare = recordLineProblem(conclusion, pose.statement);
	if (bare) return { refused: bare, text: "" };
	// His newest message came from Ask: a question, never his answer, and
	// the confidence of an earlier note is not its (round 5).
	const final = finalSubmissionOf(record.messages, active.toolCallId);
	if (final?.kind === "asked" && conclusion.result !== null && input.outcome !== "surrendered") {
		return { refused: "his newest message came from Ask: a question to you, not his answer, so it concludes nothing. Answer his question; his answer comes as his work", text: "" };
	}
	if (conclusion.result === null) {
		return { text: "No attempt recorded: he claimed no answer." };
	}
	const observations = practiceObservations(
		{ statement: pose.statement, topics },
		conclusion,
		final?.kind === "work" ? final.confidence : undefined,
	);
	// The same problem posed again after its solution was shown: his
	// answer repeats what he saw (shown-help.ts).
	const seen = seenBeforeAsked(record.messages, active.toolCallId);
	const saved = await saveCourse(rec.course, { observations }, { id: concludeCallId, seen });
	if (saved.ok) {
		keepUnderPose(rec, active.toolCallId, saved.json);
		return { text: `Course record: ${JSON.stringify(withDayWords(saved.json, studyDay()))}` };
	}
	// The problem still concludes: a pose's topics cannot change after the
	// fact, so holding the problem open would lock the session.
	const repair =
		saved.kind === "validation"
			? "Repair it with course_save (for example, create the missing topic in the same patch, placed in the path) and send these observations: "
			: "On your next turn, re-send exactly this with course_save: ";
	// Each names this conclude, so the problem's card shows the mark.
	const resend = observations.map((o) => ({ ...o, question: concludeCallId }));
	return { text: `The attempt was not saved (${saved.message}). ${repair}${JSON.stringify({ observations: resend })}`, unsaved: observations };
}

export function concludeTool(gate: PracticeGate, recording?: ConcludeRecording): AgentTool<typeof concludeInputObject> {
	return {
		name: "conclude",
		label: "conclude",
		description:
			"Conclude the active problem: records the outcome + verdict, reveals the committed solution, and frees " +
			"the learner's composer. After the result, say your closing words about the learner's work if useful, then " +
			"END YOUR TURN — no further tool calls, except `teach` when he asked to be taught. The next problem is NEVER posed here: it waits for the learner's " +
			"explicit go-ahead (a *Next problem* message, or their own words asking for the next one). Between problems, " +
			"answer their questions about the concluded one. Nothing may conclude unless a problem is active.",
		parameters: concludeInputObject,
		prepareArguments: (args: unknown) => healEncodedArguments(args, concludeInputObject) as never,
		executionMode: "sequential",
		execute: async (toolCallId, input) => {
			if (!gate.problemActive) {
				return invalidInputResult("conclude", ["no active problem to conclude — pose one first"]);
			}
			const recorded = recording ? await recordConclusion(recording, input, toolCallId) : { text: "" };
			if (recorded.refused) return invalidInputResult("conclude", [recorded.refused]);
			gate.problemActive = false;
			const ack = concludeResult();
			if (!recorded.text) return ack;
			// The observations it could not save ride its result, for the save
			// that sends them again (round 15, M3).
			const details = recorded.unsaved ? ({ unsaved: recorded.unsaved } as unknown as null) : ack.details;
			return { ...ack, content: [{ type: "text", text: `${CONCLUDE_ACK_TEXT}\n\n${recorded.text}` }], details };
		},
	};
}

/** The practice toolset (the practice agent's whole registry). */
export function practiceTools(ctx: PracticeToolContext, course?: CourseToolContext): Record<string, AgentTool<any>> {
	// ONE gate per turn, shared by both tools — the intra-turn truth.
	const gate = createPracticeGate(ctx);
	// THE RARELY-NEEDED SET (owner round 10): the research + pdf jobs
	// (available without search keys; demo/visual stay teach-only), and
	// the prober's map readers when the settings gate opened. His files are
	// Claude Code's Read, Grep and Glob, as for every tutor agent.
	// problem/conclude are the session; these are exceptions the doctrine
	// says to reach for rarely.
	const jobs = ctx.jobs ? jobTools(ctx.jobs) : null;
	// healToolRecord (owner, 2026-10-09 — the whitehead generalization):
	// the standard argument heal over the WHOLE registry. problem/conclude
	// keep their own (target-normalizing) prepareArguments as the composed
	// inner pass; the double heal is idempotent by construction.
	return healToolRecord({
		problem: problemTool(gate),
		conclude: concludeTool(gate, course ? { ctx, course } : undefined),
		...(jobs?.research ? { research: jobs.research } : {}),
		...(jobs ? { pdf: jobs.pdf! } : {}),
		...(ctx.deliver ? teachHandoffTool({ chatId: ctx.chatId, chatStore: ctx.chatStore, deliver: ctx.deliver }, gate) : {}),
		// A practice session started on no topic names itself in its first reply (name-session.ts).
		...(ctx.chatStore.nameSession ? nameSessionTool({ chatId: ctx.chatId, chatStore: ctx.chatStore as Pick<ChatStore, "getChat" | "nameSession"> }) : {}),
	});
}
