/**
 * Round 15, m13 (3 m3): in Poisson, the probe's feedback said "The base
 * and the exponent change together, so the limit cannot be taken one part
 * at a time…", and the first teaching message opened "Your answer took the
 * limit of the base alone, while the exponent grew at the same time…"
 * (`29`). The wake said only "the probe's feedback above". It now quotes
 * the feedback he read after his last answer, as already said.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { buildProbeHandoffSteer, buildModeHandoffSteer, HANDOFF_TEXT, TASK_HANDOFF_TEXT } from "../src/core/contracts.ts";
import { newUserMessage, probeFeedbackOf, SEND_TO_USER_TOOL, withProbeFeedback, type LhMessage } from "../src/core/native-messages.ts";

const FEEDBACK = "The base and the exponent change together, so the limit cannot be taken one part at a time: a shortfall of $\\frac3n$ below 1 gets raised to a power that grows just as fast.";
const call = (id: string, name: string, args: ToolCall["arguments"]): ToolCall => ({ type: "toolCall", id, name, arguments: args });
const assistant = (id: string, ...content: ToolCall[]) => ({ ...fauxAssistantMessage(""), content, id }) as LhMessage;
const result = (c: ToolCall, details: unknown = null, isError = false) => ({ id: `r-${c.id}`, role: "toolResult", toolCallId: c.id, toolName: c.name, content: [{ type: "text", text: "ok" }], details, isError, timestamp: 1 }) as LhMessage;
const recall = call("q-1", "recall", { question: "What does $(1 - 3/n)^n$ approach?", correctAnswer: "$e^{-3}$" });
const answered = result(recall, { question: "q-1", kind: "explain", text: "1", questionText: "What does $(1 - 3/n)^n$ approach?", answers: ["1"], answeredAt: "2026-11-08T10:00:00Z" });
const save = call("c-1", "course_save", { changes: {} });
const refused = call("s-0", SEND_TO_USER_TOOL, {});
const feedback = call("s-1", SEND_TO_USER_TOOL, { message: FEEDBACK });
const done = call("p-1", "probe_done", { assessment: { summary: "…" } });
/** The Poisson probe as it landed: his answer, the save, a refused draft, the feedback, the probe's end. */
const probe: LhMessage[] = [
	newUserMessage("Poisson distribution"),
	assistant("a-1", recall),
	answered,
	assistant("a-2", save),
	result(save),
	assistant("a-3", refused),
	result(refused, { withheld: "voice" }, true),
	assistant("a-4", feedback),
	result(feedback),
	assistant("a-5", done),
	result(done, { ok: true }),
];

describe("the teacher's wake quotes the probe's last feedback as already said (round 15, m13)", () => {
	it("reads what he read after his last answer, and nothing refused", () => {
		assert.deepEqual(probeFeedbackOf(probe), [FEEDBACK]);
	});

	it("the lesson's wake and a task's quote it and ask the first step never to say its point again", () => {
		// A lesson's probe ends on the first step it sent after the feedback (round 20, M1).
		const step = call("s-2", SEND_TO_USER_TOOL, { message: "Picture the hour cut into slots so short that two calls never share one." });
		const lesson = [...probe.slice(0, -2), assistant("a-4b", step), result(step), ...probe.slice(-2)];
		for (const [review, task] of [[false, false], [true, false], [false, true]] as const) {
			const content = String(withProbeFeedback(buildProbeHandoffSteer("chat_1", review, task), review || task ? probe : lesson).content);
			assert.ok(content.includes(`I have already read the probe's feedback on my last answer: "${FEEDBACK}"`), content);
			assert.match(content, /never says its point again, in any words/);
			assert.doesNotMatch(content, /got only its mark/);
		}
	});

	it("a probe that asked nothing adds nothing, and other steers pass as they are", () => {
		assert.equal(withProbeFeedback(buildProbeHandoffSteer("chat_1"), [newUserMessage("Poisson distribution")]).content, HANDOFF_TEXT);
		assert.equal(withProbeFeedback(buildProbeHandoffSteer("chat_1", false, true), [newUserMessage("Sheet 4")]).content, TASK_HANDOFF_TEXT);
		const mode = buildModeHandoffSteer("chat_1", "h-1", "practice");
		assert.equal(withProbeFeedback(mode, probe), mode);
	});
});
