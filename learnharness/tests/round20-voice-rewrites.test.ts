/**
 * Round 20, M1: the probe's last reply now sends two messages, his
 * feedback and the lesson's first step, and on this box both were refused
 * for one rule (a display chaining = with ≈ or →). The guard owed one
 * rewrite for both, so the step's rewrite was refused as words after the
 * probe's end and never shown; when only the feedback was refused, the
 * step showed first and the feedback's rewrite landed under it. Each
 * refused message is now owed its rewrite, in order, and the rule both
 * broke is stated where a message is written.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type AssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { newUserMessage, probeOpeningOf, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { projectView } from "../src/core/view.ts";
import { chainedDisplay } from "../src/core/voice-check.ts";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { endsTurnFor } from "../src/agent/teacher-agent.ts";
import { MESSAGE_DRAFT_LINES } from "../src/agent/tools/send-to-user.ts";

let n = 0;
const call = (name: string, args: ToolCall["arguments"]): ToolCall => ({ type: "toolCall", id: `${name}-${++n}`, name, arguments: args });
const assistant = (...content: ToolCall[]) => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const result = (c: ToolCall, details: unknown = null, isError = false) => ({ id: `r-${c.id}`, role: "toolResult", toolCallId: c.id, toolName: c.name, content: [{ type: "text", text: "ok" }], details, isError, timestamp: 1 }) as LhMessage;

const QUESTION = "What does $(1 + 1/n)^n$ approach, and why?";
const FEEDBACK = "The limit holds because $n\\ln(1 + 1/n)$ tends to $1$.";
const OPENING =
	"Picture calls arriving at random, $3$ an hour on average. Cut the hour into $n$ slots so short that two calls never share one. Each slot then holds a call or not, independently, with the same chance $p$. So the hour's count is binomial, with $n$ trials.";
const ASSESSMENT = { summary: "Enter at the Poisson limit of the binomial.", strands: [{ strand: "Binomial", assessment: "Solid." }] };
const recall = () => call("recall", { question: QUESTION, correctAnswer: "$e$" });
const answer = (q: ToolCall) => result(q, { question: q.id, kind: "explain", text: "e", questionText: QUESTION, answers: ["e"], answeredAt: "2026-11-08T10:00:00Z" });
const drawn = (record: LhMessage[]): string[] =>
	projectView(record)
		.flatMap((m) => (m.role === "assistant" ? m.parts : []))
		.flatMap((p) => (p.type === "text" ? [(p as { text: string }).text] : []));

describe("each refused message is owed its rewrite, in order (round 20, M1)", () => {
	/** The guard on the probe's last turn, which his answer opened. */
	const answering = () => {
		const q = recall();
		return { guard: new VoiceGuard([newUserMessage("Poisson distribution"), assistant(q), answer(q)], endsTurnFor("prober")), q };
	};
	const decided = (guard: VoiceGuard, c: ToolCall) => (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(c.id);
	const tool = (guard: VoiceGuard, name: string, details: unknown = { ok: true }) =>
		guard.wrap({ name, label: name, description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: "ok" }], details }) } as AgentTool<any>);
	/** One model reply: its calls screened as they stream, then settled. */
	const reply = (guard: VoiceGuard, ...calls: ToolCall[]) => {
		const message = { ...fauxAssistantMessage(""), content: calls } as AssistantMessage;
		for (const c of calls) guard.screen(c, message);
		guard.settle(message);
	};
	const CHAINED = "Taking logs, $h = \\frac1n \\to 0$ makes the quotient a derivative.";

	it("both rewrites reach him after the probe's end, and the second ends the prober's turn", async () => {
		const { guard, q } = answering();
		const feedback = call(SEND_TO_USER_TOOL, { message: CHAINED });
		const step = call(SEND_TO_USER_TOOL, { message: `${OPENING} With $h = \\frac1n \\to 0$ it holds.` });
		const save = call("course_save", { changes: { observations: [{ question: q.id }] } });
		const done = call("probe_done", { assessment: ASSESSMENT });
		reply(guard, feedback, step, save, done);
		assert.deepEqual(decided(guard, feedback)?.details.rules, ["chain"]);
		assert.equal(decided(guard, step)?.details.withheld, "after-refused", "the step waits for the feedback's rewrite");
		await tool(guard, "course_save", {}).execute(save.id, save.arguments);
		const ended = await tool(guard, "probe_done").execute(done.id, done.arguments);
		assert.equal(ended.terminate, false, "the turn waits for the rewrites");
		const feedback2 = call(SEND_TO_USER_TOOL, { message: FEEDBACK });
		const step2 = call(SEND_TO_USER_TOOL, { message: OPENING });
		reply(guard, feedback2, step2);
		assert.equal(decided(guard, feedback2), null, "the feedback's rewrite");
		assert.equal(decided(guard, step2), null, "the step's rewrite, never refused as words after the probe's end");
		const send = tool(guard, SEND_TO_USER_TOOL, null);
		assert.notEqual((await send.execute(feedback2.id, feedback2.arguments)).terminate, true, "one rewrite is still owed");
		assert.equal((await send.execute(step2.id, step2.arguments)).terminate, true, "the last rewrite ends the turn");
		const more = call(SEND_TO_USER_TOOL, { message: "One more line." });
		reply(guard, more);
		assert.equal(decided(guard, more)?.details.withheld, "after-probe");
	});

	it("a step after a refused feedback waits for the feedback's rewrite, so he reads them in order (live run, 23 Nov)", async () => {
		const { guard, q } = answering();
		const feedback = call(SEND_TO_USER_TOOL, { message: CHAINED });
		const step = call(SEND_TO_USER_TOOL, { message: OPENING });
		const save = call("course_save", { changes: { observations: [{ question: q.id }] } });
		const done = call("probe_done", { assessment: ASSESSMENT });
		reply(guard, feedback, step, save, done);
		assert.equal(decided(guard, step)?.details.withheld, "after-refused", "a clean step still waits");
		await tool(guard, "course_save", {}).execute(save.id, save.arguments);
		assert.equal((await tool(guard, "probe_done").execute(done.id, done.arguments)).terminate, false);
		const feedback2 = call(SEND_TO_USER_TOOL, { message: FEEDBACK });
		const step2 = call(SEND_TO_USER_TOOL, { message: OPENING });
		reply(guard, feedback2, step2);
		assert.equal(decided(guard, feedback2), null);
		assert.equal(decided(guard, step2), null);
		const record = [newUserMessage("Poisson distribution"), assistant(q), answer(q), assistant(feedback, step, save, done), result(feedback, null, true), result(step, null, true), result(save), result(done, { ok: true }), assistant(feedback2, step2), result(feedback2), result(step2)];
		assert.deepEqual(drawn(record), [FEEDBACK, OPENING]);
		assert.equal(probeOpeningOf(record), OPENING);
	});

	it("a rewrite refused again still owes one, not two", () => {
		const { guard } = answering();
		const first = call(SEND_TO_USER_TOOL, { message: CHAINED });
		reply(guard, first);
		const again = call(SEND_TO_USER_TOOL, { message: `${CHAINED} Still.` });
		reply(guard, again);
		assert.equal((guard as unknown as { owed: number }).owed, 1);
	});

	it("the message's own description states the rule both broke, with examples the guard refuses", () => {
		const line = MESSAGE_DRAFT_LINES.find((l) => l.startsWith("A display, and each piece of maths inside a sentence, states one kind of relation"));
		assert.ok(line, MESSAGE_DRAFT_LINES.join("\n"));
		const examples = [...line.matchAll(/"(\$[^"]+\$)"/g)].map((m) => m[1]!);
		assert.equal(examples.length, 2);
		for (const example of examples) assert.ok(chainedDisplay(example), example);
	});
});
