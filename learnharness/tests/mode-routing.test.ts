/**
 * Implicit routing between teaching and practice. The handoff tools
 * (tools/handoff.ts) are the only way a session changes mode: a refusal
 * leaves it put, a success switches the fold and wakes the other agent.
 *
 * The end-to-end runs drive the real handler with a scripted model: the
 * handler's own mode fold picks the agent, the real registries and prompts
 * reach the model, and the wake pipeline starts the next agent's run. Each
 * scripted reply first checks what the model was given (its tools and
 * prompt), then answers as a model following that prompt would.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxText,
	fauxToolCall,
	type AssistantMessage,
	type Message,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { PiEngine } from "../src/agent/models.ts";
import { createPracticeAgent, createProberAgent, createTeacherAgent, type AgentKind } from "../src/agent/teacher-agent.ts";
import { practiceHandoffTool, teachHandoffTool } from "../src/agent/tools/handoff.ts";
import { practiceTools } from "../src/agent/tools/practice.ts";
import { createProberTools } from "../src/agent/tools.ts";
import { handleChatInput, handleChatRequest } from "../src/server/chat-handler.ts";
import { deliverJobResult, setTurnRunner } from "../src/server/jobs.ts";
import { runningTurn } from "../src/server/turn-runs.ts";
import { chatStore } from "../src/store/chats.ts";
import { jobStore } from "../src/store/jobs.ts";
import { PATHS } from "../config.ts";
import { MODE_HANDOFF_ACK_TEXT, MODE_HANDOFF_TEXT, type SteerMessage } from "../src/core/contracts.ts";
import { activeProblemOf, needsContinuation, newUserMessage, sessionModeOf, type LhMessage } from "../src/core/native-messages.ts";
import { projectView } from "../src/core/view.ts";
import { signInTestClaude, TEST_MODEL } from "./claude-fixture.ts";

await signInTestClaude();

const createdChats: string[] = [];
after(() => {
	for (const id of createdChats) {
		try {
			fs.unlinkSync(path.join(PATHS.chats, `${id}.json`));
		} catch {
			/* already gone */
		}
	}
});

function newChat(title: string): string {
	const chat = chatStore.createChat(title);
	chatStore.saveSettings(chat.id, { model: { ...TEST_MODEL } });
	createdChats.push(chat.id);
	return chat.id;
}

function questionCall(id: string): LhMessage[] {
	return [
		{
			id: `a_${id}`,
			role: "assistant",
			content: [{ type: "toolCall", id, name: "recall", arguments: { question: "What is rank?", correctAnswer: "The dimension of the column space." } }],
			api: "faux",
			provider: "test",
			model: "test",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason: "toolUse",
			timestamp: 1,
		},
	];
}

function callPair(name: string, id: string, details: unknown): LhMessage[] {
	return [
		{ ...questionCall(id)[0]!, content: [{ type: "toolCall", id, name, arguments: {} }] } as LhMessage,
		{ id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: 2 } as LhMessage,
	];
}

async function run(tool: AgentTool<any>, callId: string, args: unknown) {
	return tool.execute(callId, args as never, undefined, undefined);
}

describe("the handoff tools", () => {
	it("practice: hands off, ends the turn and queues one wake for the practice agent", async () => {
		const chatId = newChat("handoff ok");
		chatStore.saveMessages(chatId, [newUserMessage("give me problems on rank")]);
		const queued: SteerMessage[] = [];
		const { practice } = practiceHandoffTool({ chatId, chatStore, deliver: (s) => queued.push(s) });
		const result = await run(practice!, "call-h1", { scope: "rank", reason: "asked for problems" });
		assert.equal(result.isError, undefined);
		assert.equal(result.terminate, true, "the handoff ends the turn");
		assert.deepEqual(result.details, { ok: true, mode: "practice" });
		assert.equal((result.content[0] as { text: string }).text, MODE_HANDOFF_ACK_TEXT);
		assert.equal(queued.length, 1);
		assert.equal(queued[0]!.id, "steer_mode_call-h1");
		assert.equal(queued[0]!.content, MODE_HANDOFF_TEXT.practice);
		assert.deepEqual(queued[0]!.details, { chatId, mode: "practice" });
	});

	it("practice: refused while a question is open; nothing queued, the mode stays", async () => {
		const chatId = newChat("handoff refused");
		chatStore.saveMessages(chatId, questionCall("q1"));
		const queued: SteerMessage[] = [];
		const { practice } = practiceHandoffTool({ chatId, chatStore, deliver: (s) => queued.push(s) });
		const result = await run(practice!, "call-h2", { scope: "rank", reason: "asked" });
		assert.equal(result.isError, true);
		assert.equal(queued.length, 0);
	});

	it("teach: refused while a problem is active, allowed once this turn concluded it", async () => {
		const chatId = newChat("teach gate");
		const queued: SteerMessage[] = [];
		const gate = { problemActive: true };
		const { teach } = teachHandoffTool({ chatId, chatStore, deliver: (s) => queued.push(s) }, gate);
		assert.equal((await run(teach!, "call-t1", { topic: "rank", reason: "asked" })).isError, true);
		gate.problemActive = false;
		const ok = await run(teach!, "call-t2", { topic: "rank", reason: "asked" });
		assert.deepEqual(ok.details, { ok: true, mode: "teach" });
		assert.deepEqual(queued.map((s) => s.id), ["steer_mode_call-t2"]);
	});

	it("a failed wake still records the handoff", async () => {
		const chatId = newChat("wake fails");
		const { practice } = practiceHandoffTool({ chatId, chatStore, deliver: () => { throw new Error("pipeline down"); } });
		const result = await run(practice!, "call-h3", { scope: "open", reason: "nothing named" });
		assert.deepEqual(result.details, { ok: true, mode: "practice" });
	});

	it("a successful handoff owes no continuation: its wake starts the next run", () => {
		const [call, result] = callPair("practice", "h-c", { ok: true, mode: "practice" });
		assert.equal(needsContinuation([newUserMessage("give me problems"), call!, result!]), false);
		const [other, otherResult] = callPair("read", "r-c", null);
		assert.equal(needsContinuation([newUserMessage("read it"), other!, otherResult!]), true, "an ordinary tool result still owes one");
	});

	it("in one turn, a handoff after a question or a concluded probe is refused, and a question after a handoff", async () => {
		const ctx = (chatId: string, queued: SteerMessage[]) => ({ chatId, chatStore, deliver: (s: SteerMessage) => queued.push(s), jobStore, spawn: () => {} });
		const recall = { question: "What is rank?", correctAnswer: "The dimension of the column space." };

		const askedFirst: SteerMessage[] = [];
		const a = createProberTools(ctx(newChat("question then handoff"), askedFirst));
		assert.equal((await run(a.recall!, "q1", recall)).isError, undefined);
		assert.equal((await run(a.practice!, "h1", { scope: "rank", reason: "asked" })).isError, true);

		const handedFirst: SteerMessage[] = [];
		const b = createProberTools(ctx(newChat("handoff then question"), handedFirst));
		assert.deepEqual((await run(b.practice!, "h2", { scope: "rank", reason: "asked" })).details, { ok: true, mode: "practice" });
		assert.equal((await run(b.recall!, "q2", recall)).isError, true);
		assert.equal((await run(b.probe_done!, "pd2", { strands: [{ strand: "rank", assessment: "x" }], summary: "x" })).isError, true);

		const probed: SteerMessage[] = [];
		const c = createProberTools(ctx(newChat("probe then handoff"), probed));
		await run(c.probe_done!, "pd3", { strands: [{ strand: "rank", assessment: "x" }], summary: "x" });
		assert.equal((await run(c.practice!, "h3", { scope: "rank", reason: "asked" })).isError, true);

		assert.deepEqual([askedFirst, handedFirst, probed].map((q) => q.map((s) => s.customType)), [[], ["mode-handoff"], ["probe-handoff"]]);
	});

	it("the practice agent's registry carries teach; the turn gate closes it while the pose stands", async () => {
		const chatId = newChat("practice registry");
		const tools = practiceTools({ chatId, chatStore, deliver: () => {} });
		assert.ok(tools.teach, "teach is registered when the wake can be queued");
		await run(tools.problem!, "p1", { statement: "s", mode: "recall", topics: ["rank"], modelSolution: "m" });
		assert.equal((await run(tools.teach!, "t1", { topic: "rank", reason: "asked" })).isError, true);
	});
});

// ─── end to end, scripted model ──────────────────────────────────────────────

type Seen = { agent: AgentKind; tools: string[]; prompt: string; last: string };
type Step = (seen: Seen) => AssistantMessage;

function systemOf(context: TranscriptContext): { tools: string[]; prompt: string } {
	const system = context.messages.find((m) => m.role === "system");
	assert.ok(system && system.role === "system");
	const prompt = typeof system.content === "string" ? system.content : system.content.map((c) => c.text).join("");
	return { tools: (system.toolsAdded ?? []).map((t) => t.name), prompt };
}

function lastInput(messages: Message[]): string {
	const last = [...messages].reverse().find((m) => m.role === "user");
	return last ? JSON.stringify(last.content) : "";
}

/** One scripted model shared by every agent of the session, and the handler
 *  seam that builds whichever agent the handler's fold picked. */
function session(chatId: string, steps: Step[]) {
	const agents: AgentKind[] = [];
	const faux = createFauxCore({});
	faux.setResponses(
		steps.map((step) => (context: TranscriptContext) => step({ agent: agents.at(-1)!, ...systemOf(context), last: lastInput(context.messages) })),
	);
	const engine: PiEngine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const deliver = (steer: SteerMessage) => void deliverJobResult(steer);
	const factory: Parameters<typeof handleChatRequest>[1] = (opts) => {
		agents.push(opts.agent);
		const built = { ...opts, engine };
		if (opts.agent === "practice") return createPracticeAgent({ chatId, chatStore, deliver }, built);
		if (opts.agent === "teacher") return createTeacherAgent({ chatId, chatStore, jobStore, spawn: () => {}, deliver }, built);
		return createProberAgent({ chatId, chatStore, jobStore, spawn: () => {}, deliver }, built);
	};
	// The wake pipeline starts the next agent's run through the same seam.
	setTurnRunner(async (cid, input) => {
		const ack = await handleChatInput(cid, input, factory);
		const handle = runningTurn(cid);
		if (handle) await new Response(handle.subscribe()).text();
		return ack.status;
	});
	return { agents, factory, steps };
}

async function send(chatId: string, input: unknown, factory: Parameters<typeof handleChatRequest>[1]) {
	const ack = await handleChatRequest(
		new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input }) }),
		factory,
	);
	assert.equal(ack.status, 200, await ack.clone().text());
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
}

function waitFor(cond: () => boolean, what: string, timeoutMs = 15_000): Promise<void> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const tick = () => {
			if (cond()) return resolve();
			if (Date.now() - started > timeoutMs) return reject(new Error(`timeout waiting for ${what}`));
			setTimeout(tick, 20);
		};
		tick();
	});
}

const messagesOf = (chatId: string) => chatStore.getChat(chatId)!.messages;
const call = (name: string, args: unknown, id: string) => fauxAssistantMessage([fauxToolCall(name, args as never, { id })], { stopReason: "toolUse" });
const ROUTING_STEP = "## 0. Practice or a lesson";

afterEach(() => setTurnRunner(async () => 200));

describe("routing end to end (scripted model)", () => {
	it("\"give me problems on rank\" lands in practice; \"actually just explain it\" hands back to teaching", async () => {
		const chatId = newChat("routes to practice and back");
		const { agents, factory } = session(chatId, [
			(seen) => {
				assert.equal(seen.agent, "prober", "a new session opens with the prober");
				assert.ok(seen.tools.includes("practice"), "the prober can hand off");
				assert.ok(seen.prompt.includes(ROUTING_STEP), "the prober is told to route the opening");
				assert.match(seen.last, /give me problems on rank/);
				return call("practice", { scope: "rank", reason: "he asked for problems" }, "h-practice");
			},
			(seen) => {
				assert.equal(seen.agent, "practice", "the wake starts the practice agent");
				assert.ok(seen.tools.includes("problem") && seen.tools.includes("teach"));
				assert.ok(!seen.tools.includes("practice") && !seen.tools.includes("recall"));
				assert.ok(seen.last.includes("[PRACTICE]"), "the wake tells it the session moved to practice");
				return call("problem", { statement: "Find the rank of a 3×3 matrix with two equal rows.", mode: "recall", topics: ["rank"], modelSolution: "At most 2…" }, "p-rank");
			},
			(seen) => {
				assert.equal(seen.agent, "practice");
				assert.match(seen.last, /actually just explain it/);
				return call("conclude", { outcome: "movedOn", verdict: "He asked to be taught instead.", rung: null, missClass: null, retest: false, result: null, response: "asked for an explanation" }, "c-rank");
			},
			() => call("teach", { topic: "rank", reason: "he asked to be taught" }, "h-teach"),
			(seen) => {
				assert.equal(seen.agent, "prober", "back in teaching, the probe has not concluded");
				assert.ok(seen.last.includes("[TEACHING]"));
				return fauxAssistantMessage([fauxText("Where does rank first feel unclear to you?")]);
			},
		]);

		await send(chatId, { type: "text", text: "give me problems on rank" }, factory);
		await waitFor(() => activeProblemOf(messagesOf(chatId)) !== null, "the practice agent's first problem");
		assert.equal(sessionModeOf(messagesOf(chatId)), "practice");
		assert.equal(chatStore.listChats().find((c) => c.id === chatId)?.kind, "practice", "the sidebar row follows the mode");

		await send(chatId, { type: "thinking", problemCallId: "p-rank", text: "actually just explain it", confidence: "neutral" }, factory);
		await waitFor(() => agents.length === 4, "the teaching wake");
		await waitFor(() => JSON.stringify(messagesOf(chatId).at(-1)).includes("Where does rank"), "the prober's reply");

		const messages = messagesOf(chatId);
		assert.deepEqual(agents, ["prober", "practice", "practice", "prober"]);
		assert.equal(sessionModeOf(messages), "teach");
		assert.equal(activeProblemOf(messages), null);
		const dividers = projectView(messages).flatMap((m) => m.parts.filter((p) => p.type === "data-mode-handoff").map((p) => (p as { data: { mode: string } }).data.mode));
		assert.deepEqual(dividers, ["practice", "teach"], "the transcript marks both switches");
	});

	it("\"explain eigenvalues\" stays in teaching", async () => {
		const chatId = newChat("stays teaching");
		const { agents, factory } = session(chatId, [
			(seen) => {
				assert.equal(seen.agent, "prober");
				assert.ok(seen.tools.includes("practice") && seen.prompt.includes(ROUTING_STEP));
				assert.match(seen.last, /explain eigenvalues/);
				return fauxAssistantMessage([fauxText("What do you want to be able to do with eigenvalues?")]);
			},
		]);
		await send(chatId, { type: "text", text: "explain eigenvalues" }, factory);
		const messages = messagesOf(chatId);
		assert.deepEqual(agents, ["prober"]);
		assert.equal(sessionModeOf(messages), "teach");
		assert.ok(!messages.some((m) => m.role === "custom" && m.customType === "mode-handoff"));
	});
});
