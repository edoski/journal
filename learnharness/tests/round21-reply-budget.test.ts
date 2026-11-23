/**
 * Round 21, m17: voice-guard rewrites added 6 to 37 s to short turns (the
 * Eigen prediction's 36.7 s draft refused for length, an Invertible Hint's
 * cue refused as already told, a prediction refused twice for length). The
 * answer the tutor reads now says its reply's budget, the guard's own, and
 * what it already told him since his last answer, so the first draft fits.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { inputAppends } from "../src/core/input-events.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { SENTENCE_BUDGETS, SENTENCE_WORDS } from "../src/core/voice-check.ts";

let n = 0;
const call = (name: string, args: ToolCall["arguments"]): ToolCall => ({ type: "toolCall", id: `${name}-${++n}`, name, arguments: args });
const assistant = (...content: ToolCall[]) => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const result = (c: ToolCall, details: unknown = null, isError = false) => ({ id: `r-${c.id}`, role: "toolResult", toolCallId: c.id, toolName: c.name, content: [{ type: "text", text: "ok" }], details, isError, timestamp: 1 }) as LhMessage;

const EARLIER = "A matrix acts on a vector by mixing its coordinates.";
const STEP = "An eigenvector stays on its own line under $A$, only stretched by its eigenvalue.";
const REFUSED = "That is exactly it! An eigenvector keeps its direction.";
const QUESTION = "Take $A = \\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}$. Before computing anything, which two directions stay on their own line, and why?";

/** A lesson whose last reply taught a step and asked about it, after an
 *  earlier answer and a refused draft. */
function lesson(): { messages: LhMessage[]; q: ToolCall } {
	const first = call("explain", { type: "check", nodeId: "maps", question: "What does $A$ do to $(1, 0)$?", correctAnswer: "$(2, 1)$" });
	const earlier = call(SEND_TO_USER_TOOL, { message: EARLIER });
	const refused = call(SEND_TO_USER_TOOL, { message: REFUSED });
	const step = call(SEND_TO_USER_TOOL, { message: STEP });
	const q = call("explain", { type: "predict", nodeId: "compute", question: QUESTION, correctAnswer: "$(1,1)$ by 3 and $(1,-1)$ by 1." });
	const messages = [
		newUserMessage("Eigenvalues and eigenvectors"),
		assistant(earlier, first),
		result(earlier),
		result(first, { kind: "explain", text: "(2, 1)", questionText: "What does $A$ do to $(1, 0)$?", answers: [], answeredAt: "t" }),
		assistant(refused, step, q),
		result(refused, { ok: false }, true),
		result(step),
	];
	return { messages, q };
}

const replyOf = (messages: LhMessage[], q: ToolCall, answer: Record<string, unknown>): string | undefined => {
	const [res] = inputAppends({ messages }, { type: "answer", toolCallId: q.id, answer: { kind: "explain", questionText: QUESTION, answers: [], ...answer } } as never);
	const text = (res as { content: { type: string; text: string }[] }).content[0]!.text;
	return (JSON.parse(text) as { reply?: string }).reply;
};

describe("the answer the tutor reads carries its reply's budget and what is already said (round 21, m17)", () => {
	it("an answer: the guard's budget for his answer's words, then for a teaching step", () => {
		const { messages, q } = lesson();
		const reply = replyOf(messages, q, { text: "The two axes, each stretched by 2", confidence: "guessing" });
		assert.ok(reply, "the answer says its reply's budget");
		assert.ok(reply.includes(`at most ${SENTENCE_BUDGETS.wrong} sentences and 1 display`), reply);
		assert.ok(reply.includes(`a teaching step after them, one message of at most ${SENTENCE_BUDGETS.teach} sentences and 1 display`), reply);
		assert.ok(reply.includes(`a sentence over ${SENTENCE_WORDS} words counts as two`), reply);
	});

	it("names what he read since his last answer, never a refused draft or what came before", () => {
		const { messages, q } = lesson();
		const reply = replyOf(messages, q, { text: "The axes", confidence: "guessing" })!;
		assert.ok(reply.includes(`never again in any words: "${STEP}"`), reply);
		assert.ok(!reply.includes(REFUSED), "a refused draft never reached him");
		assert.ok(!reply.includes(EARLIER), "what he read before his last answer is another question's");
	});

	it("a hint: one sentence and no display, a statement, with the cues already given on the question", () => {
		const { messages, q } = lesson();
		const nudge = call(SEND_TO_USER_TOOL, { message: "Look at what $A$ does to $(1, 1)$." });
		const again = { ...q, id: `${q.id}-again` };
		const hinted = [...messages, result(q, { kind: "explain", questionText: QUESTION, answers: [], hintRequested: true, text: "maybe" }), assistant(nudge, again), result(nudge)];
		const reply = replyOf(hinted, again, { hintRequested: true, text: "the diagonal?" })!;
		assert.ok(reply.startsWith(`Your hint is one message of ${SENTENCE_BUDGETS.hint} sentence and no displays, a statement, never a question`), reply);
		assert.ok(reply.includes(`"${STEP}" "Look at what $A$ does to $(1, 1)$."`), reply);
	});

	it("a question set aside or shown sets its own length", () => {
		const { messages, q } = lesson();
		assert.equal(replyOf(messages, q, { showMe: true, text: "" }), undefined);
	});
});
