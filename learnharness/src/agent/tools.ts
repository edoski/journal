import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { invalidInputResult, questionBeforePlanResult, questionResult, serverExecute, stepQuestionResult } from "./tool-execute.ts";
import {
	askInputSchema,
	askLabelProblems,
	askOptionProblems,
	explainInputBase,
	explainInputObject,
	explainInputProblems,
	parseOptionsIfString,
} from "../core/question-core.ts";
import type { JobRecord, PlanTree, SteerMessage } from "../core/contracts.ts";
import type { JobStore } from "../core/ports.ts";
import { jobTools, type DemoInput, type PdfInput, type ResearchInput, type VisualInput } from "./tools/jobs.ts";
import { planTools, type PlanToolContext } from "./tools/plan.ts";
import { SLUG_RE } from "./tools/mermaid-plan.ts";
import { probeDoneTool, type ProbeDoneContext } from "./tools/probe.ts";
import { nameSessionTool } from "./tools/name-session.ts";
import { withPracticeHandoff } from "./tools/handoff.ts";
import { healToolRecord } from "./tools/heal.ts";

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
		const problems = [...askOptionProblems(input.options ?? []), ...askLabelProblems(input.options ?? [])];
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
		"after seeing his words. He never sees the commitment: your reply to his answer is all he reads of it. His answer arrives with `confidence` " +
		"when he marked one: guessing or confident, his own one-tap read of it; none means he left it unmarked. " +
		(nodeId
			? "Set `nodeId` (required) to the plan node this question is about — validated at call time against the session's plan map; " +
				"before the plan exists, the id your plan_init will give that step. "
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
			const tree = ctx.chatStore.getChat(ctx.chatId)?.tree ?? null;
			const nodeIdProblemText = nodeIdProblem(tree, input.nodeId);
			if (nodeIdProblemText) problems.push(nodeIdProblemText);
			if (problems.length > 0) return invalidInputResult("explain", problems);
			// The lesson's first question may come before its plan (round 20, M1).
			return tree ? questionResult() : questionBeforePlanResult(input.nodeId);
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

/** The prober's `explain`: the lesson's first step's question, posed with
 *  the step in the reply that concludes the probe, so he works on it while
 *  the teacher plans (round 21, carry-in (a); round 20 had the teacher pose
 *  it, after the assessment had streamed: 34 to 65 s after his answer).
 *  Its `nodeId` is the id the plan will give that step: the teacher's first
 *  plan keeps it (`planLeavesOutAsked`). */
const stepQuestionTool: AgentTool<typeof explainInputObject> = {
	name: "explain",
	label: "explain",
	description:
		"Pose the lesson's first step's question, in the reply that concludes the probe: after you send him the step, before course_save and probe_done. " +
		"Never a probe question: those are `recall`. " +
		explainDescription("explain", false).replace(/ONE question per turn:.*$/, "") +
		"Set `nodeId` (required) to the id the lesson's plan gives this step: lowercase words joined by hyphens, as \"row-ops-as-products\". " +
		"His answer reaches the teacher, which plans the lesson meanwhile with this step first and that id.",
	parameters: explainInputObject,
	prepareArguments: prepareQuestionArguments,
	executionMode: "sequential",
	execute: async (_toolCallId, input) => {
		const problems = [...explainInputProblems(input)];
		const nodeIdProblemText = nodeIdProblem(null, input.nodeId);
		if (nodeIdProblemText) problems.push(nodeIdProblemText);
		if (problems.length > 0) return invalidInputResult("explain", problems);
		return stepQuestionResult(input.nodeId);
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
	/** The session saves to a course record, whose goal every lesson in it
	 *  serves: the probe asks no goal question. */
	course?: boolean;
	/** Take the session out of its course as it hands off to setting up
	 *  something new: present = the `setup` handoff is registered. */
	leaveCourse?: () => void;
}

/** In a course, a lesson's goal is the topic it is on, for the course's own
 *  goal, however he named the topic (round 16, m11: a Poisson lesson asked
 *  for in a Binomial review's chat got "What do you want from Poisson?
 *  Select all that apply", whose three overlapping picks changed nothing). */
const COURSE_GOAL_SET =
	"A lesson in a course already has its goal: the topic it is on, for the course's own goal, whether the session opened on it or his words named it. Ask him nothing about it; start bracketing with `recall`.";

/** The prober's ask in a course session: the goal question is refused. */
const courseAskTool: AgentTool<typeof askInputSchema> = {
	...askUserQuestionTool,
	execute: async () => invalidInputResult("ask_user_question", [COURSE_GOAL_SET]),
};

/** The prober's tool set: recall (no nodeId) + ask + the learner-fs
 *  set + probe_done + the two phase-omnipresent job dispatch tools. Every
 *  tool is always on (owner, 2026-11-14): nothing switches one off. */
export function createProberTools(ctx: ProberToolContext): Record<string, AgentTool<any>> {
	const done = probeDoneTool(ctx);
	// The job tools build over the SAME context/gates as the teacher's
	// (one builder, one gating semantic); the prober carries a SUBSET:
	const jobs = jobTools({
		chatId: ctx.chatId,
		jobStore: ctx.jobStore,
		spawn: ctx.spawn,
	});
	// healToolRecord (owner, 2026-10-09 — the whitehead generalization):
	// the standard argument heal over the WHOLE registry — every tool,
	// not just the one the latest wobble incident landed on.
	return withPracticeHandoff(healToolRecord({
		ask_user_question: ctx.course ? courseAskTool : askUserQuestionTool,
		// Job dispatch in the probe phase (owner ruling, 2026-09-20):
		// research + pdf are available in every phase — the prober can
		// verify facts or read learner PDFs while assessing. demo/visual
		// stay teach-phase-only (they need the lesson's plan context).
		...(jobs.research ? { research: jobs.research } : {}),
		pdf: jobs.pdf!,
		recall: probeExplainTool,
		// The lesson's first step's question, in the reply that ends the probe.
		explain: stepQuestionTool,
		...done,
		// The opening names the session in its first reply (name-session.ts).
		...nameSessionTool(ctx),
	}), { ...ctx, ...(ctx.leaveCourse ? { leave: ctx.leaveCourse } : {}) }); // the prober routes the opening: a request to practise, or to set up something new, hands off
}

// ─── the teacher's question tool (explain carries the position field) ────────

/** The nodeId-against-live-tree check the teacher's explain chains after
 *  the commitment check. Before the session's first plan, the id is the
 *  one the plan will give the step this question is about (round 20, M1:
 *  the lesson's first question comes while the plan is made). */
function nodeIdProblem(tree: PlanTree | null, nodeId: string): string | null {
	if (!tree) return SLUG_RE.test(nodeId) ? null : `nodeId "${nodeId}" is not a step id: lowercase words (a-z, 0-9) joined by hyphens or underscores, the id your plan_init will give this step.`;
	const known = tree.nodes.map((n) => n.id);
	if (!known.includes(nodeId)) {
		return `nodeId "${nodeId}" matches no node in this session's plan map. Copy one of your plan_init slugs exactly (${known.slice(0, 5).join(", ")}${known.length > 5 ? ", …" : ""}).`;
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
	/** Queue a handoff's wake: present = the `practice` handoff is
	 *  registered (the composition root always passes it). */
	deliver?: (steer: SteerMessage) => void;
}

/**
 * Per-request teacher tool registry: teach questions (validated nodeId) +
 * plan tools + job tools, all closing over the ctx. Every tool is always
 * on (owner, 2026-11-14): nothing switches one off.
 */
export function createTeacherTools(ctx: TeacherToolContext): Record<string, AgentTool<any>> {
	// healToolRecord — same standard as the prober's registry (above).
	const tools = healToolRecord({
		ask_user_question: askUserQuestionTool,
		...planTools(ctx),
		...jobTools({ chatId: ctx.chatId, jobStore: ctx.jobStore, spawn: ctx.spawn }),
		explain: teachExplainToolFor(ctx),
	});
	return ctx.deliver ? withPracticeHandoff(tools, { chatId: ctx.chatId, chatStore: ctx.chatStore, deliver: ctx.deliver }) : tools;
}
