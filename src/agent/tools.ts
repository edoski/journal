import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { invalidInputResult, questionResult, serverExecute } from "./tool-execute.ts";
import {
	askInputSchema,
	askOptionProblems,
	explainInputBase,
	explainInputObject,
	explainInputProblems,
	parseOptionsIfString,
} from "../core/question-core.ts";
import { filterEnabledTools, type EnabledTools } from "../core/pending.ts";
import type { JobRecord } from "../core/contracts.ts";
import type { JobStore } from "../core/ports.ts";
import { jobTools, type DemoInput, type PdfInput, type ResearchInput, type VisualInput } from "./tools/jobs.ts";
import { planTools, type PlanToolContext } from "./tools/plan.ts";
import { probeDoneTool, type ProbeDoneContext } from "./tools/probe.ts";
import { proberGraphTools } from "./tools/graph.ts";
import { readTool } from "./tools/read.ts";
import { lsTool } from "./tools/ls.ts";
import { findTool } from "./tools/find.ts";
import { grepTool } from "./tools/grep.ts";
import { healToolRecord } from "./tools/heal.ts";
import type { GraphStore } from "../core/ports.ts";

export { jobTools };
export type { ProbeDoneContext } from "./tools/probe.ts";

/**
 * The agent-split tool composition (docs/probe-teach-split.md §1): the
 * PROBER and the TEACHER are different agents with different tool sets.
 * The graded question tool differs per agent: the prober's `recall` has
 * NO nodeId field at all (the model's schema never mentions it), the
 * teacher's `explain` carries the validated position field.
 *
 * - Question tools (explain / recall / ask_user_question): CLIENT-ANSWERED.
 *   Their execute validates the authoring refinements (the rules no
 *   schema carries — explainInputProblems / askOptionProblems / the live
 *   nodeId check; a failure returns an error tool result the model
 *   retries on), then returns the synthetic "question posed" placeholder
 *   (questionResult: terminate: true — the turn ends; the call streams to
 *   the browser in `input-available` state; the learner answers in the
 *   dock, which sends his answer with addToolOutput). Input schemas live in
 *   core/question-core. Question tools opt into SEQUENTIAL execution so
 *   parallel calls resolve in the model's call order (the dock's subject
 *   can never flip mid-turn).
 * - probe_done (src/agent/tools/probe.ts): SERVER-SIDE seam tool.
 * - planTools (src/agent/tools/plan.ts): SERVER-SIDE — author-once
 *   plan_init. Teacher only.
 * - jobTools (src/agent/tools/jobs.ts): SERVER-EXECUTED dispatch. Teacher
 *   only.
 */

/** GLM wobble guard (owner-approved, 2026-09-26): models sometimes emit
 *  `options` as a JSON-encoded string instead of an array; pi runs this
 *  BEFORE schema validation, so a double-encoded call lands instead of
 *  bouncing back as a validation error + wasted retry turn. NOTE: pi
 *  persists the tool call with its RAW arguments — the client coerces
 *  again in normalizeOptions (question-core), the same parseOptionsIfString.
 *  Anything unparseable passes through untouched: validation then reports
 *  honestly and the agent retries with a real error to learn from. */
function prepareQuestionArguments<T extends object>(args: unknown): T {
	if (args && typeof args === "object" && !Array.isArray(args)) {
		const o = args as { options?: unknown };
		if (typeof o.options === "string") {
			const parsed = parseOptionsIfString(o.options);
			if (parsed !== o.options) return { ...o, options: parsed } as T;
		}
		return o as T;
	}
	return args as T;
}

export const askUserQuestionTool: AgentTool<typeof askInputSchema> = {
	name: "ask_user_question",
	label: "ask_user_question",
	description:
		"Ask the learner a single question and pause until they answer. NOT graded — there is no correct answer. " +
		"Use when requirements are ambiguous, preferences are needed, a decision would materially affect the lesson, " +
		"or you need an open-ended response. ONE question per turn: call a single ask_user_question, then end your " +
		"turn — his answer determines the next.",
	parameters: askInputSchema,
	prepareArguments: prepareQuestionArguments,
	executionMode: "sequential",
	execute: async (_toolCallId, input) => {
		const problems = askOptionProblems(input.options ?? []);
		if (problems.length > 0) return invalidInputResult("ask_user_question", problems);
		return questionResult();
	},
};

// ─── the question tools ───────────────────────────────────────────────────────
//
// MECHANICAL DESCRIPTIONS ONLY (owner 2026-10-03): a tool's description
// carries what the tool DOES and how its fields work — nothing about what
// the questions should BE. The craft (free-response grading, question
// roles) lives in the system prompt — a single-sourced chunk both agents
// compose (prompts/shared/20-question-tools.md and the teacher's question
// fragments).

/** The free-response mechanics: the commitment rule is the GRADING
 *  CONTRACT — mechanics, not doctrine. The softer doctrine (near-miss
 *  reading, genuine gaps, what confidence means) lives in the shared
 *  prompt chunks. `name`: the teach tool self-references as explain, the
 *  probe variant as recall (owner 2026-10-09). */
function explainDescription(name: "explain" | "recall", nodeId: boolean): string {
	return (
		"Ask the learner to EXPLAIN something in his own words — a graded check with NO options: he types a free-text " +
		"answer. Unlike ask_user_question (no right answer), " +
		name +
		" always has one. THE COMMITMENT RULE: " +
		"correctAnswer is the FULL correct answer in your own words, reasoning included, COMMITTED before he ever " +
		"sees the question. When his answer returns, grade it strictly against the commitment — never revise it " +
		"after seeing his words. He sees the committed answer on submit. His answer arrives with `confidence`: " +
		"guessing, neutral or confident, his own one-tap read of it. " +
		(nodeId
			? "Set `nodeId` (required) to the plan node this question is about — validated at call time against the session's plan map. "
			: "") +
		"ONE question per turn: call a single " + name + ", then end your turn — his answer determines the next."
	);
}

/** The teacher's graded question tool (nodeId-validated: phases and the
 *  plan-status fold key on its tag). */
export function teachExplainToolFor(
	ctx: Pick<PlanToolContext, "chatId" | "chatStore">,
): AgentTool<typeof explainInputObject> {
	return {
		name: "explain",
		label: "explain",
		description: explainDescription("explain", true),
		parameters: explainInputObject,
		prepareArguments: prepareQuestionArguments,
		executionMode: "sequential",
		execute: async (_toolCallId, input) => {
			const problems = [...explainInputProblems(input)];
			const nodeIdProblemText = nodeIdProblem(ctx, input.nodeId);
			if (nodeIdProblemText) problems.push(nodeIdProblemText);
			if (problems.length > 0) return invalidInputResult("explain", problems);
			return questionResult();
		},
	};
}

/** The prober's graded question tool — named `recall`, not `explain`
 *  (owner, 2026-10-09): the teach explain adds `type` and `nodeId`, and a
 *  shared name carried the probe call shape into teaching. Old
 *  probe-phase records keep the `explain` name and parse identically. */
export const probeExplainTool: AgentTool<typeof explainInputBase> = {
	name: "recall",
	label: "recall",
	description: explainDescription("recall", false),
	parameters: explainInputBase,
	prepareArguments: prepareQuestionArguments,
	executionMode: "sequential",
	execute: async (_toolCallId, input) => {
		const problems = explainInputProblems(input);
		if (problems.length > 0) return invalidInputResult("recall", problems);
		return questionResult();
	},
};

/** The prober's registry context: the probe's own needs (probe_done —
 *  ProbeDoneContext) PLUS the job-dispatch wiring, since the owner ruling
 *  (2026-09-20) puts research + pdf in the probe phase's registry too. */
export interface ProberToolContext extends ProbeDoneContext {
	/** Creates the job record (deduped by toolCallId). */
	jobStore: JobStore;
	/** Fire the background runner for a freshly created job. */
	spawn: (job: JobRecord, input: ResearchInput | DemoInput | VisualInput | PdfInput) => void;
	/** Retained search-status seam; research dispatch is available keylessly. */
	searchAvailable?: () => boolean;
	/** The prober's graph-map reader (wave 7): present = the two map tools
	 *  (list_sessions / list_propositions) are registered. The composition
	 *  root passes it only when graphToolsEnabled(effective) — the graph
	 *  master switch AND the agent.graphTools toggle (settings-resolution).
	 *  Absent = the gate is closed, no map tools (tests drive this seam). */
	graphStore?: GraphStore;
}

/** The prober's tool set: recall (no nodeId) + ask + the learner-fs
 *  set + probe_done + the two phase-omnipresent job dispatch tools +
 *  (wave 7, gated) the graph-map reader. `enabled` is the resolved
 *  settings seam (core/pending.ts): any tool explicitly false is dropped
 *  from the registry. recall and probe_done stay always-on regardless —
 *  they are how the phase measures and ENDS. */
export function createProberTools(
	ctx: ProberToolContext,
	enabled?: EnabledTools,
): Record<string, AgentTool<any>> {
	// probe_done is re-added AFTER the filter, always-on by construction — it
	// is how the phase ENDS; a prober that can never conclude is a lockout.
	const done = probeDoneTool(ctx);
	// The job tools build over the SAME context/gates as the teacher's
	// (one builder, one gating semantic); the prober carries a SUBSET:
	const jobs = jobTools({
		chatId: ctx.chatId,
		jobStore: ctx.jobStore,
		spawn: ctx.spawn,
		searchAvailable: ctx.searchAvailable,
	});
	// healToolRecord (owner, 2026-10-09 — the whitehead generalization):
	// the standard argument heal over the WHOLE registry — every tool,
	// not just the one the latest wobble incident landed on.
	return healToolRecord({
		...filterEnabledTools(
			{
				ask_user_question: askUserQuestionTool,
				// The learner-filesystem set is always-on (user-decided 2026-09,
				// sources v1): the prober inspects and LOCATES learner-referenced
				// files while assessing the edge. Read-only by construction.
				read: readTool,
				ls: lsTool,
				find: findTool,
				grep: grepTool,
				// Job dispatch in the probe phase (owner ruling, 2026-09-20):
				// research + pdf are ALWAYS available in every phase — the
				// prober can verify facts or read learner PDFs while assessing.
				// demo/visual stay teach-phase-only (they need the lesson's plan
				// context). Same user-toggle filtering as the teacher; research
				// remains available without a search-provider key.
				...(jobs.research ? { research: jobs.research } : {}),
				pdf: jobs.pdf!,
				// The map reader (wave 7): present only when the settings gate
				// opened.
				...(ctx.graphStore
					? proberGraphTools({ chatStore: ctx.chatStore, graphStore: ctx.graphStore })
					: {}),
			},
			enabled,
		),
		// Past the filter: a stored `explain: false` from the retired
		// quizzing switch must never drop the only graded tool.
		recall: probeExplainTool,
		...done,
	});
}

// ─── the teacher's question tool (explain carries the position field) ────────

/** The nodeId-against-live-tree check the teacher's explain chains after
 *  the commitment check. */
function nodeIdProblem(ctx: Pick<PlanToolContext, "chatId" | "chatStore">, nodeId: string): string | null {
	const record = ctx.chatStore.getChat(ctx.chatId);
	const known = record?.tree?.nodes.map((n) => n.id) ?? [];
	if (!known.includes(nodeId)) {
		return (
			`nodeId "${nodeId}" matches no node in this session's plan map. ` +
			(known.length > 0
				? `Copy one of your plan_init slugs exactly (${known.slice(0, 5).join(", ")}${known.length > 5 ? ", …" : ""}).`
				: "No plan map exists yet — call plan_init before posing questions.")
		);
	}
	return null;
}

export interface TeacherToolContext extends PlanToolContext {
	/** Job-tool wiring (sub-agent dispatch): the job store + the runner's
	 *  spawn seam. The composition root injects both. */
	jobStore: JobStore;
	/** Fire the background runner for a freshly created job. The tool input
	 *  rides along — the spawn fires mid-stream, before the tool part is
	 *  persisted to the transcript (a transcript scan would race it). */
	spawn: (job: JobRecord, input: ResearchInput | DemoInput | VisualInput | PdfInput) => void;
	/** Retained search-status seam; research dispatch is available keylessly. */
	searchAvailable?: () => boolean;
}

/**
 * Per-request teacher tool registry: teach questions (validated nodeId) +
 * plan tools + job tools, all closing over the ctx.
 *
 * `enabled` is the resolved settings seam (core/pending.ts EnabledTools —
 * Platform's chat-handler wiring passes it through from settings). Today
 * only the sub-agent tools (research/demo/visual) are user-toggleable, but
 * the filtering is GENERIC: any name explicitly false is dropped, so
 * future toggleables need no change here. The graded question tool is
 * added past the filter, never toggleable.
 * Absent/undefined = enabled — tests and old records see today's set.
 */
export function createTeacherTools(
	ctx: TeacherToolContext,
	enabled?: EnabledTools,
): Record<string, AgentTool<any>> {
	// healToolRecord — same standard as the prober's registry (above).
	return healToolRecord({
		...filterEnabledTools(
			{
			ask_user_question: askUserQuestionTool,
			// The learner-filesystem set is always-on (user-decided 2026-09,
			// sources v1): the teacher locates and reads learner-referenced
			// files on its own terms — nothing auto-injects. Read-only by
			// construction (fs-shared.ts).
			read: readTool,
			ls: lsTool,
			find: findTool,
			grep: grepTool,
			...planTools(ctx),
			...jobTools({ chatId: ctx.chatId, jobStore: ctx.jobStore, spawn: ctx.spawn, searchAvailable: ctx.searchAvailable }),
		},
		enabled,
		),
		explain: teachExplainToolFor(ctx),
	});
}
