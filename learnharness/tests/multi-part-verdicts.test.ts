/**
 * Part (a) never confirmed (round 11, 3 n8): on a two-part answer whose
 * part (a) was right and part (b) broke, the reply named only the break;
 * the verdict that (a) was right went to the conclude, which he does not
 * read as feedback. The practice doctrine now opens a reply to a
 * multi-part answer with each part's verdict.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const DOCTRINE = readFileSync(new URL("../src/agent/prompts/practice/10-doctrine.md", import.meta.url), "utf8");

describe("a reply to an answer with several parts", () => {
	it("opens with each part's verdict, in his words", () => {
		assert.match(DOCTRINE, /A reply to an answer with several parts opens with each part's verdict in one sentence \("Part \(a\) is right; part \(b\) breaks at the kernel's dimension\."\)/);
	});
});
