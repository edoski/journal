import type { Usage } from "@earendil-works/pi-ai";
import { COURSE_DELETED, courseDeleted } from "./courses.ts";
import {
	createPracticeAgent,
	createProberAgent,
	createSetupAgent,
	createTeacherAgent,
	type AgentBuildOptions,
	type AgentKind,
	type TeachingAgent,
} from "../agent/teacher-agent.ts";
import { claudeEngine, type SdkEngine } from "../agent/models.ts";
import { connectionBackgroundAllowed } from "../agent/subscription-connections.ts";
import { CLAUDE_MODEL_MISSING, claudeTurnError } from "../agent/claude-errors.ts";
import { createJobRunner } from "../agent/subagents/runner.ts";
import { createLessonDigest } from "../agent/subagents/lesson-digest.ts";
import { onLessonEvents, resumeCutDigests } from "./lesson-finish.ts";
import { onSessionNaming } from "./session-naming.ts";
import {
	deliverJobResult,
	noteSteersDurable,
	reconcileUserSteers,
	registerLiveAgent,
	setJobRespawn,
	setTurnRunner,
	settleSteers,
	steerLiveChat,
	unregisterLiveAgent,
} from "./jobs.ts";
import { runPiTurn } from "./pi/ui-stream.ts";
import { effectiveSettings, stores } from "./stores.ts";
import { courseBriefMarker, fetchCourseArcs, fetchCourseBrief, keptCourseMaps } from "./course-brief.ts";
import { providerConnected as providerKeyPresent } from "./model-catalog.ts";
import { providerKeyMissing as providerKeyMissingEnvelope } from "../core/settings.ts";
import { beginTurn, endTurn, isTurnRunning } from "./turn-liveness.ts";
import { applyParkedDismissal } from "./dismissal-park.ts";
import { forgetStop, registerTurn, rememberTurnFailure, stopTurn, unregisterTurn } from "./turn-runs.ts";
import { askPrestart, claimPrestart, prestart } from "./prestart.ts";
import { persistTurn, TurnPersistenceError } from "./turn-service.ts";
import { continuedTask } from "./task-passage.ts";
import { activeProblemOf, answeredQuestionsOf, danglingQuestionOf, hasUnresolvedQuestion, HIS_MESSAGE, recordedBySaves, respondingAgentOf, sessionModeOf, withCloseReceipt, withProbeFeedback, type LhMessage } from "../core/native-messages.ts";
import { sessionSavesOf } from "../core/close-receipt.ts";
import { closeReceiptFor } from "../agent/tools/course.ts";
import { createLearning, startSurvey, studyPlaces } from "./setup.ts";
import { halfAnswerLeft } from "../core/session-end.ts";
import { remarkableOf } from "../core/answer-marks.ts";
import { lessonTopicsOf, reviewRecord } from "../core/session-opening.ts";
import { compactionInstructions, planTreeToText } from "../core/compaction.ts";
import { PATHS } from "../../config.ts";
import { nextChatSession } from "../core/sdk-session.ts";
import type { SessionStore } from "../agent/sdk/session-files.ts";
import { refreshClaudeConnections } from "../agent/claude-connection.ts";
import { emit, subscribe } from "../core/events.ts";
import { settledTurnResponse } from "./turn-runs.ts";
import { continuationOwed, stoppedReplyIds } from "../core/turn-cut.ts";
import { asAgentMessages } from "../core/native-messages.ts";
import {
	ChatInputError,
	inputAppends,
	parseChatInput,
	questionRecoveryAppends,
	retryDrops,
	type TurnInput,
} from "../core/input-events.ts";
import { steerDelivered } from "../core/contracts.ts";
import { listenForCourseMaps } from "./course-map.ts";
import { listenForLessonOpenings } from "./work-finished.ts";
import { preparePhotos } from "./photos.ts";
import type {CallUsage} from "../core/contracts.ts";

/**
 * One chat turn over the server-owned native record. Framework-free (plain
 * Request/Response) so tests can drive it directly with a scripted faux
 * engine — the Next route handler in app/api/chat is a one-line wrapper.
 *
 * THE INPUT-EVENTS CONTRACT (Wave B, owner ruling 2026-09-26): POST /api/chat
 * carries {chatId, input} — one explicit event (text / answer / verdict /
 * continue), never a client transcript. The server owns the record; this
 * module is the TURN COMPOSITION ROOT: it turns the event into native
 * record appends (core/input-events.ts), builds the agent from the record
 * (the record IS the agent state — state.messages = record.messages,
 * continue()), and runs the turn as a background object (pi/ui-stream.ts).
 * Wake-pipeline steers ride the same composition (TurnInput's steer kind).
 *
 * THE SAME COMPOSITION serves both entry points: client requests and the
 * wake pipeline's server-side steers (src/server/jobs.ts) — one code path
 * for write-ahead persistence, turn liveness, and the turn services.
 */

function settlementErrorText(error: unknown): string {
	return error instanceof TurnPersistenceError ? error.message : "An error occurred.";
}

const jobRunner = createJobRunner({
	chatStore: stores.chatStore,
	jobStore: stores.jobStore,
	deliver: deliverJobResult,
	// Read FRESH per job, so an account switch between dispatch and spawn lands.
	engineFor: agentEngine,
	// The runner asks THIS check about the engine's account (the agent layer
	// may not read the connection state); a signed-out account refuses the
	// spawn with the 503-envelope family instead of dying mid-run.
	providerKeyMissing: (provider) =>
		providerKeyPresent(provider) ? null : providerKeyMissingEnvelope(provider),
});
/** The lesson digest: a finished lesson's gaps, notes and task step, saved
 *  to the course record, on the app's one model (agentEngine). */
const lessonDigest = createLessonDigest({
	chatStore: stores.chatStore,
	courseRecords: stores.courseRecords,
	engineFor: () => {
		try {
			return agentEngine();
		} catch {
			return undefined;
		}
	},
	backgroundAllowed: connectionBackgroundAllowed,
});

const lessonFinishDeps = {
	chatStore: stores.chatStore,
	digest: lessonDigest,
};

interface LhLessonFinishGlobal {
	__lhLessonFinish?: () => void;
	__lhSessionNaming?: () => void;
}

// One subscriber per process: Next dev compiles this module once per route
// entry, so each load replaces the last one's subscription. Skipped under
// tests: scripted chats are fixtures.
if (process.env.NODE_ENV !== "test") {
	const g = globalThis as typeof globalThis & LhLessonFinishGlobal;
	g.__lhLessonFinish?.();
	g.__lhLessonFinish = onLessonEvents(lessonFinishDeps);
	g.__lhSessionNaming?.();
	g.__lhSessionNaming = onSessionNaming({ chatStore: stores.chatStore, courseRecords: stores.courseRecords });
}

/** At app start: finish every lesson digest a quit cut short. */
export function resumeLessonDigests(): void {
	resumeCutDigests(lessonFinishDeps);
}

// Wake-pipeline wiring (contracts.ts "THE ASYNC PROTOCOL" §4): the pipeline
// delivers its steers through THIS composition root (one event: the steer
// marker, appended natively under the turn claim), and crash recovery
// re-spawns orphaned sub-agent loops through THIS runner.
setTurnRunner(async (chatId, input) => {
	const res = await handleChatInput(chatId, input);
	// Drive the stream to completion server-side — nobody else will read it,
	// and onFinish (persist, endTurn) only runs when it drains.
	await res.arrayBuffer().catch(() => undefined);
	return res.status;
});
/** The engine every background agent runs, whatever its role (owner,
 *  2026-11-14): CLAUDE_MODEL at its fixed thinking level on the settings'
 *  Claude account, read FRESH so an account switch lands on the next call.
 *  The conversation builds the same engine on the account its gate read. */
export function agentEngine(): SdkEngine {
	return claudeEngine(effectiveSettings().claude.account);
}

/** Where the app keeps its copy of a lesson's Claude Code session: beside the record. */
function sessionStoreFor(chatId: string): SessionStore {
	return { dir: PATHS.chats, chatId };
}

setJobRespawn((jobId) => void jobRunner.runJob(jobId));
// A lesson's save that registers material extends the course's map.
listenForCourseMaps();
// A new lesson's opening turn settling is work he waited on (work-finished.ts).
listenForLessonOpenings(stores.chatStore);

/** Keeps a save's links with the lesson the moment the engine took it, then
 *  announces them (`record-changed`), so the window reads the marks again
 *  with the links in place. The engine's write announces the course
 *  (`course-changed`) before the links are kept, and a marks read then
 *  finds no link for the answer, the receipt reaching the transcript only
 *  when the turn ends (round 20, M4: a mark showed 3 s after the next
 *  question, or only after a reload). An answer in words is keyed by his
 *  newest message (`HIS_MESSAGE`). */
export function keepAnswerSaves(chatId: string, saidId: string | null, links: readonly { question: string; observation: string }[]): void {
	const keyed: Record<string, string[]> = {};
	for (const { question, observation } of links) {
		const key = question === HIS_MESSAGE ? saidId : question;
		if (key) keyed[key] = [...(keyed[key] ?? []), observation];
	}
	if (Object.keys(keyed).length === 0) return;
	try {
		stores.chatStore.saveAnswerSaves(chatId, keyed);
	} catch {
		// The lesson was deleted mid-turn: nothing to keep the links with.
		return;
	}
	emit("record-changed", { chatId });
}

/** The route-facing entry: parse {chatId, input} and run one turn. */
export async function handleChatRequest(
	req: Request,
	buildAgent?: (opts: AgentBuildOptions & { teaching: boolean; agent: AgentKind }) => TeachingAgent,
): Promise<Response> {
	let body: { chatId?: unknown; input?: unknown };
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const chatId = typeof body.chatId === "string" ? body.chatId : "";
	if (!chatId) return Response.json({ error: "Unknown chat" }, { status: 404 });
	let input: TurnInput;
	try {
		input = await preparePhotos(parseChatInput(body.input));
	} catch (err) {
		if (err instanceof ChatInputError) {
			return Response.json({ error: err.message }, { status: 400 });
		}
		throw err;
	}
	return handleChatInput(chatId, input, buildAgent);
}

/** Stops the chat's running turn and resolves once it has settled (its
 *  partial saved). Event-driven: each pass waits for the turn-settled. */
async function stopRunningTurn(chatId: string): Promise<void> {
	while (isTurnRunning(chatId)) {
		const settled = new Promise<void>((resolve) => {
			const off = subscribe((event) => {
				if (event.type !== "turn-settled" || event.chatId !== chatId) return;
				off();
				resolve();
			});
		});
		stopTurn(chatId);
		await settled;
	}
	forgetStop(chatId);
}

/** The factory tests inject for the turn's agent (handleChatInput's seam). */
export type TurnAgentFactory = (opts: AgentBuildOptions & { teaching: boolean; agent: AgentKind }) => TeachingAgent;

type ChatRecord = NonNullable<ReturnType<typeof stores.chatStore.getChat>>;

/**
 * The turn's agent, off the record, as every turn builds it, and as the
 * prestart builds the one his answer will start (prestart.ts): the
 * transcript's seam picks the prober, the teacher or practice; the
 * lesson's course adds its tools and doctrine.
 */
function turnAgent(
	chatId: string,
	record: ChatRecord,
	agentMessages: LhMessage[],
	merged: LhMessage[],
	engine: SdkEngine,
	courseArcs: Awaited<ReturnType<typeof fetchCourseArcs>>,
	{ onUsage, claim, buildAgent, places }: { onUsage?: (usage: Usage) => void; claim?: AgentBuildOptions["claim"]; buildAgent?: TurnAgentFactory; places?: readonly string[] } = {},
): TeachingAgent {
	// AGENT CONSTRUCTION BRANCH (docs/probe-teach-split.md §2): the transcript
	// is the seam. Its mode picks practice or teaching; in teaching a
	// concluded probe_done means the TEACHER (planning + the full toolset),
	// else the PROBER (quiz/ask + probe_done). All three share this whole
	// composition (write-ahead persist, liveness, steers, usage) — only the
	// agent differs.
	const agentKind = respondingAgentOf(agentMessages, record.kind);
	const teaching = agentKind === "teacher";
	// Tests inject a factory: the agent is stateless per turn, so each
	// request builds a fresh one off the record — the factory mirrors that
	// seam exactly. Wave B: the record IS the agent state (native messages;
	// the record's id field strips at the wire in toLlmMessages).
	// His newest message: the one an answer in words names (HIS_MESSAGE).
	const lastSaidId = merged.findLast((m) => m.role === "user")?.id ?? null;
	const keepSaves = (links: { question: string; observation: string }[]) => keepAnswerSaves(chatId, lastSaidId, links);
	// Home rereads the session list on record-changed, so a start the save
	// moved stays on it while the turn still runs (round 18, M4).
	const keepMoved = (topics: string[]) => {
		try {
			stores.chatStore.saveStartsMoved(chatId, topics);
			emit("record-changed", { chatId });
		} catch {
			// The lesson was deleted mid-turn: nothing to keep them with.
		}
	};
	const agentOpts: AgentBuildOptions = {
		engine,
		messages: asAgentMessages(agentMessages),
		onUsage,
		claim,
		// The lesson's Claude Code session: the model's memory of it.
		session: record.session,
		sessionStore: sessionStoreFor(chatId),
		// What Claude Code's summary keeps when it compacts the session,
		// with the plan tree as it stands then.
		compactionInstructions: (messages) => compactionInstructions(agentKind === "practice" ? "practice" : agentKind === "teacher" ? "teach" : "probe", planTreeToText(stores.chatStore.getChat(chatId)?.tree ?? record.tree, messages)),
		// A course-linked session reads and writes the learner's course
		// record through the engine, whatever the agent kind, with the
		// answers a save may name (answeredQuestionsOf), read from the
		// whole record.
		// The save links kept with the lesson count as saved, and each new
		// save's links are kept the moment the engine takes it, so a restart
		// before the transcript's write loses neither the mark nor the
		// "already saved" (round 8).
		...(agentKind === "setup" ? { setup: { places: places ?? [] } } : {}),
		...(record.course ? { course: { course: record.course, records: stores.courseRecords, arcs: courseArcs, answers: recordedBySaves(answeredQuestionsOf(merged), stores.chatStore.getChat(chatId)?.answerSaves, lastSaidId), remarkable: remarkableOf(merged), onSaved: keepSaves, onMoved: keepMoved, review: reviewRecord(record), reviewTopics: record.topics ?? [], lessonTopics: () => lessonTopicsOf(stores.chatStore.getChat(chatId) ?? record), planSteps: () => stores.chatStore.getChat(chatId)?.tree?.nodes ?? [], halfAnswer: () => halfAnswerLeft(stores.chatStore.getChat(chatId)?.messages ?? merged), sessionSaves: () => sessionSavesOf(stores.chatStore.getChat(chatId)?.messages ?? merged), courses: keptCourseMaps } } : {}),
	};
	// PRACTICE BRANCH (owner design, 2026-10-04): practice mode builds the
	// practitioner — no plan/question tools; problem + conclude, and the
	// handoff back to teaching. buildAgent stays honored (the test seam is
	// uniform across agents).
	return buildAgent
		? buildAgent({ ...agentOpts, teaching, agent: agentKind })
		: agentKind === "setup"
			? createSetupAgent(
					{
						chatId,
						chatStore: stores.chatStore,
						deliver: (steer) => void deliverJobResult(steer),
						survey: (paths) => startSurvey(chatId, paths),
						create: (input) => createLearning(chatId, input),
						jobs: { chatId, jobStore: stores.jobStore, spawn: (job, input) => void jobRunner.runJob(job.id, input) },
					},
					agentOpts,
				)
		: agentKind === "practice"
			? createPracticeAgent(
					{
						chatId,
						chatStore: stores.chatStore,
						// THE RARELY-NEEDED SET (owner round 10): research + pdf jobs
						// (same runner/gating as the teacher's — research honestly
						// absent when no engine is live).
						jobs: {
							chatId,
							jobStore: stores.jobStore,
							spawn: (job, input) => void jobRunner.runJob(job.id, input),
						},
						deliver: (steer) => void deliverJobResult(steer),
					},
					agentOpts,
				)
			: teaching
			? createTeacherAgent(
					{
						chatId,
						chatStore: stores.chatStore,
						jobStore: stores.jobStore,
						spawn: (job, input) => void jobRunner.runJob(job.id, input),
						deliver: (steer) => void deliverJobResult(steer),
					},
					agentOpts,
				)
			: createProberAgent(
					{
						chatId,
						chatStore: stores.chatStore,
						deliver: (steer) => void deliverJobResult(steer),
						// Fix wave (2026-09-20): the prober carries research + pdf
						// dispatch (owner ruling — phase-omnipresent), so its ctx
						// needs the same job wiring as the teacher's.
						jobStore: stores.jobStore,
						spawn: (job, input) => void jobRunner.runJob(job.id, input),
						// His opening asks to set up something new: the session leaves this course.
						leaveCourse: () => {
							stores.chatStore.leaveCourse(chatId);
							emit("record-changed", { chatId });
						},
					},
					agentOpts,
				);
}

/** A lesson waits on his answer: a question he has not answered, or a
 *  practice problem he has not handed in. */
const waitsOnAnswer = (messages: readonly LhMessage[]) => danglingQuestionOf(messages) !== null || activeProblemOf(messages) !== null;

/**
 * Starts the Claude Code process of the turn his answer will start, while
 * he thinks (prestart.ts): for a lesson that waits on his answer, with no
 * turn running, on a signed-in account. The turn takes it only if it has
 * every option the turn starts one with.
 */
export async function prestartAnswerTurn(chatId: string, buildAgent?: TurnAgentFactory): Promise<void> {
	const latest = askPrestart(chatId);
	const waits = (id: string) => {
		const record = stores.chatStore.getChat(id);
		return record && !isTurnRunning(id) && !courseDeleted(id) && waitsOnAnswer(record.messages) ? record : undefined;
	};
	if (!waits(chatId)) return;
	const account = effectiveSettings().claude.account;
	await refreshClaudeConnections();
	if (!providerKeyPresent(account)) return;
	let engine: SdkEngine;
	try { engine = claudeEngine(account); } catch { return; }
	const asked = waits(chatId);
	if (!asked) return;
	const courseArcs = await fetchCourseArcs(asked);
	const record = waits(chatId);
	if (!record || !latest()) return;
	// His answer opens the turn: an input of his after the record, as the
	// turn reads its effort.
	const messages = [...record.messages, { id: "prestart", role: "user", content: "", timestamp: Date.now() } as LhMessage];
	const places = sessionModeOf(record.messages, record.kind) === "setup" ? await studyPlaces().catch(() => []) : undefined;
	prestart(chatId, turnAgent(chatId, record, messages, messages, engine, courseArcs, { buildAgent, places }).prepare());
}

/**
 * The turn composition: one input event → native record appends → one
 * agent turn as a background object. Also the wake pipeline's entry
 * (TurnInput's steer kind appends the marker under the same claim).
 */
export async function handleChatInput(
	chatId: string,
	input: TurnInput,
	buildAgent?: TurnAgentFactory,
): Promise<Response> {
	let record = stores.chatStore.getChat(chatId);
	if (!record) {
		return Response.json({ error: "Unknown chat" }, { status: 404 });
	}
	// A lesson of a deleted course is history: no turn, so nothing can write
	// its course record back (round 3: a ghost "calculus" course appeared).
	if (courseDeleted(chatId)) {
		return Response.json({ error: COURSE_DELETED, code: "course_deleted" }, { status: 410 });
	}

	// Done for today wins over whatever the tutor is doing (round 7: pressed
	// as a practice handoff woke the teacher, it was refused and the teacher
	// went on): the running turn stops, its partial saves, then the close.
	if (input.type === "tonight") await stopRunningTurn(chatId);

	// Refuse an ineligible Retry before catalog refresh, compaction, or any
	// turn/write effects. Revalidate after the awaited gates below too.
	if (input.type === "retry") {
		try {
			retryDrops(record.messages);
		} catch (err) {
			if (err instanceof ChatInputError) return Response.json({ error: err.message }, { status: 400 });
			throw err;
		}
	}

	// A continue asks for the reply the record still owes. With two windows
	// open both ask after a restart: the one that lost the race gets here
	// once the reply came, and attaches to the record instead of running
	// the tutor a second time over an input it already answered.
	if (input.type === "continue" && !continuationOwed(record.messages)) return settledTurnResponse(chatId);

	if (input.type === "retry-question") {
		try { questionRecoveryAppends(record.messages, input); }
		catch (err) {
			if (err instanceof ChatInputError) return Response.json({ error: err.message }, { status: 400 });
			throw err;
		}
	}

	// THE CONNECTION GATE: every agent runs CLAUDE_MODEL on the settings'
	// Claude account (owner, 2026-11-14), which must be signed in, or the
	// turn dies mid-stream masked to a generic error. Placement is
	// deliberate: BEFORE beginTurn (no liveness effects) and the write-ahead
	// persist (nothing durable changes); wake-pipeline turns ride the same
	// path.
	const effective = effectiveSettings();
	const account = effective.claude.account;
	await refreshClaudeConnections();
	if (!providerKeyPresent(account)) {
		const envelope = providerKeyMissingEnvelope(account);
		console.info(`[chat ${chatId}] turn refused — ${JSON.stringify(envelope)}`);
		return Response.json(envelope, { status: 503 });
	}

	let conversationEngine: SdkEngine;
	try { conversationEngine = claudeEngine(account); }
	catch { return Response.json({ error: CLAUDE_MODEL_MISSING }, { status: 503 }); }
	// The course brief rides learner input only, fetched before the record
	// is re-read below. A question recovery is a retry: its results must stay
	// adjacent to their calls and end the record, so it carries no brief.
	const learnerInput = input.type !== "steers" && input.type !== "retry" && input.type !== "retry-question" && input.type !== "continue";
	// A mode handoff starts the other agent, whose brief differs.
	const handoffWake = input.type === "steers" && input.steers.some((s) => s.role === "custom" && s.customType === "mode-handoff");
	// Continue on a task: its title, step and the part's text from his
	// material, as the engine's map names them, drawn the moment he presses
	// (round 17, M8; round 18, M6).
	const opened = record;
	const [courseBrief, courseArcs, task, places, closeReceipt] = await Promise.all([
		learnerInput || handoffWake ? fetchCourseBrief(record) : null,
		fetchCourseArcs(record),
		input.type === "task" ? keptCourseMaps().then((maps) => continuedTask(maps.find((m) => m.workspace === opened.course?.workspace), opened.messages)) : null,
		// A setup session looks first where his study material is kept.
		sessionModeOf(record.messages, record.kind) === "setup" ? studyPlaces().catch(() => []) : undefined,
		// His Done for today closes on the session's close receipt (round 20, M3), read with what it sets aside (round 21, M3).
		input.type === "tonight" && opened.course ? Promise.resolve(opened.course.workspace).then((workspace) => closeReceiptFor(stores.courseRecords, workspace, { ...opened, messages: [...opened.messages, ...inputAppends(opened, input)] })).catch(() => null) : null,
	]);
	const freshRecord = stores.chatStore.getChat(chatId);
	if (!freshRecord) return Response.json({ error: "Unknown chat" }, { status: 404 });
	record = freshRecord;
	// Recompute Retry eligibility on current truth, still before beginTurn.
	// Another writer may have landed during awaits.
	// These omissions affect ONLY the agent context, never the saved record.
	if (input.type === "continue" && !continuationOwed(record.messages)) return settledTurnResponse(chatId);
	let retryOmissions = new Set<string>();
	// Try again after a stop: the empty stopped reply stays in the record,
	// and the tutor resumes from the input before it.
	if (input.type === "continue") retryOmissions = stoppedReplyIds(record.messages);
	if (input.type === "retry") {
		try {
			retryOmissions = retryDrops(record.messages);
		} catch (err) {
			if (err instanceof ChatInputError) return Response.json({ error: err.message }, { status: 400 });
			throw err;
		}
	}

	// His answer to a question the running turn posed before its plan waits
	// for that turn, which saves the question when it ends (round 20, M1):
	// the client posts it again once the turn settles.
	if (input.type === "answer" && isTurnRunning(chatId)) return Response.json({ error: "A turn is already running for this session" }, { status: 409 });

	// The input's native appends (pure; the honest 400 for an answer with no
	// pending question call). Computed BEFORE beginTurn so a refused input
	// leaves no liveness effects; read against the CURRENT record. Wave C:
	// the idle wake carries EVERY queued marker (steerDelivered filters a
	// re-fire of an already-landed one) - with claimSteers gone, this wake
	// input is the only steer appender; in-run delivery rides pi's own
	// follow-up queue and never builds an input event at all.
	let appends;
	try {
		appends =
			input.type === "steers"
				? input.steers.filter((s) => !steerDelivered(record.messages, s.id)).map((s) => withProbeFeedback(s, record.messages))
				: inputAppends(record, input.type === "task" ? { type: "task", task } : input).map((m) => withCloseReceipt(m, closeReceipt));
	} catch (err) {
		if (err instanceof ChatInputError) {
			return Response.json({ error: err.message }, { status: 400 });
		}
		throw err;
	}

	// THE PARALLEL-QUESTION GATE (owner, 2026-10-03 — the deepseek parallel
	// batch incident): an answer that leaves a SIBLING question dangling
	// defers its wake. The dock advances to the next question (the client's
	// optimistic result + record-changed carry the view); the LAST answer
	// fires the one reaction turn with every result ADJACENT to its calling
	// assistant message — the provider shape law (a tool result appended
	// after an intervening assistant message is rejected, which stranded
	// the sibling question permanently pre-fix). Nothing else can generate
	// while a question dangles (job wakes wait, continuation folds refuse,
	// the composer gates), so adjacency holds by construction.
	if (input.type === "answer" && hasUnresolvedQuestion([...record.messages, ...appends])) {
		const merged = [...record.messages, ...appends];
		try { stores.chatStore.saveMessages(chatId, merged); }
		catch (err) {
			console.error(`[chat ${chatId}] write-ahead persist failed:`, err);
			return new Response("Your input could not be saved. Please try again.", { status: 500 });
		}
		emit("record-changed", { chatId });
		return settledTurnResponse(); // the cheap terminal — no beginTurn, no turn
	}

	// The brief precedes the learner's words; an answer's result must stay
	// adjacent to its question call, so there the brief follows it. Done
	// for tonight may lead with withheld results: its brief sits just
	// before the marker.
	const briefMarker = courseBriefMarker(courseBrief, [...record.messages, ...appends]);
	if (briefMarker) {
		appends = input.type === "answer" ? [...appends, briefMarker]
			: input.type === "tonight" ? [...appends.slice(0, -1), briefMarker, ...appends.slice(-1)]
			: [briefMarker, ...appends];
	}

	// One turn per chat, ever. A second request while a turn runs means a
	// stale/remounted client raced a live one — letting it through would
	// double-run the teacher and clobber the first turn's persist.
	if (!beginTurn(chatId)) {
		console.info(`[chat ${chatId}] turn already in flight — request rejected`);
		return Response.json({ error: "A turn is already running for this session" }, { status: 409 });
	}

	// Write-ahead persistence: the input's native appends go on disk BEFORE
	// the turn starts - the learner's answer is durable the instant the
	// request arrives, and any remount, second tab, or server crash reads
	// truth instead of the pre-answer record. (Wave C: the wake's markers
	// ride this same write-ahead - the pump de-queued them at fire, so this
	// is the ONLY copy ever appended.)
	const merged = [...record.messages, ...appends];
	// Retry preserves every persisted attempt. Pi needs a non-assistant
	// tail to start continue(), so its temporary history omits the trailing
	// failures only. Count that SAME temporary prefix at settlement, or the
	// retained failures would make persistTurn skip genuinely new output.
	const agentMessages = retryOmissions.size > 0 ? merged.filter((m) => !retryOmissions.has(m.id)) : merged;
	const persistBaseCount = agentMessages.length;
	try {
		stores.chatStore.saveMessages(chatId, merged);
	} catch (err) {
		console.error(`[chat ${chatId}] write-ahead persist failed:`, err);
		endTurn(chatId);
		return new Response("Your input could not be saved. Please try again.", { status: 500 });
	}
	// Visibility bookkeeping is not the canonical save. Its failure must
	// neither misreport a saved input as lost nor prevent the turn running.
	try {
		noteSteersDurable(chatId, merged);
	} catch (err) {
		console.error(`[chat ${chatId}] input visibility bookkeeping failed:`, err);
	}
	// A wake's markers land in the record after turn-started, so a view that
	// attached on it would miss them until settle: announce the write.
	if (input.type === "steers" && appends.length > 0) emit("record-changed", { chatId });

	// MONEY CHANNEL (wave 4): one collector per request, fed by the agent's
	// message_end events. Every model call's usage lands in the chat record's
	// append-only turns log at onFinish — idempotent per turn id.
	const turnUsageId = crypto.randomUUID();
	const steps: CallUsage[] = [];
	const collectUsage = (usage: Usage) => {
		steps.push({
			inputTokens: usage.input,
			outputTokens: usage.output,
			cacheReadTokens: usage.cacheRead,
			cacheWriteTokens: usage.cacheWrite,
			cacheWrite1hTokens: usage.cacheWrite1h ?? 0,
			// Optional in pi's Usage — persisted as 0, never dropped.
			reasoningTokens: usage.reasoning ?? 0,
		});
	};

	// Built once above, on the account the connection gate read.
	const engine = conversationEngine;
	// Provider-qualified stamp: matches the price table's
	// provider:id keys.
	const modelId = `${engine.model.provider}:${engine.model.id}`;
	// The turn takes the process started for it while he thought, when
	// that process has every option this turn starts one with.
	const constructed = turnAgent(chatId, record, agentMessages, merged, engine, courseArcs, { onUsage: collectUsage, claim: (key) => claimPrestart(chatId, key), buildAgent, places });

	// A test-injected agent gets no usage collector (tests assert the
	// transcript, not the money channel); when it's ours, usage flows through
	// the factory's subscription (wired above via onUsage).
	try {
		// THE TURN AS A BACKGROUND OBJECT (owner ruling, 2026-09-25):
		// runPiTurn executes decoupled from this response — the POST stream
		// is just the FIRST subscriber (a view). A client disconnect can no
		// longer abort the turn; the remote kill is the abort channel, and
		// late views reattach via GET /api/chats/[id]/stream.
		// Wave C (owner correction, 2026-09-26 — steering): register the live
		// agent BEFORE runPiTurn — the loop's start steering-poll drains the
		// queue SYNCHRONOUSLY inside that call, so a later registration would
		// miss it. Registration also steers any pending registry markers into
		// this run: a marker parked behind a just-answered quiz rides THIS
		// run's first LLM call (the native replacement for continuation
		// coalescing). Settlement still cannot beat the flow below: it needs
		// a streamed response, which never happens inside the constructor.
		registerLiveAgent(chatId, constructed, input.type !== "steers" && input.type !== "continue",
			input.type === "steers" ? new Set(appends.map((message) => message.id)) : undefined);
		const handle = runPiTurn({
			agent: constructed,
			// The coalescing window seam (COMPACTION LAW, 2026-10-09): tests
			// tighten it via LH_UPDATE_FLUSH_MS; production rides the 100ms
			// default in ui-stream.
			...(process.env.LH_UPDATE_FLUSH_MS ? { updateFlushMs: Number(process.env.LH_UPDATE_FLUSH_MS) } : {}),
			// Stream-level failures are provider/transport internals — masked,
			// like the SDK defaults. Tool-input validation messages never
			// route through here: they ride the error-result path and reach the
			// transcript directly (the retry context the model saw).
			onError: (error) => {
				console.error(`[chat ${chatId}] Claude turn error:`, error);
				const text = claudeTurnError(error instanceof Error ? error.message : String(error));
				// The submitter attaches after the POST's ack, often after a
				// turn that failed at once has left the registry: keep the
				// notice for it, or the failure reaches no screen.
				rememberTurnFailure(chatId, text);
				return text;
			},
			onSettleError: settlementErrorText,
			onSettleFailure: (error, reportedErrorText) => {
				// POST only acknowledges acceptance; the submitter may attach
				// after this turn has already failed and left the registry.
				rememberTurnFailure(chatId, reportedErrorText ?? settlementErrorText(error));
				endTurn(chatId);
				unregisterTurn(chatId);
				unregisterLiveAgent(chatId);
				// The canonical save may have succeeded before later bookkeeping
				// threw. Reconcile against actual durability, never replay input
				// merely because usage or other settlement work failed.
				const persisted = stores.chatStore.getChat(chatId)?.messages ?? [];
				reconcileUserSteers(chatId, persisted);
				settleSteers(chatId, persisted, true, constructed);
			},
			onFinish: (turnMessages, isAborted) => {
				// Wave B: append only messages past the temporary agent prefix.
				// Retry's saved record still includes its earlier failed attempts.
				const stamped = persistTurn(stores.chatStore, chatId, persistBaseCount, turnMessages, isAborted);
				// The record's map to the session moves to what the turn left there.
				const sessionEnd = constructed.sessionEnd();
				if (sessionEnd) stores.chatStore.saveSession(chatId, nextChatSession(record.session, sessionEnd, stores.chatStore.getChat(chatId)?.messages ?? stamped));
				noteSteersDurable(chatId, stores.chatStore.getChat(chatId)?.messages ?? stamped);
				// usage log append (idempotent per turn id) — the stats bar
				// refolds this on the client after the turn settles. The
				// provenance message is the turn's FIRST new assistant message.
				const response = stamped.find((m) => (m as { role?: string }).role === "assistant");
				if (response && steps.length > 0) {
					stores.chatStore.appendTurnUsage(chatId, {
						id: turnUsageId,
						messageId: response.id,
						at: new Date().toISOString(),
						model: modelId,
						steps,
					});
				}
				// PARKED DISMISSAL (owner, 2026-10-04): a dismissal that arrived
				// mid-turn was parked by the dismiss route (202); now that
				// persistTurn has landed the turn's messages, apply it against
				// real truth — BEFORE endTurn, so "turn-settled" guarantees a
				// subsequent fetch reads the dismissal already in the record
				// (the same ordering law as persistTurn itself).
				applyParkedDismissal(stores.chatStore, chatId);
				// LAST: a poller that sees not-in-flight must read an already-persisted
				// record — endTurn only after persistTurn has done its job.
				endTurn(chatId);
				// And only then does the turn stop being a running object
				// (background-turn wave, 2026-09-25): a reattach that finds
				// nothing must find the persisted record current — the same
				// ordering rule as endTurn.
				unregisterTurn(chatId);
				// Wave C steer settlement: the live agent is dead (no more
				// followUp handoffs) - reconcile the steer registry against
				// what this run actually persisted (in-run injections
				// resolve; stranded markers return to pending), then let
				// the pump take any stragglers down the idle wake.
				unregisterLiveAgent(chatId);
				settleSteers(chatId, stamped, false, constructed);
				// Composer steers (2026-10-03): delivered ids dropped, stranded
				// ones stay parked for the chat's next run (the registry is the
				// stranding safety net — the agent's undrained copy died above).
				reconcileUserSteers(chatId, stamped);
			},
		});
		// The turn is now a live background object: register it so any view
		// can reattach (GET /api/chats/[id]/stream) or remotely abort it
		// (POST /api/activity/abort, kind "turn"). Registration after the
		// runPiTurn call is race-free: the agent loop only ticks in later
		// microtasks, so settle (and thus unregister) cannot beat us here.
		registerTurn(chatId, handle);
		// CONNECTION DIET B (owner, 2026-10-10 — the parallel-session freeze
		// postmortem): the POST no longer holds the turn's SSE stream open for
		// its whole duration. It acknowledges acceptance and CLOSES; the
		// submitter attaches through GET /api/chats/[id]/stream — the same
		// universal reattach wire a returning visitor uses. The browser's
		// 6-connections-per-origin pool is the scarce resource: a submission
		// must cost zero permanently-held slots beyond the one live view. The
		// turn itself is a server-side process (ruling 2026-09-25) — it never
		// needed this connection, only a view did.
		return Response.json({ ok: true });
	} catch (err) {
		// The stream never started, so no onFinish will fire — clear the registry
		// or a malformed request would lock the chat until the TTL eviction.
		endTurn(chatId);
		// Wave C: the live-agent registration (if it happened) dies with the
		// turn here too - nothing was handed (the loop never ticked).
		unregisterLiveAgent(chatId);
		console.error(`[chat ${chatId}] turn failed to start:`, err);
		return Response.json({ error: "Failed to start the turn" }, { status: 500 });
	}
}
