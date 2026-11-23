/**
 * Round 20, M1: probe to teaching. Round 19 put the lesson's first step on
 * probe_done, so it reached him only when the assessment had streamed (17 to
 * 30 s after his answer on 30c5268d, and never on lens 1's Expectation start,
 * where the guard left it out for length); the question came after the
 * plan's own thinking, 42 to 68 s after his answer. Edo's levers (decision 2,
 * 23 Nov), both keeping the plan's inputs: the prober sends the first step
 * before its save and assessment, and the plan's reply poses that step's
 * question before it plans.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { buildProbeHandoffSteer, HANDOFF_TEXT, probeDoneInputSchema, REVIEW_HANDOFF_TEXT, TASK_HANDOFF_TEXT, type PlanTree } from "../src/core/contracts.ts";
import { danglingQuestionOf, needsContinuation, newUserMessage, pendingQuestionOf, probeFeedbackOf, probeOpeningOf, SEND_TO_USER_TOOL, withProbeFeedback, type LhMessage } from "../src/core/native-messages.ts";
import { projectView } from "../src/core/view.ts";
import { planningLesson, workingLine } from "../src/core/pending.ts";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { endsTurnFor } from "../src/agent/teacher-agent.ts";
import { teachExplainToolFor } from "../src/agent/tools.ts";
import { planTools } from "../src/agent/tools/plan.ts";
import type { LhViewMessage } from "../src/core/view.ts";
import { SessionModel } from "../components/session-core.ts";

let n = 0;
const call = (name: string, args: ToolCall["arguments"]): ToolCall => ({ type: "toolCall", id: `${name}-${++n}`, name, arguments: args });
const assistant = (...content: ToolCall[]) => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const result = (c: ToolCall, details: unknown = null, isError = false) => ({ id: `r-${c.id}`, role: "toolResult", toolCallId: c.id, toolName: c.name, content: [{ type: "text", text: "ok" }], details, isError, timestamp: 1 }) as LhMessage;

const QUESTION = "What does $(1 + 1/n)^n$ approach, and why?";
const FEEDBACK = "The limit holds because $n\\ln(1 + 1/n)$ tends to $1$.";
/** A first step in a teaching turn's budget, as the base's Poisson step began. */
const OPENING =
	"Picture calls arriving at random, $3$ an hour on average. Cut the hour into $n$ slots so short that two calls never share one. Each slot then holds a call or not, independently, with the same chance $p$. So the hour's count is binomial, with $n$ trials.";
const ASSESSMENT = { summary: "Enter at the Poisson limit of the binomial.", strands: [{ strand: "Binomial", assessment: "Solid." }] };

const recall = () => call("recall", { question: QUESTION, correctAnswer: "$e$" });
const answer = (q: ToolCall) => result(q, { question: q.id, kind: "explain", text: "e", questionText: QUESTION, answers: ["e"], answeredAt: "2026-11-08T10:00:00Z" });

/** The Poisson probe's last turn as the head's prober writes it: his answer,
 *  then the feedback, the lesson's first step, the save and the probe's end. */
function probe(messages: readonly string[], refused = false): LhMessage[] {
	const q = recall();
	const sent = messages.map((message) => call(SEND_TO_USER_TOOL, { message }));
	const save = call("course_save", { changes: { observations: [{ question: q.id }] } });
	const done = call("probe_done", { assessment: ASSESSMENT });
	return [newUserMessage("Poisson distribution"), assistant(q), answer(q), assistant(...sent, save, done), ...sent.map((c) => result(c)), result(save), result(done, refused ? { ok: false, error: "A question is still open" } : { ok: true })];
}

const drawn = (record: LhMessage[]): string[] =>
	projectView(record)
		.flatMap((m) => (m.role === "assistant" ? m.parts : []))
		.flatMap((p) => (p.type === "text" ? [(p as { text: string }).text] : []));

describe("the prober sends the lesson's first step before its save and assessment (round 20, M1)", () => {
	it("probe_done carries the assessment alone, and the doctrine sends the step first, only in a lesson", () => {
		assert.deepEqual(Object.keys(probeDoneInputSchema.properties), ["assessment"]);
		const doctrine = readFileSync(new URL("../src/agent/prompts/prober/10-probe-doctrine.md", import.meta.url), "utf8");
		assert.match(doctrine, /\*\*In a lesson, you also open it, first\*\*: in that same reply, before the save and the assessment, send him the lesson's first step as its own message/);
		assert.match(doctrine, /In his review, or a session that carries on his open task, send no first step/);
	});

	it("his screen shows the feedback, then the step, as the tutor's words", () => {
		assert.deepEqual(drawn(probe([FEEDBACK, OPENING])), [FEEDBACK, OPENING]);
	});

	it("the wake quotes the step as on his screen, apart from the feedback, and asks for its question before the plan", () => {
		const record = probe([FEEDBACK, OPENING]);
		assert.equal(probeOpeningOf(record), OPENING);
		assert.deepEqual(probeFeedbackOf(record), [FEEDBACK, OPENING], "what he read before the probe's end");
		const content = String(withProbeFeedback(buildProbeHandoffSteer("chat_1"), record).content);
		assert.ok(content.startsWith(`The lesson's first step is already on my screen, written from the probe's assessment: "${OPENING}"`), content);
		assert.match(content, /Before you plan, pose that step's question, alone/);
		assert.match(content, /its nodeId the id your plan will give that step/);
		assert.match(content, /plan once its result is back: plan the full teaching arc[\s\S]*with that step first/);
		assert.match(content, /Take your time over the plan and really think it through, then call plan_init/);
		assert.ok(content.includes(`I have already read the probe's feedback on my last answer: "${FEEDBACK}" That is said`), content);
		assert.ok(!content.includes(`"${OPENING}" That is said`), "the step is not quoted as feedback");
	});

	it("a step he read with no feedback before it adds no line about his answer's mark", () => {
		const content = String(withProbeFeedback(buildProbeHandoffSteer("chat_1"), probe([OPENING])).content);
		assert.match(content, /The lesson's first step is already on my screen/);
		assert.doesNotMatch(content, /got only its mark|already read the probe's feedback/);
	});

	it("a step refused and rewritten after the probe's end is the one quoted; a refused probe_done ended nothing", () => {
		const record = probe([FEEDBACK]);
		const rewrite = call(SEND_TO_USER_TOOL, { message: OPENING });
		record.push(assistant(rewrite), result(rewrite));
		assert.equal(probeOpeningOf(record), OPENING);
		assert.equal(probeOpeningOf(probe([FEEDBACK, OPENING], true)), null);
		assert.ok(String(withProbeFeedback(buildProbeHandoffSteer("chat_1"), probe([FEEDBACK, OPENING], true)).content).startsWith(HANDOFF_TEXT));
	});

	it("a review's and an open task's wakes are their own", () => {
		const record = probe([FEEDBACK]);
		assert.ok(String(withProbeFeedback(buildProbeHandoffSteer("chat_1", true), record).content).startsWith(`${HANDOFF_TEXT} ${REVIEW_HANDOFF_TEXT}`));
		assert.ok(String(withProbeFeedback(buildProbeHandoffSteer("chat_1", false, true), record).content).startsWith(TASK_HANDOFF_TEXT));
	});

	it("a lesson recorded in round 19, with its step on probe_done, still draws it and counts it as said", () => {
		const q = recall();
		const done = call("probe_done", { assessment: ASSESSMENT, opening: OPENING });
		const record = [newUserMessage("Poisson distribution"), assistant(q), answer(q), assistant(done), result(done, { ok: true })];
		assert.deepEqual(drawn(record), [OPENING]);
		const said = (new VoiceGuard([...record, newUserMessage("Next: plan")]) as unknown as { told: string[] }).told;
		assert.ok(said.includes(OPENING), said.join(" | "));
	});
});

describe("the plan's reply poses the first step's question before it plans (round 20, M1)", () => {
	const store = (tree: PlanTree | null, messages: LhMessage[] = []) => {
		const saved: PlanTree[] = [];
		return { saved, chatStore: { getChat: () => ({ tree, messages }), saveTree: (_id: string, t: PlanTree) => saved.push(t), nameSession: () => {}, takeUpLesson: () => {} } };
	};
	const question = { type: "check", nodeId: "zero-limit", question: "What is the chance of no calls in an hour, and why?", correctAnswer: "$e^{-3}$, since each of the $n$ slots is empty with chance $1 - 3/n$." };

	it("before any plan, a question naming its step's id is posed and the turn goes on to plan", async () => {
		const res = await teachExplainToolFor({ chatId: "c1", chatStore: store(null).chatStore as never }).execute("q1", question as never);
		assert.notEqual(res.isError, true, JSON.stringify(res.content));
		assert.equal(res.terminate, false);
		assert.match((res.content[0] as { text: string }).text, /Now plan the whole lesson, taking your time, with "zero-limit" as its first step's id, and call plan_init: it ends your turn/);
		const bad = await teachExplainToolFor({ chatId: "c1", chatStore: store(null).chatStore as never }).execute("q2", { ...question, nodeId: "Zero limit" } as never);
		assert.equal(bad.isError, true);
	});

	it("once a plan exists, the question ends the turn and its id must be a step", async () => {
		const tree: PlanTree = { nodes: [{ id: "zero-limit", title: "No calls in an hour" }], edges: [], version: 1 };
		const res = await teachExplainToolFor({ chatId: "c1", chatStore: store(tree).chatStore as never }).execute("q1", question as never);
		assert.equal(res.terminate, true);
		const off = await teachExplainToolFor({ chatId: "c1", chatStore: store(tree).chatStore as never }).execute("q2", { ...question, nodeId: "ratio" } as never);
		assert.equal(off.isError, true);
	});

	it("the plan after that question ends the teacher's turn", () => {
		const asked = call("explain", question);
		assert.equal(endsTurnFor("teacher")("plan_init", [asked]), true);
		assert.equal(endsTurnFor("teacher")("plan_init", []), false, "a plan with its first step after it goes on");
		assert.equal(endsTurnFor("prober")("plan_init", [asked]), false);
	});

	it("the first plan keeps the step the question already named", async () => {
		const asked = call("explain", question);
		const { saved, chatStore } = store(null, [assistant(asked)]);
		const plan = planTools({ chatId: "c1", chatStore: chatStore as never }).plan_init!;
		const without = await plan.execute("p1", { mermaid: "graph TD\n  slots[Cutting the hour into slots] --> ratio[Comparing neighbouring counts]" });
		assert.match(JSON.stringify(without.content), /Your question already asked about \W+zero-limit\W+ which this plan leaves out/);
		assert.equal(saved.length, 0);
		const withIt = await plan.execute("p2", { mermaid: "graph TD\n  zero-limit[No calls in an hour] --> ratio[Comparing neighbouring counts]" });
		assert.match((withIt.content[0] as { text: string }).text, /"ok":true/);
		assert.equal(saved.length, 1);
	});

	it("the plan drawn after the question leaves it open, for his answer and the server alike; words after it do not", () => {
		const asked = call("explain", question);
		const plan = call("plan_init", { mermaid: "graph TD\n  zero-limit[No calls in an hour]" });
		const thinking = { ...fauxAssistantMessage(""), content: [{ type: "thinking", thinking: "The plan." }], id: `a-${++n}` } as LhMessage;
		const record = [newUserMessage("Next"), assistant(asked), thinking, assistant(plan), result(plan, { ok: true })];
		assert.equal(pendingQuestionOf(record)?.toolCallId, asked.id);
		assert.equal(danglingQuestionOf(record)?.toolCallId, asked.id);
		assert.equal(needsContinuation(record), false, "the plan ended its turn on purpose: nothing asks the question again");
		const said = call(SEND_TO_USER_TOOL, { message: "More words." });
		assert.equal(pendingQuestionOf([...record, assistant(said), result(said)]), null, "a later reply he reads closes it, as before");
	});

	it("under the posed question the line still reads Planning the lesson… until the plan lands", () => {
		// It failed at 30c5268d, where the question that reached him ended the wait.
		const msg = (role: string, parts: unknown[]) => ({ id: `m${++n}`, role, parts }) as unknown as LhViewMessage;
		const part = (tool: string, state: string) => ({ type: `tool-${tool}`, toolCallId: `c${++n}`, state, input: {} });
		const probeEnd = msg("assistant", [{ type: "text", text: OPENING }, part("course_save", "output-available"), part("probe_done", "output-available")]);
		const posed = msg("assistant", [part("explain", "input-available")]);
		assert.equal(workingLine([probeEnd, posed, msg("assistant", [])]), "Planning the lesson…");
		assert.equal(planningLesson([probeEnd, posed, msg("assistant", [part("plan_init", "output-available")])]), false);
		assert.equal(planningLesson([probeEnd, msg("assistant", [part("explain", "output-available")])]), false, "his answer: the lesson has moved on");
		assert.equal(planningLesson([probeEnd, msg("user", [{ type: "text", text: "Can you go slower?" }])]), false);
	});

	it("his answer sent while the plan is still being made shows at once and posts when the turn ends", async () => {
		const asked = call("explain", question);
		const posts: number[] = [];
		let settle: () => void = () => {};
		const settled = new Promise<void>((resolve) => (settle = resolve));
		const fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === "/api/chat") {
				posts.push(Date.now());
				return posts.length === 1 ? Response.json({ error: "A turn is already running for this session" }, { status: 409 }) : Response.json({ ok: true });
			}
			if (url === "/api/chats/c1") return Response.json({ messages: [], turnInFlight: posts.length < 2 });
			if (url === "/api/chats/c1/stream") return new Response(new ReadableStream({ start() {} }));
			throw new Error(`unexpected fetch: ${url}`);
		}) as typeof globalThis.fetch;
		const model = new SessionModel({ chatId: "c1", initialMessages: [newUserMessage("Next"), assistant(asked)], fetch, turnSettled: () => ({ promise: settled, cancel: () => {} }) });
		(model as unknown as { setStatus(s: string): void }).setStatus("streaming");
		void model.submitAnswer("explain", asked.id, { kind: "explain", tool: "explain", questionText: question.question, answers: [], text: "About e^-3." } as never);
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(posts.length, 1, "posted at once, and the running turn refused it for now");
		assert.ok(JSON.stringify(model.getState().messages).includes("About e^-3."), "his answer shows at once");
		settle();
		for (let i = 0; i < 100 && posts.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 10));
		assert.equal(posts.length, 2, "posted again once the turn ended");
		model.stop();
	});
});
