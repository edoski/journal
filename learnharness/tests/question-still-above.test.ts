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
import { fixFor } from "../src/agent/voice-guard.ts";

const rules = (text: string) => voiceBreaks(text, "direct").map((b) => b.rule);

describe("a promise to give the open question again", () => {
	it("is refused in every wording the tutor reached for", () => {
		for (const text of ["Yes, it came through. Here is the question again.", "It arrived. Here's that question again.", "Got it. I'll repeat the question below.", "Here it is again."]) {
			assert.ok(rules(text).includes("reprint"), text);
		}
	});

	it("is refused when it puts the open question below him (round 13, 4 minor 1: \"the question is still open below\" over \"Your turn, on the question above\")", () => {
		for (const text of ["Yes, your message came through, and the question is still open below.", "It arrived; your question stays below.", "Your check is open below."]) {
			const found = voiceBreaks(text, "direct").find((b) => b.rule === "reprint");
			assert.ok(found, text);
			assert.match(fixFor(found, "direct", text), /still open above/);
		}
		assert.equal(rules("Answer the question below in one line.").includes("reprint"), false, "a question posed under the message is below it");
	});

	it("leaves a message that says the question is still open above, and a new question in its own words", () => {
		assert.equal(rules("Yes, it came through. Your question is still open above.").includes("reprint"), false);
		assert.equal(rules("Try the same idea again with a 3 by 3 matrix.").includes("reprint"), false);
	});
});
