/**
 * Round 21, carry-in (a), Edo's lever of 23 Nov: the first question came
 * 34 to 65 s after his last probe answer, since the teacher posed it only
 * once the prober's assessment had streamed and the teacher's own reply had
 * started. The prober now poses the first step's question itself, with the
 * step, before its save and assessment; the teacher plans from the whole
 * assessment while he answers, and its plan ends its turn.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type AssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { buildProbeHandoffSteer, type ChatRecord } from "../src/core/contracts.ts";
import { danglingQuestionOf, newUserMessage, pendingQuestionOf, SEND_TO_USER_TOOL, withProbeFeedback, type LhMessage } from "../src/core/native-messages.ts";
import { planningLesson } from "../src/core/pending.ts";
import { projectView } from "../src/core/view.ts";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { endsTurnFor } from "../src/agent/teacher-agent.ts";
import { createProberTools } from "../src/agent/tools.ts";
import { planTools } from "../src/agent/tools/plan.ts";
import type { ChatStore } from "../src/core/ports.ts";

let n = 0;
const call = (name: string, args: ToolCall["arguments"]): ToolCall => ({ type: "toolCall", id: `${name}-${++n}`, name, arguments: args });
const assistant = (...content: ToolCall[]) => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const result = (c: ToolCall, details: unknown = null, isError = false) => ({ id: `r-${c.id}`, role: "toolResult", toolCallId: c.id, toolName: c.name, content: [{ type: "text", text: "ok" }], details, isError, timestamp: 1 }) as LhMessage;

const PROBE_Q = "What does $(1 + 1/n)^n$ approach, and why?";
const FEEDBACK = "The limit holds because $n\\ln(1 + 1/n)$ tends to $1$.";
const OPENING =
	"Picture calls arriving at random, $3$ an hour on average. Cut the hour into $n$ slots so short that two calls never share one. Each slot then holds a call or not, independently, with the same chance $p$. So the hour's count is binomial, with $n$ trials.";
const STEP_Q = "With $n$ slots and $3$ calls an hour on average, what is the chance $p$ that one slot holds a call, and why?";
const STEP_ID = "slots";
const ASSESSMENT = { summary: "Enter at the Poisson limit of the binomial.", strands: [{ strand: "Binomial", assessment: "Solid." }] };

const recall = () => call("recall", { question: PROBE_Q, correctAnswer: "$e$" });
const answer = (q: ToolCall) => result(q, { question: q.id, kind: "explain", text: "e", questionText: PROBE_Q, answers: ["e"], answeredAt: "2026-11-08T10:00:00Z" });
const stepQuestion = () => call("explain", { type: "check", nodeId: STEP_ID, question: STEP_Q, correctAnswer: "$p = 3/n$: the mean of the count is $np$, so $np = 3$." });

/** The probe's last turn as the prober now writes it: the feedback, the
 *  step, its question, the save and the probe's end, in one reply or with
 *  the save and the end in a reply of their own. */
function probe(split = false): { record: LhMessage[]; q: ToolCall } {
	const pq = recall();
	const feedback = call(SEND_TO_USER_TOOL, { message: FEEDBACK });
	const step = call(SEND_TO_USER_TOOL, { message: OPENING });
	const q = stepQuestion();
	const save = call("course_save", { changes: { observations: [{ question: pq.id }] } });
	const done = call("probe_done", { assessment: ASSESSMENT });
	const head = [newUserMessage("Poisson distribution"), assistant(pq), answer(pq)];
	const tail = [result(save), result(done, { ok: true })];
	const record = split
		? [...head, assistant(feedback, step, q), result(feedback), result(step), assistant(save, done), ...tail]
		: [...head, assistant(feedback, step, q, save, done), result(feedback), result(step), ...tail];
	return { record, q };
}

const wake = (record: LhMessage[]) => withProbeFeedback(buildProbeHandoffSteer("chat_1"), record);

describe("the prober poses the lesson's first step's question with the step (round 21, carry-in (a))", () => {
	it("the doctrine poses it with explain, after the step and before the save, and only in a lesson", () => {
		const doctrine = readFileSync(new URL("../src/agent/prompts/prober/10-probe-doctrine.md", import.meta.url), "utf8");
		assert.match(doctrine, /Then, still before the save, pose that step's question with `explain`, alone, its `nodeId` the id the lesson's plan will give the step/);
		assert.match(doctrine, /send no first step and no question: the teacher opens it/);
	});

	it("the prober's explain poses it without ending the reply, and asks for a step id", async () => {
		const tools = createProberTools({ chatId: "chat_1", chatStore: {} as ChatStore, deliver: () => {}, jobStore: {} as never, spawn: () => {} });
		const explain = tools.explain!;
		const posed = await explain.execute("q1", { type: "check", nodeId: STEP_ID, question: STEP_Q, correctAnswer: "$3/n$" });
		assert.equal(posed.terminate, false, "the save and the probe's end follow in the same reply");
		assert.match(JSON.stringify(posed.content), /save his last probe answer with course_save, then conclude with probe_done/);
		const bad = await explain.execute("q2", { type: "check", nodeId: "Slots per hour", question: STEP_Q, correctAnswer: "$3/n$" });
		assert.match(JSON.stringify(bad.content), /is not a step id/);
		assert.equal(endsTurnFor("prober")("explain"), false);
		assert.equal(endsTurnFor("prober")("recall"), true, "a probe question still ends the turn");
		assert.equal(endsTurnFor("prober")("probe_done"), true);
	});

	it("the question waits on him through the save, the probe's end and the teacher's reads and plan", () => {
		for (const split of [false, true]) {
			const { record, q } = probe(split);
			assert.equal(danglingQuestionOf(record)?.toolCallId, q.id, `answerable at the probe's end (split ${split})`);
			const read = call("course_show", { handles: ["poisson"] });
			const plan = call("plan_init", { mermaid: `graph TD\n  ${STEP_ID}[Slots]` });
			const later = [...record, wake(record), assistant(read), result(read), assistant(plan), result(plan, { ok: true })];
			assert.equal(danglingQuestionOf(later)?.toolCallId, q.id, "the teacher's reads and plan leave it open");
			assert.equal(pendingQuestionOf(later)?.toolCallId, q.id, "his dock holds it");
			const his = [...later, newUserMessage("Actually, can we stop here?")];
			const reply = call(SEND_TO_USER_TOOL, { message: "Stopped." });
			assert.equal(danglingQuestionOf([...his, assistant(reply)]), null, "a reply to his message closes nothing it never asked");
		}
	});

	it("his screen shows the feedback, the step and its question, under Planning the lesson…", () => {
		const { record, q } = probe();
		const view = projectView(record);
		const parts = view.flatMap((m) => (m.role === "assistant" ? m.parts : []));
		const texts = parts.flatMap((p) => (p.type === "text" ? [(p as { text: string }).text] : []));
		assert.deepEqual(texts, [FEEDBACK, OPENING]);
		assert.ok(parts.some((p) => p.type === "tool-explain" && (p as { toolCallId?: string }).toolCallId === q.id));
		assert.equal(planningLesson(view), true);
	});

	it("the teacher's wake quotes the step and its question and asks only for the plan, which ends its turn", () => {
		const { record } = probe();
		const content = String(wake(record).content);
		assert.ok(content.startsWith(`The lesson's first step is already on my screen, written from the probe's assessment: "${OPENING}"`), content);
		assert.ok(content.includes(`Its question is on my screen too, and I am working on it while you plan: "${STEP_Q}" (nodeId "${STEP_ID}")`), content);
		assert.match(content, /with that step first, its id "slots"/);
		assert.match(content, /then call plan_init: it ends your turn, and my answer arrives in my next message/);
		assert.doesNotMatch(content, /pose that step's question/);
		assert.ok(content.includes(`I have already read the probe's feedback on my last answer: "${FEEDBACK}"`), content);
		assert.equal(endsTurnFor("teacher", true)("plan_init", []), true, "a question waits on him: the plan ends the turn");
		assert.equal(endsTurnFor("teacher")("plan_init", []), false, "a plan with nothing asked goes on to teach");
	});

	it("the first plan keeps the step the prober's question named", async () => {
		const { record } = probe();
		const chat = { id: "chat_1", title: "Poisson distribution lesson", messages: record, tree: null } as unknown as ChatRecord;
		const store = { getChat: () => chat, saveTree: () => {}, nameSession: () => {}, takeUpLesson: () => {} } as unknown as ChatStore;
		const init = planTools({ chatId: "chat_1", chatStore: store }).plan_init!;
		const dropped = await init.execute("p1", { goal: { title: "Poisson distribution", topic: "poisson" }, mermaid: "graph TD\n  rates[Rates] --> counts[Counts]" });
		assert.match((dropped.content[0] as { text: string }).text, /slots/);
		const kept = await init.execute("p2", { goal: { title: "Poisson distribution", topic: "poisson" }, mermaid: `graph TD\n  ${STEP_ID}[Slots in an hour] --> counts[Counts]` });
		assert.match((kept.content[0] as { text: string }).text, /"ok":true/);
	});
});

describe("the voice reads the step's question as it reads every question (round 21, carry-in (a))", () => {
	const decided = (guard: VoiceGuard, c: ToolCall) => (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld?: string } } | null> }).decisions.get(c.id);
	const tool = (guard: VoiceGuard, name: string, out: { details?: unknown; terminate?: boolean } = {}) =>
		guard.wrap({ name, label: name, description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: "ok" }], details: out.details ?? { ok: true }, ...(out.terminate === undefined ? {} : { terminate: out.terminate }) }) } as AgentTool<any>);
	const reply = (guard: VoiceGuard, ...calls: ToolCall[]): AssistantMessage => {
		const message = { ...fauxAssistantMessage(""), content: calls } as AssistantMessage;
		for (const c of calls) guard.screen(c, message);
		guard.settle(message);
		return message;
	};
	const answering = () => {
		const pq = recall();
		return { guard: new VoiceGuard([newUserMessage("Poisson distribution"), assistant(pq), answer(pq)], endsTurnFor("prober")), pq };
	};

	it("the prober's explain passes through the guard, and one that breaks the voice is refused", () => {
		const { guard } = answering();
		assert.equal(guard.guards("explain"), true);
		const step = call(SEND_TO_USER_TOOL, { message: OPENING });
		const q = call("explain", { type: "check", nodeId: STEP_ID, question: `${STEP_Q} Hint: think about the mean.`, correctAnswer: "$3/n$" });
		reply(guard, step, q);
		assert.equal(decided(guard, step), null);
		assert.ok(decided(guard, q)?.details.rules?.length, "advice under the question is refused");
	});

	it("a refused step keeps its question for the rewrite; the probe's end waits, and the turn ends on the rewrite with the question under it", async () => {
		const { guard, pq } = answering();
		const step = call(SEND_TO_USER_TOOL, { message: `${OPENING} With $h = \\frac1n \\to 0$ it holds.` });
		const q = stepQuestion();
		const save = call("course_save", { changes: { observations: [{ question: pq.id }] } });
		const done = call("probe_done", { assessment: ASSESSMENT });
		const first = reply(guard, step, q, save, done);
		assert.deepEqual(decided(guard, step)?.details.rules, ["chain"]);
		assert.equal(decided(guard, q), null, "the question is read by its own rules and kept");
		assert.ok(!first.content.some((b) => b.type === "toolCall" && b.id === q.id), "kept out of the refused reply");
		assert.notEqual((await tool(guard, "explain", { details: null, terminate: false }).execute(q.id, q.arguments)).terminate, true);
		await tool(guard, "course_save", { details: {} }).execute(save.id, save.arguments);
		assert.equal((await tool(guard, "probe_done").execute(done.id, done.arguments)).terminate, false, "the turn waits for the rewrite");
		const step2 = call(SEND_TO_USER_TOOL, { message: OPENING });
		const second = reply(guard, step2);
		assert.equal(decided(guard, step2), null, "the rewrite shows");
		assert.deepEqual(second.content.flatMap((b) => (b.type === "toolCall" ? [b.id] : [])), [step2.id, q.id], "the question sits under the rewrite");
		assert.equal((await tool(guard, SEND_TO_USER_TOOL, { details: null }).execute(step2.id, step2.arguments)).terminate, true, "the rewrite ends the prober's turn");
	});
});
