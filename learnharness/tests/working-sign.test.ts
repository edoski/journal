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
