/**
 * Every attempt is saved before the turn moves on (round 10, 1 m1): his
 * wrong Guessing prediction on the axes got a rebuttal and the same
 * question again ("Your turn, on the question above"), no save, so only
 * his right retry reached the record. In a session with a course record,
 * the guard holds a turn-ending call (the next question, probe_done)
 * until a save names his answer, and reminds a turn that would end
 * without one. A save streamed first lets the question through.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { ASKED_INSTEAD_TEXT } from "../src/core/question-core.ts";
import { newAskedMessage } from "../src/core/native-messages.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

let n = 0;
const predict = (question: string): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type: "predict", nodeId: "axes" } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (callId: string, text: string, details: Record<string, unknown> = {}): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, ...details }, isError: false, timestamp: 1 }) as LhMessage;
const save = (question: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: "course_save", arguments: { changes: { observations: [{ topic: "eigen", question, kind: "attempt", result: "incorrect", text: "Picked the x-axis; $A(1,0) = (2,1)$ leaves it", predicted: true }] } } });

const withheld = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld?: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.withheld ?? "rules") : null;
};

const QUESTION = "Guess first: which of the axis vectors does $A$ keep on its own line?";
function wrongPrediction(details: Record<string, unknown> = {}) {
	const asked = predict(QUESTION);
	return { asked, turn: [newUserMessage("Eigenvalues and eigenvectors"), assistant([asked]), answered(asked.id, "the x-axis", details)] };
}

describe("a wrong prediction he answered", () => {
	it("is saved before the same question is asked again", () => {
		const { turn } = wrongPrediction();
		const guard = new VoiceGuard(turn, undefined, false, true);
		assert.equal(withheld(guard, predict(QUESTION)), "unsaved");
	});

	it("lets the question through once a save names his answer, streamed before it", () => {
		const { asked, turn } = wrongPrediction();
		const guard = new VoiceGuard(turn, undefined, false, true);
		assert.equal(withheld(guard, save(asked.id)), null);
		assert.equal(withheld(guard, predict(QUESTION)), null);
		assert.equal(guard.beforeEnd(), undefined);
	});

	it("reminds a turn that would end without saving it", () => {
		const { turn } = wrongPrediction();
		assert.match(new VoiceGuard(turn, undefined, false, true).beforeEnd() ?? "", /not saved/);
	});

	it("holds nothing where nothing is owed: a hint press, a session with no record, an answer already saved", () => {
		const hint = wrongPrediction({ hintRequested: true });
		assert.equal(withheld(new VoiceGuard(hint.turn, undefined, false, true), predict(QUESTION)), null);
		const { turn } = wrongPrediction();
		assert.equal(withheld(new VoiceGuard(turn, undefined, false, false), predict(QUESTION)), null);
		const { asked, turn: before } = wrongPrediction();
		const kept = save(asked.id);
		const saved = [...before, assistant([kept]), { id: `r-${++n}`, role: "toolResult", toolCallId: kept.id, toolName: "course_save", content: [{ type: "text", text: "saved" }], details: {}, isError: false, timestamp: 1 } as unknown as LhMessage];
		assert.equal(withheld(new VoiceGuard(saved, undefined, false, true), predict(QUESTION)), null, "saved earlier in the turn");
	});
});

// Round 10, 1 m1 as it happened: his wrong prediction went through Ask,
// which the doctrine read as a question, never an answer, so nothing kept it.
describe("a guess he sent through Ask", () => {
	it("is his answer, saved naming his message, in every agent's doctrine and in what the dismissal tells the tutor", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) assert.match(courseRecordPrompt(agent, { arcs: false }), /unless it only answers the open question and asks nothing[^;]*saved naming `"his-message"`, a prediction when the question asked for one/, agent);
		assert.match(ASKED_INSTEAD_TEXT, /only answers the question[^.]*save it as his attempt naming "his-message", a prediction when the question asked for one/);
		assert.match(newAskedMessage("question").content, /only answers the open question[^.]*save it as his attempt naming "his-message", a prediction when the question asked for one/, "the note riding his Ask message says so too");
	});
});
