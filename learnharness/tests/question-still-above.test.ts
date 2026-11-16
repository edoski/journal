/**
 * "Here is the question again." with no question (round 11, 4 minor 6):
 * asked "hello? did that go through?", the tutor replied "Yes, it came
 * through. Here is the question again." and nothing followed, since the app
 * no longer reprints an unchanged question. The voice refuses a promise to
 * give the open question again, naming the fix: it is still open above.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";

const rules = (text: string) => voiceBreaks(text, "direct").map((b) => b.rule);

describe("a promise to give the open question again", () => {
	it("is refused in every wording the tutor reached for", () => {
		for (const text of ["Yes, it came through. Here is the question again.", "It arrived. Here's that question again.", "Got it. I'll repeat the question below.", "Here it is again."]) {
			assert.ok(rules(text).includes("reprint"), text);
		}
	});

	it("leaves a message that says the question is still open above, and a new question in its own words", () => {
		assert.equal(rules("Yes, it came through. Your question is still open above.").includes("reprint"), false);
		assert.equal(rules("Try the same idea again with a 3 by 3 matrix.").includes("reprint"), false);
	});
});
