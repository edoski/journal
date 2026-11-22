/**
 * Round 19, m19 (4 minor 4): "I was wrong earlier to say your review days
 * don't fit the date", about nothing he was shown.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";

describe("m19: no unasked correction of its own words (4 minor 4)", () => {
	it("lens 4's line is refused", () => {
		assert.ok(voiceBreaks("I was wrong earlier to say your review days don't fit the date, since the days in your calendar are right.").some((b) => b.rule === "own-words"));
	});
});
