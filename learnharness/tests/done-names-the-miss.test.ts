/**
 * Done for today pressed while his answer was being graded (round 11, 4
 * minor 1): the card read "Partly right · On your own", then straight to
 * "Done for today" and the review days; what was missing ("Left out why
 * eigenvalues are the roots of det(A − λI)") was only in the record. Every
 * agent's Done text now says an answer sent before it is graded as usual,
 * and one not fully right gets one sentence on what it missed, as its own
 * message before the close.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DONE_TONIGHT_TEXT } from "../src/core/contracts/chat.ts";

describe("Done for today after an answer he sent", () => {
	for (const [agent, text] of Object.entries(DONE_TONIGHT_TEXT)) {
		it(`tells the ${agent} to say what a graded answer missed before the close`, () => {
			assert.match(text, /An answer he sent before pressing it is still graded and saved as usual; when it was not fully right, first say in one sentence what it missed, as its own message, then close/);
		});
	}
});
