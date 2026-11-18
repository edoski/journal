/**
 * Round 17, 2 m2: the four-topic Probability review's close named only
 * Conditional probability's return day; Binomial and Random variables
 * (Tue 10 Nov) and Inclusion-exclusion (18 Nov) got none. Every close he
 * asks for with Done for today names the day each topic he answered in the
 * session comes back: topics on one day together, and with three days or
 * more, the soonest and that the rest are on his calendar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DONE_TONIGHT_TEXT } from "../src/core/contracts/chat.ts";

test("every agent's Done for today asks for the day of each topic he answered (round 17, 2 m2)", () => {
	for (const [agent, text] of Object.entries(DONE_TONIGHT_TEXT)) {
		assert.match(text, /the day each topic he answered in this session comes back/, agent);
		assert.match(text, /the soonest and that the rest are on his calendar/, agent);
		assert.match(text, /at most two sentences/, `${agent}: the close stays short`);
	}
});
