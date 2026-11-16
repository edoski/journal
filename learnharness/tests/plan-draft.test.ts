/**
 * Round 14, M9 (Edo, 16 Nov 2026: "approved do this and keep high
 * reasoning"): from the probe's last answer to the first teaching question
 * took 60 to 80 s, most of it the plan turn thinking from nothing. The
 * prober marks the question it expects to conclude on (`recall` with
 * `last`); the teacher then drafts the plan in the background, on a fork of
 * the lesson's own Claude Code session, while he answers; the teacher's turn
 * amends the draft. Stop, Done for today and a probe that asks on cancel the
 * draft, and nothing of a draft is saved but what the teacher's turn reads.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type AssistantMessage, type Context, type FauxResponseStep } from "@earendil-works/pi-ai";
import { bareQuestionTools, createProberAgent, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { handleChatInput, handleChatRequest, planDraftEngineOverride } from "../src/server/chat-handler.ts";
import { cancelPlanDraft, planDraftOf, startPlanDraft, takePlanDraft } from "../src/server/plan-draft.ts";
import { abortTurn } from "../src/server/turn-runs.ts";
import { runningTurn } from "../src/server/turn-runs.ts";
import { chatStore } from "../src/store/chats.ts";
import { jobStore } from "../src/store/jobs.ts";
import { buildAnswer, type QuestionData } from "../src/core/question-core.ts";
import { draftBasisHolds, lastProbeQuestionOpen, PLAN_DRAFT_TEXT, planDraftNote } from "../src/core/plan-draft.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import type { SteerMessage } from "../src/core/contracts.ts";
import { fakeFor, onFake, type ScriptedModel } from "./helpers/fake-sdk.ts";
import { signInTestClaude } from "./claude-fixture.ts";

await signInTestClaude();

const created: string[] = [];
after(() => {
	planDraftEngineOverride.engine = undefined;
	for (const id of created) try { chatStore.deleteChat(id); } catch { /* gone */ }
});

const LAST = { question: "A help desk gets 3 calls an hour on average. What is the chance of no call in an hour?", correctAnswer: "$e^{-3} \\approx 0.05$: the slot model's $(1-3/n)^n$ tends to $e^{-3}$.", last: true };
const MAP = "graph TD\n  slots[Calls in an hour as many tiny trials] --> zero[The chance of no call as the slots shrink]\n  zero --> pmf[\"The probability of $k$ calls\"]";

function scripted(steps: FauxResponseStep[]): ScriptedModel {
	const faux = createFauxCore({ tokenSize: { min: 64, max: 64 } });
	faux.setResponses(steps);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

const lastUserText = (context: Context): string => {
	const m = context.messages.findLast((x) => x.role === "user");
	return typeof m?.content === "string" ? m.content : (m?.content ?? []).map((b) => ("text" in b ? b.text : "")).join("");
};
const allText = (context: Context): string => JSON.stringify(context.messages);

/** A model call that never ends until its signal fires (the draft still thinking). */
function thinkingForever(seen: { aborted: boolean; started?: boolean }): FauxResponseStep {
	return ((_context: unknown, options: { signal?: AbortSignal } | undefined) =>
		new Promise<AssistantMessage>((resolve) => {
			seen.started = true;
			const done = () => { seen.aborted = true; resolve(fauxAssistantMessage("late")); };
			if (options?.signal?.aborted) done();
			else options?.signal?.addEventListener("abort", done, { once: true });
		})) as unknown as FauxResponseStep;
}

function post(chatId: string, input: unknown): Request {
	return new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input }) });
}

async function turn(chatId: string, input: unknown, factory: Parameters<typeof handleChatRequest>[1]): Promise<void> {
	const ack = await handleChatRequest(post(chatId, input), factory);
	assert.equal(ack.status, 200, await ack.clone().text());
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
}

/** Lets the settle's draft start and its model call run. */
async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setImmediate(r));
	assert.ok(check(), "the condition never held");
}

const steers: SteerMessage[] = [];
function prober(model: ScriptedModel, chatId: string): Parameters<typeof handleChatRequest>[1] {
	return (opts) => createProberAgent({ chatId, chatStore, jobStore, spawn: () => {}, deliver: (steer) => void steers.push(steer) }, onFake(model, opts));
}

function answer(text: string) {
	const qd: QuestionData = { id: "q-last", kind: "explain", question: LAST.question, mode: "text", options: [], committedAnswer: LAST.correctAnswer, createdAt: new Date().toISOString() };
	return buildAnswer(qd, { text });
}

/** A lesson whose probe just posed its last question, with a draft running. */
async function atLastQuestion(model: ScriptedModel) {
	const chat = chatStore.createChat("Test: Poisson");
	created.push(chat.id);
	planDraftEngineOverride.engine = fakeFor(model).engine;
	await turn(chat.id, { type: "text", text: "teach me the Poisson distribution" }, prober(model, chat.id));
	return chat.id;
}

describe("the plan's early draft", () => {
	it("starts when the probe's last question is posed, saves nothing, and the teacher's turn reads it", async () => {
		const seen: { draftAsked?: string; teacherSaw?: string } = {};
		const model = scripted([
			fauxAssistantMessage([fauxToolCall("recall", LAST, { id: "q-last" })], { stopReason: "toolUse" }),
			// The draft: the fork of the lesson's session, asked to draft.
			(context) => {
				seen.draftAsked = lastUserText(context);
				return fauxAssistantMessage([fauxToolCall("plan_init", { goal: { title: "Poisson distribution" }, mermaid: MAP }, { id: "draft-plan" })], { stopReason: "toolUse" });
			},
			// His last answer: the probe concludes.
			fauxAssistantMessage([fauxToolCall("probe_done", { assessment: { strands: [{ strand: "The limit $(1-x/n)^n$", assessment: "Guessed $e^{-3}$ by pattern; no model yet." }] } }, { id: "pd" })], { stopReason: "toolUse" }),
			// The teacher's turn.
			(context) => {
				seen.teacherSaw = allText(context);
				return fauxAssistantMessage([fauxText("Planned.")]);
			},
		]);
		const chatId = await atLastQuestion(model);
		const before = chatStore.getChat(chatId)!;
		assert.equal(lastProbeQuestionOpen(before.messages), "q-last");
		await until(() => planDraftOf(chatId)?.ready === true);
		assert.match(seen.draftAsked ?? "", /\[PLAN DRAFT\]/, "the draft is asked in its own words, on the lesson so far");
		const during = chatStore.getChat(chatId)!;
		assert.equal(during.messages.length, before.messages.length, "the record holds nothing of the draft");
		assert.equal(during.tree, before.tree, "its plan_init saved no map");
		assert.deepEqual(during.session, before.session, "the lesson's session map is untouched");
		const sessions = fakeFor(model).sessions;
		assert.equal(sessions.get(before.session!.id)!.some((e) => JSON.stringify(e.message).includes("[PLAN DRAFT]")), false, "the draft ran on a fork: the lesson's own session never heard it");

		await turn(chatId, { type: "answer", toolCallId: "q-last", answer: answer("maybe e^-3, like the c from before") }, prober(model, chatId));
		const handoff = steers.at(-1)!;
		assert.equal((handoff as { customType?: string }).customType, "probe-handoff");
		await handleChatInput(chatId, { type: "steers", steers: [handoff] }, (opts) => createTeacherAgent(undefined, { ...onFake(model, opts), tools: bareQuestionTools() }));
		const handle = runningTurn(chatId);
		if (handle) await new Response(handle.subscribe()).text();
		assert.match(seen.teacherSaw ?? "", /A draft of this plan, written from the probe before my last answer and before the assessment above/);
		assert.match(seen.teacherSaw ?? "", /Calls in an hour as many tiny trials/, "the draft's map is what the teacher amends");
		assert.equal(planDraftOf(chatId), null, "taken once");
		const marker = chatStore.getChat(chatId)!.messages.find((m) => m.role === "custom" && (m as { customType?: string }).customType === "probe-handoff");
		assert.match((marker as { content: string }).content, /Calls in an hour as many tiny trials/, "what the teacher read is in the record");
	});

	it("his Stop cancels a draft still thinking, and nothing of it is kept", async () => {
		const draft: { aborted: boolean; started?: boolean } = { aborted: false };
		const model = scripted([fauxAssistantMessage([fauxToolCall("recall", LAST, { id: "q-last" })], { stopReason: "toolUse" }), thinkingForever(draft)]);
		const chatId = await atLastQuestion(model);
		await until(() => draft.started === true);
		const before = chatStore.getChat(chatId)!;
		abortTurn(chatId);
		await until(() => draft.aborted);
		assert.equal(planDraftOf(chatId), null);
		assert.equal(takePlanDraft(chatId, () => true), null, "nothing left for the teacher");
		assert.equal(chatStore.getChat(chatId)!.messages.length, before.messages.length);
	});

	it("Done for today cancels the draft", async () => {
		const draft: { aborted: boolean; started?: boolean } = { aborted: false };
		const model = scripted([fauxAssistantMessage([fauxToolCall("recall", LAST, { id: "q-last" })], { stopReason: "toolUse" }), thinkingForever(draft), fauxAssistantMessage([fauxText("We'll stop here for today.")])]);
		const chatId = await atLastQuestion(model);
		await until(() => draft.started === true);
		await turn(chatId, { type: "tonight" }, (opts) => createTeacherAgent(undefined, { ...onFake(model, opts), tools: bareQuestionTools() }));
		await until(() => draft.aborted);
		assert.equal(planDraftOf(chatId), null);
	});

	it("a probe that asks on drops the draft, and a draft not ready when the teacher opens is stopped", async () => {
		assert.equal(planDraftOf("chat_none"), null);
		const ran = { aborted: false };
		startPlanDraft("chat_unready", "q1", () => ({ continue: () => new Promise<void>(() => {}), abort: () => { ran.aborted = true; } }));
		assert.equal(takePlanDraft("chat_unready", () => true), null, "not ready: the teacher plans as before");
		assert.equal(ran.aborted, true);
		const stale = { aborted: false };
		startPlanDraft("chat_stale", "q1", (keep) => { keep({ mermaid: MAP }); return { continue: async () => {}, abort: () => { stale.aborted = true; } }; });
		assert.equal(takePlanDraft("chat_stale", () => false), null, "ready, but the probe asked on");
		assert.equal(stale.aborted, true);
		const late = { kept: false };
		startPlanDraft("chat_late", "q1", (keep) => ({ continue: async () => {}, abort: () => { keep({ mermaid: MAP }); late.kept = planDraftOf("chat_late") !== null; } }));
		cancelPlanDraft("chat_late", "test");
		assert.equal(late.kept, false, "a map arriving after the cancel is dropped");
	});
});

describe("when a draft fits (core/plan-draft.ts)", () => {
	const STAMPS = { api: "faux", provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stopReason: "toolUse", timestamp: 1 } as const;
	let n = 0;
	const call = (name: string, args: unknown, id = `c${++n}`): LhMessage => ({ id: `a${++n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], ...STAMPS }) as unknown as LhMessage;
	const result = (id: string, name: string, details: unknown, isError = false): LhMessage => ({ id: `r${++n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "" }], details, isError, timestamp: 1 }) as unknown as LhMessage;
	const opened = [newUserMessage("teach me Poisson"), call("recall", LAST, "q-last")];

	it("only at a question the probe marked its last", () => {
		assert.equal(lastProbeQuestionOpen(opened), "q-last");
		assert.equal(lastProbeQuestionOpen([newUserMessage("x"), call("recall", { ...LAST, last: undefined }, "q2")]), null);
		assert.equal(lastProbeQuestionOpen([newUserMessage("x"), call("explain", { ...LAST, type: "check", nodeId: "a" }, "q3")]), null);
	});

	it("while the question is open, and after it once the probe concluded on it", () => {
		assert.equal(draftBasisHolds(opened, "q-last"), true);
		const answered = [...opened, result("q-last", "recall", { kind: "explain", text: "e^-3" })];
		const concluded = [...answered, call("course_save", {}, "s"), result("s", "course_save", null), call("probe_done", {}, "pd"), result("pd", "probe_done", { ok: true })];
		assert.equal(draftBasisHolds(concluded, "q-last"), true);
		assert.equal(draftBasisHolds([...answered, call("recall", { question: "And two calls?", correctAnswer: "…" }, "q-more")], "q-last"), false, "the probe asked on");
		assert.equal(draftBasisHolds([...concluded, call("plan_init", { mermaid: MAP }, "p"), result("p", "plan_init", { ok: true })], "q-last"), false, "a plan is made");
		assert.equal(draftBasisHolds(answered, "q-last"), false, "answered, not concluded");
	});

	it("the prober marks the question it expects to conclude on, and asks on when the answer opens a strand", async () => {
		const { readFileSync } = await import("node:fs");
		const doctrine = readFileSync(new URL("../src/agent/prompts/prober/10-probe-doctrine.md", import.meta.url), "utf8");
		assert.match(doctrine, /Mark the question you expect to conclude on with `last: true` on its `recall`/);
		assert.match(doctrine, /if his answer opens a strand you must still measure, ask on, and the draft is dropped/);
	});

	it("the draft is asked to plan at the plan turn's own height, and to save nothing", () => {
		assert.match(PLAN_DRAFT_TEXT, /Take your time here and really think this through/);
		assert.match(planDraftNote({ mermaid: MAP }), /check it against the assessment strand by strand[^.]*\. Every gap the assessment names gets its step, a step for what I already hold goes/, "the teacher checks the draft against the assessment written after it (round 14 judge: drafted plans missed the gap the assessment flagged)");
		assert.match(PLAN_DRAFT_TEXT, /call plan_init once, with the map and the lesson's goal, and nothing else: no message to me, no question, no save/);
	});
});
