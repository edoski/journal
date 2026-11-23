/**
 * Round 17, 2 m2: the four-topic Probability review's close named only
 * Conditional probability's return day; Binomial and Random variables
 * (Tue 10 Nov) and Inclusion-exclusion (18 Nov) got none. Every close he
 * asks for with Done for today names the day each topic he answered in the
 * session comes back. Since round 20 (M3) those days are the close
 * receipt's, copied whole, and none is left "on your calendar".
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DONE_TONIGHT_TEXT } from "../src/core/contracts/chat.ts";

test("every agent's Done for today asks for the day of each topic he answered (round 17, 2 m2)", () => {
	for (const [agent, text] of Object.entries(DONE_TONIGHT_TEXT)) {
		assert.match(text, /copy `close.says` as written, which says first where the question he left open waits and the day he picks it up, then names exactly the topics this session answered, each with its day/, agent);
		assert.match(text, /never "on your calendar", "next time" or "a later day"/, agent);
		assert.match(text, /at most two sentences/, `${agent}: the close stays short`);
	}
});
