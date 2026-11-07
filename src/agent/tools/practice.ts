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
import { readTool } from "./read.ts";
import { lsTool } from "./ls.ts";
import { findTool } from "./find.ts";
import { grepTool } from "./grep.ts";
import { jobTools, type JobToolContext } from "./jobs.ts";
import { proberGraphTools, type GraphToolContext } from "./graph.ts";
import { activeProblemOf } from "../../core/native-messages.ts";
import type { LhMessage } from "../../core/native-messages.ts";
import { concludeResult, invalidInputResult, problemResult } from "../tool-execute.ts";
import { healEncodedArguments, healToolRecord } from "./heal.ts";
import type { CourseToolContext } from "./course.ts";
import type { LhMarkerMessage } from "../../core/native-messages.ts";
import { CONCLUDE_ACK_TEXT } from "../../core/contracts/chat.ts";
import {
	conclusionProblem,
	practiceObservations,
	type PracticeConclusion,
	type SubmissionConfidence,
} from "../../core/practice-attempts.ts";


/** The record-reading context the gates need (the plan-tools idiom). */
export interface PracticeToolContext {
	chatId: string;
	chatStore: { getChat(id: string): { messages: LhMessage[]; kind?: string } | null };
	/** THE RARELY-NEEDED SET (owner round 10, 2026-10-05): the map readers
	 *  behind the SAME settings gate as the prober's (graphToolsEnabled at
	 *  the composition root); the research + pdf jobs (both keyless).
	 *  Each absent context (tests) = absent from the registry. */
	graph?: GraphToolContext;
	jobs?: JobToolContext;
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
		description: "REQUIRED — the plain-language verdict: what was credited, where it broke. On a wrong answer: localize the break, do NOT give the correction.",
	}),
	rung: Type.Union(
		[Type.Literal("R0"), Type.Literal("R1"), Type.Literal("R2"), Type.Literal("R3"), Type.Literal("R4"), Type.Literal("R5"), Type.Null()],
		{ description: "REQUIRED — the hint-ladder rung the problem needed: R0 through R5, or null = no hint was given (bare, no quotes)." },
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
	result: Type.Union([Type.Literal("correct"), Type.Literal("partial"), Type.Literal("incorrect")], {
		description:
			"REQUIRED — the attempt's result for his course record: correct, partial (a guess, or a right answer reached by reasoning that does not hold) or incorrect.",
	}),
	response: Type.String({ description: "REQUIRED — his final answer, in a short line." }),
	chose: Type.Optional(
		Type.String({ minLength: 1, description: "On a discrimination miss: the course topic handle of the method he wrongly chose." }),
	),
	firstTry: Type.Optional(
		Type.Object(
			{
				result: Type.Union([Type.Literal("correct"), Type.Literal("partial"), Type.Literal("incorrect")]),
				response: Type.String({ description: "His first answer, in a short line." }),
			},
			{ description: "When the problem took more than one answer: his first unaided answer and its result." },
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

/** The confidence of the first and last submission on one problem. */
function submissionConfidence(messages: readonly LhMessage[], problemCallId: string): SubmissionConfidence {
	const states = messages
		.filter((m): m is LhMessage & LhMarkerMessage => (m as { customType?: string }).customType === "practice-thinking")
		.map((m) => m.details as { problemCallId?: unknown; confidence?: unknown } | null)
		.filter((d) => d?.problemCallId === problemCallId)
		.map((d) => (typeof d?.confidence === "string" ? d.confidence : undefined));
	return { first: states[0], last: states[states.length - 1] };
}

/** Save a concluded problem's attempts; a refusal names what to fix. */
async function recordConclusion(rec: ConcludeRecording, input: ConcludeInput): Promise<{ refused?: string; text: string }> {
	if (input.outcome === "dismissed") return { text: "" };
	const conclusion: PracticeConclusion = {
		outcome: input.outcome,
		rung: input.rung,
		result: input.result,
		response: input.response,
		...(input.chose ? { chose: input.chose } : {}),
		...(input.firstTry ? { firstTry: input.firstTry } : {}),
	};
	const problem = conclusionProblem(conclusion);
	if (problem) return { refused: problem, text: "" };
	const record = rec.ctx.chatStore.getChat(rec.ctx.chatId);
	const active = record ? activeProblemOf(record.messages) : null;
	const pose = active?.input as { statement?: unknown; topics?: unknown } | undefined;
	if (!record || !active || typeof pose?.statement !== "string" || !Array.isArray(pose.topics)) {
		return { text: "The attempt could not be recorded: the posed problem was not found in the session record." };
	}
	const observations = practiceObservations(
		{ statement: pose.statement, topics: pose.topics.filter((t): t is string => typeof t === "string") },
		conclusion,
		submissionConfidence(record.messages, active.toolCallId),
	);
	const saved = await rec.course.records.run(rec.course.course.workspace, { verb: "save", changes: { observations } });
	if (saved.ok) return { text: `Course record: ${JSON.stringify(saved.json)}` };
	if (saved.kind === "validation") return { refused: `the course record refused the attempt: ${saved.message}`, text: "" };
	return {
		text:
			`The attempt was not saved (${saved.message}). On your next turn, re-send exactly this with course_save: ` +
			JSON.stringify({ observations }),
	};
}

export function concludeTool(gate: PracticeGate, recording?: ConcludeRecording): AgentTool<typeof concludeInputObject> {
	return {
		name: "conclude",
		label: "conclude",
		description:
			"Conclude the active problem: records the outcome + verdict, reveals the committed solution, and frees " +
			"the learner's composer. After the result, say your closing words about the learner's work if useful, then " +
			"END YOUR TURN — no further tool calls. The next problem is NEVER posed here: it waits for the learner's " +
			"explicit go-ahead (a *Next problem* message, or their own words asking for the next one). Between problems, " +
			"answer their questions about the concluded one. Nothing may conclude unless a problem is active.",
		parameters: concludeInputObject,
		prepareArguments: (args: unknown) => healEncodedArguments(args, concludeInputObject) as never,
		executionMode: "sequential",
		execute: async (_toolCallId, input) => {
			if (!gate.problemActive) {
				return invalidInputResult("conclude", ["no active problem to conclude — pose one first"]);
			}
			const recorded = recording ? await recordConclusion(recording, input) : { text: "" };
			if (recorded.refused) return invalidInputResult("conclude", [recorded.refused]);
			gate.problemActive = false;
			const ack = concludeResult();
			if (!recorded.text) return ack;
			return { ...ack, content: [{ type: "text", text: `${CONCLUDE_ACK_TEXT}\n\n${recorded.text}` }] };
		},
	};
}

/** The practice toolset (the practice agent's whole registry). */
export function practiceTools(ctx: PracticeToolContext, course?: CourseToolContext): Record<string, AgentTool<any>> {
	// ONE gate per turn, shared by both tools — the intra-turn truth.
	const gate = createPracticeGate(ctx);
	// THE RARELY-NEEDED SET (owner round 10): read/ls/find/grep over the
	// learner's files (always — the same read-only set the teacher and
	// prober carry), the research + pdf jobs (available without search
	// keys; demo/visual stay teach-only), and
	// the prober's map readers when the settings gate opened. None are
	// toggle-filtered: problem/conclude are the session; these are
	// exceptions the doctrine says to reach for rarely.
	const jobs = ctx.jobs ? jobTools(ctx.jobs) : null;
	// healToolRecord (owner, 2026-10-09 — the whitehead generalization):
	// the standard argument heal over the WHOLE registry. problem/conclude
	// keep their own (target-normalizing) prepareArguments as the composed
	// inner pass; the double heal is idempotent by construction.
	return healToolRecord({
		problem: problemTool(gate),
		conclude: concludeTool(gate, course ? { ctx, course } : undefined),
		read: readTool,
		ls: lsTool,
		find: findTool,
		grep: grepTool,
		...(jobs?.research ? { research: jobs.research } : {}),
		...(jobs ? { pdf: jobs.pdf! } : {}),
		...(ctx.graph ? proberGraphTools(ctx.graph) : {}),
	});
}
