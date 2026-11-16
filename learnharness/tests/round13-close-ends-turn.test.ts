/**
 * Round 13 (4 #2): after a practice problem's closing words, the page showed
 * no sign of work for 6 to 16 s. The tutor's turn went on past its closing
 * words to one more model call, which only wrote ordinary text the voice
 * guard withholds; the lesson's close did the same after its closing words.
 * The prompts end the turn there ("Then you END YOUR TURN"; "then write your
 * closing words"), so a clean send_to_user after this turn's clean conclude,
 * or after its closing lesson_progress, ends the turn, as probe_done ends the
 * prober's (round 9 M3).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolCall } from "@earendil-works/pi-ai";
import { endsTurnFor } from "../src/agent/teacher-agent.ts";

const call = (name: string, args: ToolCall["arguments"] = {}): ToolCall => ({ type: "toolCall", id: name, name, arguments: args });

describe("the closing words end the turn (round 13, 4 #2)", () => {
	it("practice: the words after this turn's clean conclude are its last", () => {
		assert.equal(endsTurnFor("practice")("send_to_user", [call("conclude")]), true);
		assert.equal(endsTurnFor("practice")("send_to_user", []), false, "feedback on an open problem goes on: a second message may follow");
		assert.equal(endsTurnFor("practice")("send_to_user"), false);
	});

	it("teacher: the words after this turn's closing lesson_progress are its last", () => {
		assert.equal(endsTurnFor("teacher")("send_to_user", [call("course_save"), call("lesson_progress", { done: [], close: true })]), true);
		assert.equal(endsTurnFor("teacher")("send_to_user", [call("lesson_progress", { done: ["a"] })]), false, "a step marked done is not a close");
		assert.equal(endsTurnFor("teacher")("send_to_user", [call("conclude")]), false, "only practice concludes a problem");
	});
});
