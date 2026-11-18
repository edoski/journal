/**
 * Edo, 18 Nov 2026: "yes def want nudge where i try myself again first".
 * Round 15 (2 free, 61b): on "By what factor does C stretch the line
 * through (1,1)?", a confident "By 1" got the whole working at once, where
 * practice would nudge and let him retry. A lesson's check now works as a
 * practice problem does: his first try that is not right gets one nudge and
 * the same check again; only a second miss gets the working. The voice
 * guard holds back any other question after a first miss it saved, the
 * prompts say so, and the transcript draws the re-ask as his turn on the
 * question above, never its words twice.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { askedAgain } from "../components/lesson/prose/prose-question-data.ts";

const STRETCH = "By what factor does $C$ stretch the line through $(1,1)$, and why?";
let n = 0;
const explain = (question: string, type = "check"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type, nodeId: "eigen", correctAnswer: "By 2, since C(1,1) = (2,2)." } });
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const save = (question: string, result: string): ToolCall => ({
	type: "toolCall",
	id: `v-${++n}`,
	name: "course_save",
	arguments: { changes: { observations: [{ question, topics: ["eigen"], text: "Took the line's points as fixed", response: "By 1", help: "none", result }] } },
});
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (call: ToolCall, text: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text }], details: { kind: call.name, text, answeredAt: "2026-11-18T10:00:00Z" }, isError: false, timestamp: 1 }) as LhMessage;
const verdict = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

/** A lesson whose check he has just answered, once or (with `earlier`)
 *  for the second time. */
function lesson(opts: { type?: string; earlier?: boolean; review?: boolean } = {}): { guard: VoiceGuard; answer: string } {
	const history: LhMessage[] = [newUserMessage("Eigenvalues and eigenvectors")];
	if (opts.earlier) {
		const first = explain(STRETCH);
		history.push(assistant([first]), answered(first, "By 1"), assistant([send("The points of the line move, since $C(1,1) = (2,2)$ is not $(1,1)$.")]));
	}
	const check = explain(STRETCH, opts.type);
	history.push(assistant([check]), answered(check, opts.earlier ? "By 3" : "By 1"));
	return { guard: new VoiceGuard(history, undefined, opts.review === true, true), answer: check.id };
}

const NUDGE = "The line through $(1,1)$ is not fixed point by point. Compute $C(1,1)$ and compare it with $(1,1)$.";

describe("a lesson's check nudges first, then he tries again (Edo, 18 Nov)", () => {
	it("after his first try saved not right, a new question is held back, and the same check asked again goes through", () => {
		const { guard, answer } = lesson();
		assert.equal(verdict(guard, save(answer, "incorrect")), null);
		assert.equal(verdict(guard, send(NUDGE)), null);
		assert.equal(verdict(guard, explain("Which vectors does $C$ send to multiples of themselves, and why?")), "retry");
		assert.equal(verdict(guard, explain(STRETCH)), null);
	});

	it("a partly right first try is nudged too", () => {
		const { guard, answer } = lesson();
		verdict(guard, save(answer, "partial"));
		verdict(guard, send(NUDGE));
		assert.equal(verdict(guard, explain("What is $C(2,2)$, and why?")), "retry");
	});

	it("the check asked again in its own words, spacing aside, is the retry", () => {
		const { guard, answer } = lesson();
		verdict(guard, save(answer, "incorrect"));
		verdict(guard, send(NUDGE));
		assert.equal(verdict(guard, explain(`  ${STRETCH.replace(" the line", "  the line")}`)), null);
	});

	it("the hold is once a turn, so a tutor that insists is never looped", () => {
		const { guard, answer } = lesson();
		verdict(guard, save(answer, "incorrect"));
		verdict(guard, send(NUDGE));
		assert.equal(verdict(guard, explain("What is $C(2,2)$, and why?")), "retry");
		assert.equal(verdict(guard, explain("What is $C(3,3)$, and why?")), null);
	});

	it("a turn that would end with no question is told to ask the check again", () => {
		const { guard, answer } = lesson();
		verdict(guard, save(answer, "incorrect"));
		verdict(guard, send(NUDGE));
		assert.match(guard.beforeEnd() ?? "", /Ask the check again with explain/);
	});

	it("a second try that is still not right gets the working: any question goes through", () => {
		const { guard, answer } = lesson({ earlier: true });
		verdict(guard, save(answer, "incorrect"));
		verdict(guard, send("Apply $C$ to $(1,1)$: $C(1,1) = (2,2) = 2(1,1)$, so the line is stretched by 2."));
		assert.equal(verdict(guard, explain("By what factor does $C$ stretch the line through $(1,-1)$, and why?")), null);
		assert.equal(guard.beforeEnd(), undefined);
	});

	it("a right answer, a prediction and a review answer are not held", () => {
		const right = lesson();
		verdict(right.guard, save(right.answer, "correct"));
		assert.equal(verdict(right.guard, explain("What is $C(2,2)$, and why?")), null);
		const predicted = lesson({ type: "predict" });
		verdict(predicted.guard, save(predicted.answer, "incorrect"));
		verdict(predicted.guard, send(NUDGE));
		assert.equal(verdict(predicted.guard, explain("What is $C(2,2)$, and why?")), null);
		const review = lesson({ review: true });
		verdict(review.guard, save(review.answer, "incorrect"));
		verdict(review.guard, send(NUDGE));
		assert.equal(verdict(review.guard, explain("What is $C(2,2)$, and why?")), null);
	});
});

describe("the lesson's rule says nudge first", () => {
	const teacher = composeInstructions("teacher");

	it("the teacher's prompt asks for one nudge and the same check again, then the working", () => {
		assert.match(teacher, /A wrong answer gets one nudge, then he tries again/);
		assert.match(teacher, /the same check again/);
		assert.doesNotMatch(teacher, /A wrong answer means resume teaching/);
	});

	it("the doctrine's chain says it, for every harness, and the lesson's course prompt carries it", () => {
		const doctrine = readFileSync(new URL("../../learning/skills/tutor/references/teaching.md", import.meta.url), "utf8");
		assert.match(doctrine, /gets one nudge before any working/);
		assert.doesNotMatch(doctrine, /Repair a failed check before the next step/);
		assert.match(courseRecordPrompt("teacher", { arcs: true }), /gets one nudge before any working/);
	});

	it("the voice gives no correct move on a first miss at a lesson's check", () => {
		assert.match(teacher, /A lesson's check missed on the first try gets no correct move/);
	});
});

describe("the retry is drawn as his turn on the question above", () => {
	const part = (id: string, question: string, output?: unknown) => ({ type: "tool-explain", toolCallId: id, state: output ? "output-available" : "input-available", input: { question, type: "check", nodeId: "eigen" }, output });
	const answer = { text: "By 1", answeredAt: "2026-11-18T10:00:00Z" };

	it("the same words after his answer are a re-ask, so its words are not printed twice", () => {
		assert.deepEqual([...askedAgain([{ parts: [part("q1", STRETCH, answer)] }, { parts: [{ type: "text" }, part("q2", STRETCH)] }])], ["q2"]);
	});

	it("a new question after his answer is drawn in full", () => {
		assert.deepEqual([...askedAgain([{ parts: [part("q1", STRETCH, answer)] }, { parts: [{ type: "text" }, part("q2", "What is $C(2,2)$, and why?")] }])], []);
	});
});
