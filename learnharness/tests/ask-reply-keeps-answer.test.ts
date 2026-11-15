/**
 * A side question while a question waits is answered without working the
 * open question (round 10, 2 m9): asked whether THHTT differs while the
 * HTTHT question waited, the reply gave "two of 0.3 and three of 0.7", so
 * his next answer was honestly With help and cost him a counted answer on
 * his own. What the dismissal tells the tutor now says so.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ASKED_INSTEAD_TEXT } from "../src/core/question-core.ts";

describe("a side question while a question waits", () => {
	it("is answered without working the open question for him", () => {
		assert.match(ASKED_INSTEAD_TEXT, /answer his message without working the open question for him \(no step, value or factor of its answer/);
	});
});
