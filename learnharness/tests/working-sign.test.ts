import { test } from "node:test";
import assert from "node:assert/strict";
import { showsWorking } from "../components/lesson/working-sign.ts";
import type { LhViewMessage } from "../src/core";

const learner: LhViewMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Show me" }] } as LhViewMessage;
const tutor = (...parts: unknown[]): LhViewMessage => ({ id: "a1", role: "assistant", parts }) as LhViewMessage;

test("a turn that is only reasoning still shows the working line", () => {
	// Round 2: Show me took about 40 s of reasoning with nothing in the pane.
	assert.equal(showsWorking([learner, tutor({ type: "step-start" }, { type: "reasoning", text: "…" })], true), true);
});

test("the line waits on his card until the reply starts", () => {
	assert.equal(showsWorking([learner], true), true);
});

test("the tutor's arriving words are the sign themselves", () => {
	assert.equal(showsWorking([learner, tutor({ type: "text", text: "Row 3 equals" })], true), false);
	assert.equal(showsWorking([learner, tutor({ type: "tool-figure", state: "input-streaming" })], true), false);
});

test("a tool running after the words shows the line again", () => {
	assert.equal(showsWorking([learner, tutor({ type: "text", text: "Saved." }, { type: "tool-course_save", state: "input-available" })], true), true);
});

test("nothing shows when no turn runs", () => {
	assert.equal(showsWorking([learner, tutor({ type: "reasoning", text: "" })], false), false);
});

test("a posed question ends the line: what is left is the turn closing, and he can already answer (round 12, 3 D6)", () => {
	// Round 12: "Thinking…" and Stop showed for 1–4 s under every posed question.
	const asked = tutor({ type: "text", text: "Right." }, { type: "tool-explain", state: "input-available", toolCallId: "q1" });
	assert.equal(showsWorking([learner, asked], true), false);
	assert.equal(showsWorking([learner, tutor({ type: "tool-ask_user_question", state: "input-available", toolCallId: "q2" })], true), false);
	assert.equal(showsWorking([learner, tutor({ type: "tool-problem", state: "output-available", toolCallId: "p1" })], true), false, "a posed problem too");
	assert.equal(showsWorking([learner, tutor({ type: "tool-explain", state: "output-error", toolCallId: "q3" })], true), true, "a refused question never reached him");
});

test("words he has whole, with the turn still running, show the line under them (round 13, 4 #2)", () => {
	// Round 13: after a practice problem's closing words, 6 to 16 s went by
	// with no sign while the tutor's last call ran.
	assert.equal(showsWorking([learner, tutor({ type: "text", text: "Your second answer is right.", state: "done" })], true), true);
	assert.equal(showsWorking([learner, tutor({ type: "text", text: "Your second answer", state: "streaming" })], true), false, "words still arriving are the sign");
});
