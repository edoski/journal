/**
 * Round 14, m14 (3 n3): after Explain instead, the practice tutor wrote
 * "This problem is closed with no mark, and the explanation comes next."
 * (39). The Explain instead bubble, the problem's card and the teaching say
 * all of it, so the line only narrates. The request now asks for no words
 * between the conclude and `teach`, and the voice refuses the narration.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { PRACTICE_REQUEST_TEXT } from "../src/core/contracts/chat.ts";

describe("no narration after Explain instead (round 14, m14)", () => {
	it("refuses the recorded line", () => {
		assert.ok(voiceBreaks("This problem is closed with no mark, and the explanation comes next.", "close").some((b) => b.rule === "narration"));
	});

	it("leaves closing words about his work alone", () => {
		assert.ok(!voiceBreaks("The pivots sit in columns one and three, so those columns of $B$ form the basis.", "close").some((b) => b.rule === "narration"));
	});

	it("Explain instead asks for no words between the conclude and the teaching", () => {
		assert.match(PRACTICE_REQUEST_TEXT.explain, /with no words between: the problem's card shows how it ended/);
	});
});
