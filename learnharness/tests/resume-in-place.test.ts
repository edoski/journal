/**
 * Picking a lesson up where it stopped. A lesson that waits on his typed
 * answer, or whose tutor stopped mid-turn, is his to pick up: Home, the
 * topic page and the sidebar offer it, never a new lesson in its place,
 * and Continue opens it at its step. Nothing it sends restarts the probe
 * or the plan, and a double press starts one session at most.
 *
 * Drives the real chat route and turn handler under an isolated data
 * folder and the fake engine, with a scripted model.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, type TranscriptContext } from "@earendil-works/pi-ai";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-resume-in-place-"));
process.env.LH_DATA_DIR = TMP_DATA;
process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";
const WS = "/study/linalg";
useFakeEngine(TMP_DATA, [{ workspace: WS, title: "Linear Algebra" }]);

const { POST } = await import("../app/api/chats/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { handleChatInput, handleChatRequest } = await import("../src/server/chat-handler.ts");
const { deliverJobResult, setTurnRunner } = await import("../src/server/jobs.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { createPracticeAgent, createProberAgent, createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { continueMove, resumableSession, sessionState } = await import("../components/nav/session-state.ts");
const { topicAction } = await import("../components/unit-inbox/topic-page/topic-facts.ts");
const { todayRows, waitingSessions } = await import("../components/study-home/study-facts.ts");
const { buildInbox, topicSessions } = await import("../components/unit-inbox/units.ts");
const { SessionStarter } = await import("../components/start-session.ts");
const { writeSettings } = await import("../src/store/settings.ts");
writeSettings({ version: 1, models: { strong: { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } } } });

import type { AgentKind } from "../src/agent/teacher-agent.ts";
import type { PiEngine } from "../src/agent/models.ts";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { SteerMessage } from "../src/core/contracts.ts";

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));
afterEach(() => setTurnRunner(async () => 200));

// ─── the course, as the engine maps it ──────────────────────────────────────

const TODAY = "2026-11-08";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({
	handle: handle as TopicHandle,
	title,
	level: "attempted",
	introduced: "2026-11-01",
	review: { kind: "due", date: "2026-11-07", overdue: 1 },
	weak: false,
	signals: QUIET,
	tasks: ["sheet-4"],
	...over,
});
const RANK = topic("rank", "Rank and the column space");
const KERNEL = topic("kernel", "Kernel and rank-nullity");
const SHEET = { key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2 for the 3x5 matrix A" };
const MAP: CourseMap = { workspace: WS, title: "Linear Algebra", today: TODAY, revision: 1, exam: null, current: RANK.handle, focus: SHEET.key, tasks: [SHEET], topics: [RANK, KERNEL], edges: [] };
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };

// ─── a lesson stopped at part (c) ───────────────────────────────────────────

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const TREE = {
	nodes: [
		{ id: "sheet-a", title: "Part (a): row reduce A" },
		{ id: "sheet-b", title: "Part (b): rank A = 3" },
		{ id: "sheet-c", title: "Part (c): dim ker A = 2" },
	],
	edges: [{ from: "sheet-a", to: "sheet-b" }, { from: "sheet-b", to: "sheet-c" }],
	version: 1,
};
const PROSE_QUESTION = "Right: three pivots, so rank A = 3. Part (c): with 5 columns and rank 3, how many free variables does Ax = 0 have?";

let n = 0;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse" | "error" = "toolUse") =>
	({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: n }) as unknown as LhMessage;
const result = (toolCallId: string, toolName: string, details: unknown) =>
	({ id: `r${++n}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: n }) as unknown as LhMessage;
const callBlock = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });

/** Probe, plan, one step checked, the task saved at part (c), and the
 *  tutor's last turn: `last`. */
function lessonUpTo(last: LhMessage): LhMessage[] {
	return [
		newUserMessage("Problem sheet 4, the rank and nullity one."),
		assistant([callBlock("pd", "probe_done", { strands: [{ strand: "rank", assessment: "pivots with help" }], summary: "ready" })]),
		result("pd", "probe_done", { ok: true }),
		assistant([fauxText("Three parts."), callBlock("plan", "plan_init", { mermaid: "graph TD" })]),
		result("plan", "plan_init", { ok: true, tree: TREE }),
		assistant([fauxText("Say go.")], "stop"),
		newUserMessage("Go."),
		assistant([callBlock("q-b", "explain", { type: "check", nodeId: "sheet-b", question: "Why is rank A = 3?", correctAnswer: "Three pivots." })]),
		result("q-b", "explain", { kind: "explain", text: "Three pivots.", confidence: "confident" }),
		assistant([callBlock("save", "course_save", { changes: { focus: "sheet-4", tasks: { "sheet-4": { step: SHEET.step } }, observations: [{ topics: ["rank"], text: "rank from pivots", result: "correct", help: "none" }] } })]),
		result("save", "course_save", null),
		last,
	];
}

function seedLesson(last: LhMessage): string {
	const chat = chatStore.createChat("Problem sheet 4", { workspace: WS, title: "Linear Algebra" });
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	chatStore.saveTree(chat.id, TREE);
	chatStore.saveMessages(chat.id, lessonUpTo(last));
	return chat.id;
}

const listed = (): ChatListItem[] => chatStore.listChats().map((c) => ({ ...c, busy: false, compacting: false }));
const item = (id: string) => listed().find((c) => c.id === id)!;

// ─── a waiting lesson is offered as itself ──────────────────────────────────

describe("a lesson waiting on his typed answer", () => {
	it("is his turn on Home, on the topic page and in the sidebar, never a new lesson", () => {
		const id = seedLesson(assistant([fauxText(PROSE_QUESTION)], "stop"));
		const chat = item(id);
		assert.equal(sessionState(chat), "your-turn", "the tutor asked him something mid-lesson");

		const [first] = todayRows([COURSE], waitingSessions(listed()), TODAY);
		assert.equal(first?.kind, "session", "Home's Today line for the course is the lesson");
		assert.equal(first?.kind === "session" ? first.chat.id : null, id);

		for (const t of [RANK, KERNEL]) {
			const sessions = topicSessions(listed(), WS, t);
			const action = topicAction(t, MAP, sessions);
			assert.equal(action.kind, "resume", `${t.title}: the page's action resumes the lesson`);
			assert.equal("chat" in action ? action.chat.id : null, id);
			const unit = buildInbox([COURSE], listed(), WS).active.find((u) => u.topic.handle === t.handle);
			assert.equal(unit?.now, "your-turn", `${t.title}: the sidebar row says your turn`);
			assert.equal(resumableSession(unit!.sessions)?.id, id, `${t.title}: the sidebar row's action resumes it`);
		}
		chatStore.deleteChat(id);
	});

	it("is picked up when the tutor's turn was cut short, not restarted", () => {
		const id = seedLesson(assistant([fauxText("Part (c) asks")], "error"));
		const action = topicAction(KERNEL, MAP, topicSessions(listed(), WS, KERNEL));
		assert.ok("chat" in action && action.chat.id === id, "Continue opens the lesson the tutor stopped in");
		chatStore.deleteChat(id);
	});
});

// ─── Continue, end to end ───────────────────────────────────────────────────

/** One scripted model; records which agent each turn ran and what it saw. */
function scripted(reply: string) {
	const seen: { agent: AgentKind; prompt: string; tools: string[] }[] = [];
	let agent: AgentKind = "prober";
	const faux = createFauxCore({});
	faux.setResponses(
		Array.from({ length: 4 }, () => (context: TranscriptContext) => {
			const system = context.messages.find((m) => m.role === "system");
			const prompt = system && system.role === "system" ? (typeof system.content === "string" ? system.content : system.content.map((c) => c.text).join("")) : "";
			seen.push({ agent, prompt, tools: (system && system.role === "system" ? system.toolsAdded ?? [] : []).map((t) => t.name) });
			return fauxAssistantMessage([fauxText(reply)]);
		}),
	);
	const engine: PiEngine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const deliver = (steer: SteerMessage) => void deliverJobResult(steer);
	const factory: Parameters<typeof handleChatRequest>[1] = (opts) => {
		agent = opts.agent;
		const built = { ...opts, engine };
		const ctx = { chatId: opts.chatId ?? "", chatStore, jobStore, spawn: () => {}, deliver };
		if (opts.agent === "practice") return createPracticeAgent(ctx, built);
		if (opts.agent === "teacher") return createTeacherAgent(ctx, built);
		return createProberAgent(ctx, built);
	};
	setTurnRunner(async (cid, input) => {
		const ack = await handleChatInput(cid, input, factory);
		const handle = runningTurn(cid);
		if (handle) await new Response(handle.subscribe()).text();
		return ack.status;
	});
	return { seen, factory };
}

async function send(chatId: string, text: string, factory: Parameters<typeof handleChatRequest>[1]) {
	const ack = await handleChatRequest(
		new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input: { type: "text", text } }) }),
		factory,
	);
	assert.equal(ack.status, 200, await ack.clone().text());
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
}

/** What the topic page's Continue does: open the session it names, else
 *  create one through the chat route and send its opening. */
async function pressContinue(factory: Parameters<typeof handleChatRequest>[1]): Promise<string> {
	const action = topicAction(KERNEL, MAP, topicSessions(listed(), WS, KERNEL));
	if ("chat" in action) return action.chat.id;
	const res = await POST(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: action.opening, course: { workspace: WS } }) }));
	const { id } = (await res.json()) as { id: string };
	await send(id, action.opening, factory);
	return id;
}

const PROBE_OR_PLAN = new Set(["probe_done", "recall", "probe", "plan_init"]);
const ROUTING_STEP = "## 0. Practice or a lesson";

describe("Continue on a lesson stopped at part (c)", () => {
	it("opens it at its step: no new session, no new probe question, no new plan", async () => {
		const id = seedLesson(assistant([fauxText(PROSE_QUESTION)], "stop"));
		const sessions = listed().length;
		const { seen, factory } = scripted("Two free variables, so dim ker A = 5 - 3 = 2. That finishes part (c).");

		const opened = await pressContinue(factory);
		const from = opened === id ? chatStore.getChat(opened)!.messages.length : 0;

		await send(opened, "Two free variables.", factory);
		assert.deepEqual(seen.map((s) => s.agent), ["teacher"], "his answer goes to the lesson's teacher, one run");
		assert.equal(opened, id, "Continue opens the lesson that stopped");
		assert.ok(!seen[0]!.prompt.includes(ROUTING_STEP), "no prober routes it again");
		const added = chatStore.getChat(opened)!.messages.slice(from);
		const calls = added.flatMap((m) => (m.role === "assistant" ? m.content.filter((b) => b.type === "toolCall").map((b) => b.name) : []));
		assert.deepEqual(calls.filter((c) => PROBE_OR_PLAN.has(c)), [], "no probe question and no new plan after Continue");
		assert.ok(!added.some((m) => m.role === "custom" && m.customType === "probe-handoff"), "no new planning wake");
		assert.equal(listed().length, sessions, "the session count is unchanged");
		chatStore.deleteChat(id);
	});
});

// ─── a double press ─────────────────────────────────────────────────────────

describe("two rapid presses", () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
	beforeEach(() => {
		const data = new Map<string, string>();
		Object.defineProperty(globalThis, "sessionStorage", {
			configurable: true,
			value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) },
		});
	});
	afterEach(() => {
		if (original) Object.defineProperty(globalThis, "sessionStorage", original);
		else Reflect.deleteProperty(globalThis, "sessionStorage");
	});

	it("start one session and one run", async () => {
		let posts = 0;
		const fetchLike = (async () => {
			posts += 1;
			await new Promise((resolve) => setTimeout(resolve, 10));
			return Response.json({ id: `chat_${posts}` });
		}) as unknown as typeof fetch;
		const starter = new SessionStarter();
		const body = { title: "Continue Problem sheet 4: rank and nullity", course: { workspace: WS } };
		const [a, b] = await Promise.all([starter.start(body, fetchLike), starter.start(body, fetchLike)]);
		assert.equal(posts, 1, "one session is created");
		assert.equal(a, b, "both presses open it, and its opening is sent once from there");
	});
});

// ─── a finished lesson ──────────────────────────────────────────────────────

describe("Continue on a finished lesson", () => {
	const CLOSE = "Part (c) done: dim ker A = 2. Next time, part (d).";
	const finishedLesson = () => {
		const id = seedLesson(assistant([fauxText(CLOSE)], "stop"));
		const messages = chatStore.getChat(id)!.messages;
		const closing = messages.pop()!;
		chatStore.saveMessages(id, [
			...messages,
			assistant([callBlock("q-c", "explain", { type: "check", nodeId: "sheet-c", question: "dim ker A?", correctAnswer: "2" })]),
			result("q-c", "explain", { kind: "explain", text: "2", confidence: "confident" }),
			closing,
		]);
		return id;
	};

	it("reopens it by default", () => {
		const id = finishedLesson();
		assert.equal(sessionState(item(id)), "finished", "the last step was asked and the tutor closed");
		const action = topicAction(KERNEL, MAP, topicSessions(listed(), WS, KERNEL));
		assert.deepEqual(action.kind === "continue" && "chat" in action ? action.chat.id : null, id);
		chatStore.deleteChat(id);
	});

	it("with the switch on fresh, starts one session that skips the probe and keeps the plan", async () => {
		const id = finishedLesson();
		const move = continueMove(topicSessions(listed(), WS, KERNEL), "fresh");
		assert.equal(move?.kind, "fresh");
		const { seen, factory } = scripted("We stopped at part (c), which you finished. Part (d): is A onto?");
		const create = () =>
			POST(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `Continue ${SHEET.title}`, course: { workspace: WS }, resume: { from: id } }) }));
		const { id: fresh } = (await (await create()).json()) as { id: string };
		await send(fresh, `Continue ${SHEET.title}`, factory);

		assert.deepEqual(seen.map((s) => s.agent), ["teacher"], "the fresh session opens with the teacher");
		assert.ok(!seen[0]!.prompt.includes(ROUTING_STEP));
		const record = chatStore.getChat(fresh)!;
		assert.deepEqual(record.tree?.nodes.map((node) => node.id), TREE.nodes.map((node) => node.id), "the plan carries over");
		const calls = record.messages.flatMap((m) => (m.role === "assistant" ? m.content.filter((b) => b.type === "toolCall").map((b) => b.name) : []));
		assert.deepEqual(calls.filter((c) => PROBE_OR_PLAN.has(c)), [], "no probe question and no new plan");
		assert.deepEqual(item(fresh).tasks, ["sheet-4"], "it holds the task the lesson held");
		assert.equal(sessionState(item(fresh)), "your-turn", "its reconnecting question waits on him");

		const again = topicAction(KERNEL, MAP, topicSessions(listed(), WS, KERNEL));
		assert.ok("chat" in again && again.chat.id === fresh, "a second Continue opens the fresh session, never a third");
		chatStore.deleteChat(id);
		chatStore.deleteChat(fresh);
	});
});
