import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { invalidInputResult, questionResult } from "./tool-execute.ts";
import type { Api, Model, Usage } from "@earendil-works/pi-ai";
import { SdkAgent } from "./sdk/agent.ts";
import type { SdkEngine } from "./sdk/engine.ts";
import type { SessionStore } from "./sdk/session-files.ts";
import type { ChatSession } from "../core/sdk-session.ts";
import { courseRecordPrompt, sourcePromptTexts } from "./prompt-segments.ts";
import { courseTools, type CourseToolContext } from "./tools/course.ts";
import {
	askUserQuestionTool,
	createProberTools,
	createTeacherTools,
	type ProbeDoneContext,
	type ProberToolContext,
	type TeacherToolContext,
} from "./tools.ts";
import { practiceTools, type PracticeToolContext } from "./tools/practice.ts";
import { healToolRecord, withArgumentHeal } from "./tools/heal.ts";
import { sendToUserTool } from "./tools/send-to-user.ts";
import { createReadTool, readTool } from "./tools/read.ts";
import { createFindTool, findTool } from "./tools/find.ts";
import { createGrepTool, grepTool } from "./tools/grep.ts";
import { createLsTool, lsTool } from "./tools/ls.ts";
import { explainInputObject, explainInputProblems } from "../core/question-core.ts";
import { QUESTION_TOOLS } from "../core/pending.ts";
import { MODE_HANDOFF_TOOLS, PRACTICE_PROBLEM_TOOL, SEND_TO_USER_TOOL, type LhMessage } from "../core/native-messages.ts";
import { VoiceGuard } from "./voice-guard.ts";

/**
 * The two teaching-side agents (docs/probe-teach-split.md): the PROBER and
 * the TEACHER. Same transcript, different prompts and tool sets; the
 * chat-handler constructs ONE per request off the transcript's seam
 * (probe_done = teacher). Each turn builds one from the record and the
 * record's map to the lesson's Claude Code session (sdk/agent.ts): the
 * record is what every page reads, the session is the model's memory.
 *
 * Engines are injectable so tests can pass a scripted fake of the Agent SDK
 * and drive deterministic lessons (see tests/chat-flow.test.ts).
 *
 * System prompts are COMPOSED per agent: system-prompt.md (the shared base:
 * agent, voice, philosophy, accuracy) + every numeric-prefix fragment in
 * that agent's directory (src/agent/prompts/prober/ or
 * src/agent/prompts/teacher/), in sorted filename order, then the shared/
 * fragments as a trailing appendix (question tools, learner files,
 * formatting) — the 2026-09-27 reorder: the agent's job and method lead,
 * the mechanics trail. Joined with `---` separators.
 *
 * ONLY numeric-prefix files load — the loader enforces the convention, so
 * non-fragment documentation (README.md, …) can live in the directories
 * without ever leaking into the model's prompt.
 */

/** Which agent's prompt directory to compose. Practice (2026-10-04)
 *  composes ONLY its own directory — see prompt-segments.ts. */
export type AgentKind = "prober" | "teacher" | "practice";

/** Exported for tests: assert what composes into the model's prompt.
 *  Composition order: shared base → the agent's own fragments → shared/
 *  fragments (src/agent/prompt-segments.ts owns the discovery rule). */
export function composeInstructions(kind: AgentKind): string {
	return sourcePromptTexts(kind)
		.map((t) => t.trim())
		.filter(Boolean)
		.join("\n\n---\n\n");
}

// The composition, cached per kind (module-load once).
const composedInstructions: Record<AgentKind, string> = {
	prober: composeInstructions("prober"),
	teacher: composeInstructions("teacher"),
	practice: composeInstructions("practice"),
};

// Money channel (wave 4): the chat-handler passes a per-turn collector;
// every model call's usage lands in the chat record's turns log
// (ChatStore.appendTurnUsage). The narrow param keeps the seam honest.
export type StepUsageCollector = (usage: Usage) => void;

/** Per-request construction options (the handler wires all of these). */
export interface AgentBuildOptions {
	/** The Agent SDK engine: tests inject a scripted fake. */
	engine?: SdkEngine;
	/** The record the turn runs on. */
	messages?: AgentMessage[];
	/** Money channel: one call per model request. */
	onUsage?: StepUsageCollector;
	/** Tests may pass a bare tool registry to drive deterministic flows. */
	tools?: Record<string, AgentTool<any>>;
	/** The record's map to the lesson's Claude Code session. */
	session?: ChatSession;
	/** Where the app keeps its copy of that session. */
	sessionStore?: SessionStore;
	/** The session's course link: present = the course-record tools join
	 *  the registry and the course doctrine joins the prompt, for every
	 *  agent kind. Absent = no course (nothing changes). */
	course?: CourseToolContext;
}

/**
 * The turn's question-stop rule: a question tool call (explain / recall /
 * ask_user_question) that resolved cleanly ends the turn, and the learner's
 * answer arrives with the next input. A call that failed authoring
 * validation does not: the model retries within the same turn. Practice's
 * problem pose and the mode handoffs have the same wait-for-the-answer
 * contract, mixed batches included (sdk/agent.ts holds a clean pose until
 * every pose of its reply resolved cleanly).
 */
function endsTurnFor(kind: AgentKind): (toolName: string) => boolean {
	return (name) =>
		(QUESTION_TOOLS as readonly string[]).includes(name) ||
		(kind === "practice" && name === PRACTICE_PROBLEM_TOOL) ||
		MODE_HANDOFF_TOOLS[name] !== undefined;
}

const SEARCH_TOOLS: Record<string, { shared: AgentTool<any>; create: (courseDir: string) => AgentTool<any> }> = {
	find: { shared: findTool, create: createFindTool },
	grep: { shared: grepTool, create: createGrepTool },
	ls: { shared: lsTool, create: createLsTool },
};

/** The shared file tools, bound to this agent: `read` to its model, so
 *  images fit its limits, and in a course session the searches to the course
 *  folder, so a search with no path stays out of the rest of the learner's
 *  home. A tool that is not the shared one is left as it is. */
function sessionTool(tool: AgentTool<any, any>, model: Model<Api>, courseDir: string | undefined): AgentTool<any, any> {
	if (tool.name === "read" && tool.execute === readTool.execute) {
		return { ...tool, execute: createReadTool(model).execute as AgentTool<any>["execute"] };
	}
	const search = SEARCH_TOOLS[tool.name];
	if (!courseDir || !search || tool.execute !== search.shared.execute) return tool;
	return withArgumentHeal(search.create(courseDir));
}

function baseAgentOptions(kind: AgentKind, opts: AgentBuildOptions, tools: AgentTool<any, any>[]) {
	if (!opts.engine) throw new Error(`no engine injected for the ${kind}`);
	const engine = opts.engine;
	const composed = composedInstructions[kind]!;
	const systemPrompt = opts.course ? `${composed}\n\n---\n\n${courseRecordPrompt(kind, { arcs: opts.course.arcs })}` : composed;
	// Every message and question of the turn is read against the voice
	// before he sees it, and one that breaks it is rewritten.
	const voice = new VoiceGuard((opts.messages ?? []) as LhMessage[]);
	const spoken = (tool: AgentTool<any, any>) => (tool.name === SEND_TO_USER_TOOL || (QUESTION_TOOLS as readonly string[]).includes(tool.name) ? voice.wrap(tool) : tool);
	return new SdkAgent({
		engine,
		systemPrompt,
		// Conditional registry inclusion: when a tool's gate is closed, neither
		// the tool nor its usage instructions reach the model. The shared file
		// tools are bound to this agent (sessionTool), in every registry
		// including explicit ones; explicit registries opt out of send_to_user.
		tools: [
			...tools.map((tool) => sessionTool(tool, engine.model, opts.course?.course.workspace)),
			...(opts.course ? Object.values(courseTools(opts.course)) : []),
			...(opts.tools === undefined ? [withArgumentHeal(sendToUserTool)] : []),
		].map(spoken),
		screen: (call) => voice.screen(call),
		messages: opts.messages ?? [],
		endsTurn: endsTurnFor(kind),
		session: opts.session,
		sessionStore: opts.sessionStore,
		onUsage: opts.onUsage,
	});
}

/**
 * The PROBER (agent A): recall (no nodeId) + ask + probe_done, lean on
 * probing doctrine. Its whole job is bracketing the learner's edge and
 * concluding with the assessment (probe_done) — which also queues the
 * handoff wake (see tools/probe.ts) and is the transcript seam the
 * handler keys teacher construction on.
 */
export function createProberAgent(ctx: ProberToolContext, opts: AgentBuildOptions = {}) {
	return baseAgentOptions("prober", opts, Object.values(createProberTools(ctx)));
}

/**
 * The TEACHER (agent B): enters at planning (the probe is already
 * concluded — its assessment is in the transcript), owns plan_init and the
 * full toolset (teach questions with validated nodeId, the map, research,
 * demos).
 */
export function createTeacherAgent(
	// Optional so tests can construct a bare mock-driven agent (no storage
	// wiring): without ctx the tools fall back to the validation-free
	// question set. The handler ALWAYS passes ctx (the composition root).
	ctx?: TeacherToolContext,
	opts: AgentBuildOptions = {},
) {
	const tools = opts.tools ?? (ctx ? createTeacherTools({ ...ctx, ...(opts.course ? { course: opts.course } : {}) }) : bareQuestionTools());
	return baseAgentOptions("teacher", opts, Object.values(tools));
}

/** The bare teach question set (tests, bare agents): explain with the
 *  commitment check (explainInputProblems, run in execute — returns an
 *  invalidInputResult isError result the model retries on, pi 1.0
 *  convention) but NO per-session nodeId check (no record to read),
 *  plus ask. */
export function bareQuestionTools(): Record<string, AgentTool<any>> {
	// A typed const (not an inline literal): the specific AgentTool typing
	// gives execute its precise Static input; heterogeneous records take
	// AgentTool<any>, whose loose Static would smudge it to unknown.
	const explain: AgentTool<typeof explainInputObject> = {
		name: "explain",
		label: "explain",
		description: "Ask the learner a graded free-response question.",
		parameters: explainInputObject,
		executionMode: "sequential",
		execute: async (_toolCallId, input) => {
			const problems = explainInputProblems(input);
			if (problems.length > 0) return invalidInputResult("explain", problems);
			return questionResult();
		},
	};
	return healToolRecord({
		explain,
		ask_user_question: askUserQuestionTool,
	});
}

/**
 * The PRACTITIONER (practice sessions, owner design 2026-10-04): built
 * from turn 1 of a kind:"practice" session — no prober→teacher split,
 * no plan tools, no question tools. Its ENTIRE registry is
 * problem + conclude (tools/practice.ts); the doctrine prompt
 * (prompts/practice/) carries the method. A successful problem pose ends
 * the run, natively for a problem-only batch and via the shared stop hook
 * for a mixed batch (for example, send_to_user + problem).
 */
export function createPracticeAgent(ctx: PracticeToolContext, opts: AgentBuildOptions = {}) {
	const tools = opts.tools ?? practiceTools(ctx, opts.course);
	return baseAgentOptions("practice", opts, Object.values(tools));
}

export type ProberAgent = ReturnType<typeof createProberAgent>;
export type TeacherAgent = ReturnType<typeof createTeacherAgent>;
export type PracticeAgent = ReturnType<typeof createPracticeAgent>;
export type TeachingAgent = ProberAgent | TeacherAgent | PracticeAgent;

