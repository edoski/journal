/**
 * Round 19, M7: probe to teaching took about 50 s (47 to 55 s in three
 * lenses, 46 to 50 s on P5's quiet box), and "Planning the lesson…" filled
 * most of it: the plan reply's own thinking, 22 to 33 s, is the wait. Edo's
 * lever (22 Nov): the probe's end posts the lesson's first step, written
 * with its assessment, so he reads it while the teacher plans. The plan is
 * still made from the whole assessment, after it (round 16's plan-early
 * started before the assessment and was removed), with that step first.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { buildProbeHandoffSteer, HANDOFF_TEXT, REVIEW_HANDOFF_TEXT, TASK_HANDOFF_TEXT } from "../src/core/contracts.ts";
import { newUserMessage, probeFeedbackOf, probeOpeningOf, SEND_TO_USER_TOOL, withProbeFeedback, type LhMessage } from "../src/core/native-messages.ts";
import { projectView } from "../src/core/view.ts";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { endsTurnFor } from "../src/agent/teacher-agent.ts";

let n = 0;
const call = (name: string, args: ToolCall["arguments"]): ToolCall => ({ type: "toolCall", id: `${name}-${++n}`, name, arguments: args });
const assistant = (...content: ToolCall[]) => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const result = (c: ToolCall, details: unknown = null, isError = false) => ({ id: `r-${c.id}`, role: "toolResult", toolCallId: c.id, toolName: c.name, content: [{ type: "text", text: "ok" }], details, isError, timestamp: 1 }) as LhMessage;

const FEEDBACK = "Right: $(1 + x/n)^n$ tends to $e^x$.";
/** An opening in a teaching turn's budget, as the base's first step on the Poisson fixture began. */
const OPENING =
	"Picture calls arriving at random, $3$ an hour on average. Cut the hour into $n$ slots so short that two calls never share one. Each slot then holds a call or not, independently, with the same chance $p$. So the hour's count is binomial, with $n$ trials.";
const ASSESSMENT = { summary: "Enter at the Poisson limit of the binomial.", strands: [{ strand: "Binomial", assessment: "Solid." }] };

/** The Poisson probe's last turn: his answer, then the save, the feedback and the probe's end in one reply. */
function probe(opening: string | null, refused = false): LhMessage[] {
	const recall = call("recall", { question: "What is $\\lim (1 + x/n)^n$?", correctAnswer: "$e^x$" });
	const save = call("course_save", { changes: {} });
	const feedback = call(SEND_TO_USER_TOOL, { message: FEEDBACK });
	const done = call("probe_done", opening === null ? { assessment: ASSESSMENT } : { assessment: ASSESSMENT, opening });
	return [
		newUserMessage("Poisson distribution"),
		assistant(recall),
		result(recall, { question: recall.id, kind: "explain", text: "e^x", questionText: "What is $\\lim (1 + x/n)^n$?", answers: ["e^x"], answeredAt: "2026-11-08T10:00:00Z" }),
		assistant(save, feedback, done),
		result(save),
		result(feedback),
		result(done, refused ? { ok: false, error: "A question is still open" } : { ok: true }),
	];
}

const drawn = (record: LhMessage[]): string[] =>
	projectView(record)
		.flatMap((m) => (m.role === "assistant" ? m.parts : []))
		.flatMap((p) => (p.type === "text" ? [(p as { text: string }).text] : []));

describe("the probe's end opens the lesson while the teacher plans (round 19, M7)", () => {
	it("his screen shows the opening under the probe's feedback, as the tutor's words", () => {
		assert.deepEqual(drawn(probe(OPENING)), [FEEDBACK, OPENING]);
		assert.deepEqual(drawn(probe(null)), [FEEDBACK]);
		assert.deepEqual(drawn(probe(OPENING, true)), [FEEDBACK], "a refused probe_done ended nothing");
	});

	it("the teacher's wake carries the opening as the plan's first step, and the plan is still made from the whole assessment", () => {
		const record = probe(OPENING);
		assert.equal(probeOpeningOf(record), OPENING);
		assert.deepEqual(probeFeedbackOf(record), [FEEDBACK], "the opening is not the probe's feedback");
		const content = String(withProbeFeedback(buildProbeHandoffSteer("chat_1"), record).content);
		assert.ok(content.includes(`The lesson's first step is already on my screen, written from the probe's assessment so I read it while you plan: "${OPENING}"`), content);
		assert.match(content, /plan the full teaching arc/);
		assert.match(content, /Take your time here and really think this through/);
		assert.match(content, /in that same reply, pose that step's question/);
		assert.doesNotMatch(content, /start teaching with the first step alone/);
		assert.ok(content.includes(`I have already read the probe's feedback on my last answer: "${FEEDBACK}"`), content);
	});

	it("with no opening, or a refused probe_done, the wake teaches the first step as before", () => {
		for (const record of [probe(null), probe(OPENING, true)]) {
			assert.equal(probeOpeningOf(record), null);
			assert.ok(String(withProbeFeedback(buildProbeHandoffSteer("chat_1"), record).content).startsWith(HANDOFF_TEXT));
		}
	});

	it("a review's and an open task's wakes are their own", () => {
		const record = probe(OPENING);
		assert.ok(String(withProbeFeedback(buildProbeHandoffSteer("chat_1", true), record).content).startsWith(`${HANDOFF_TEXT} ${REVIEW_HANDOFF_TEXT}`));
		assert.ok(String(withProbeFeedback(buildProbeHandoffSteer("chat_1", false, true), record).content).startsWith(TASK_HANDOFF_TEXT));
	});

	/** The guard on the probe's last turn, which his answer to its last question opened. */
	const answering = (review = false, task = false): VoiceGuard => {
		const q = call("recall", { question: "What is $\\lim (1 + x/n)^n$?" });
		const saved = call("course_save", { changes: { tasks: { "sheet-4": { kind: "task", step: "Part (c)" } } } });
		const tasks = task ? [assistant(saved), result(saved, {})] : [];
		return new VoiceGuard([newUserMessage("Poisson distribution"), ...tasks, assistant(q), result(q, { kind: "explain", text: "e^x", answeredAt: "2026-11-08T10:00:00Z" })], undefined, review);
	};
	/** The opening the guard leaves on a streamed probe_done. */
	const send = (message: string) => call(SEND_TO_USER_TOOL, { message });
	const rules = (guard: VoiceGuard, c: ToolCall): string[] => {
		guard.screen(c);
		const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(c.id);
		return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
	};
	const screened = (guard: VoiceGuard, opening: string): unknown => {
		const done = call("probe_done", { assessment: ASSESSMENT, opening });
		guard.screen(done);
		return (done.arguments as { opening?: unknown }).opening;
	};

	it("the guard keeps a lesson's opening in a teaching turn's budget", () => {
		assert.equal(screened(answering(), OPENING), OPENING);
	});

	it("the guard leaves out an opening that breaks the voice or asks, and the probe still ends", () => {
		const long = Array.from({ length: 6 }, (_, i) => `Sentence ${i + 1} of the step.`).join(" ");
		assert.equal(screened(answering(), long), undefined);
		assert.equal(screened(answering(), `${OPENING} What must $p$ be?`), undefined, "its question comes with the plan");
	});

	it("an opening left off probe_done is owed as one message: the probe still ends, and that message ends the prober's turn", async () => {
		const guard = answering();
		const long = Array.from({ length: 6 }, (_, i) => `Sentence ${i + 1} of the step.`).join(" ");
		const done = call("probe_done", { assessment: ASSESSMENT, opening: long });
		guard.screen(done);
		const ended = await guard.wrap({ name: "probe_done", label: "probe_done", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: "" }], details: { ok: true } }) } as AgentTool<any>).execute(done.id, done.arguments);
		assert.equal(ended.terminate, false, "the turn goes on for the opening");
		assert.match((ended.content[0] as { text: string }).text, /The lesson's opening was not shown to him[\s\S]*too long for a teaching turn[\s\S]*Send it now with send_to_user/);
		assert.deepEqual(rules(guard, send(`${OPENING} What must $p$ be?`)), ["opening-asks"]);
		assert.deepEqual(rules(guard, send(OPENING)), [], "the rewrite, read as a teaching turn");
		assert.deepEqual(rules(guard, send("One more line.")), ["after-probe"]);
		assert.equal(endsTurnFor("prober")(SEND_TO_USER_TOOL, [done]), true);
		assert.equal(endsTurnFor("prober")(SEND_TO_USER_TOOL, []), false, "feedback before the probe's end goes on");
	});

	it("a clean opening on a retried probe_done owes none, so he never sees it twice", async () => {
		const guard = answering();
		const long = Array.from({ length: 6 }, (_, i) => `Sentence ${i + 1} of the step.`).join(" ");
		const tool = (ok: boolean) => guard.wrap({ name: "probe_done", label: "probe_done", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: ok ? "" : "A question is still open." }], details: { ok }, isError: !ok }) } as AgentTool<any>);
		const first = call("probe_done", { assessment: ASSESSMENT, opening: long });
		guard.screen(first);
		await tool(false).execute(first.id, first.arguments);
		const retry = call("probe_done", { assessment: ASSESSMENT, opening: OPENING });
		guard.screen(retry);
		assert.equal((retry.arguments as { opening?: unknown }).opening, OPENING);
		const ended = await tool(true).execute(retry.id, retry.arguments);
		assert.notEqual(ended.terminate, false, "nothing is owed: the probe's end ends the turn as usual");
	});

	it("the wake reads an owed opening sent after the probe's end, and never as feedback", () => {
		const record = probe(null);
		const rewrite = call(SEND_TO_USER_TOOL, { message: OPENING });
		record.push(assistant(rewrite), result(rewrite));
		assert.equal(probeOpeningOf(record), OPENING);
		assert.deepEqual(probeFeedbackOf(record), [FEEDBACK]);
		assert.match(String(withProbeFeedback(buildProbeHandoffSteer("chat_1"), record).content), /The lesson's first step is already on my screen/);
		assert.deepEqual(drawn(record), [FEEDBACK, OPENING]);
	});

	it("the guard leaves out any opening in a review or an open task's session: their teacher opens them", () => {
		assert.equal(screened(answering(true), OPENING), undefined);
		assert.equal(screened(answering(false, true), OPENING), undefined);
	});

	it("the teacher's guard reads the opening as said, so the plan's reply never says it again", () => {
		const guard = new VoiceGuard([...probe(OPENING), newUserMessage("Next: plan")]);
		const said = (guard as unknown as { told: string[] }).told;
		assert.ok(said.includes(OPENING), said.join(" | "));
	});

	it("the prober is told to write it after the assessment, and only in a lesson", () => {
		const doctrine = readFileSync(new URL("../src/agent/prompts/prober/10-probe-doctrine.md", import.meta.url), "utf8");
		assert.match(doctrine, /\*\*In a lesson, `probe_done` also opens it\*\*: its `opening`, written after the assessment, is the lesson's first step/);
		assert.match(doctrine, /In his review, or a session that carries on his open task, leave `opening` out/);
	});
});
