/**
 * Round 19, m17 (2 N3): "…a(1,1)+b(−1,1)... rather, as a(1,1)+b(1,−1)." in
 * a posed question, and again word for word after an Ask.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";

describe("m17: no slip corrected mid-sentence (2 N3)", () => {
	it("lens 2's question is refused, and a plain one passes", () => {
		const slip = "Take the eigenvectors $(1,1)$ and $(1,-1)$ and instead write each one as $a(1,1)+b(-1,1)$... rather, as $a(1,1)+b(1,-1)$. What do you expect $A$ does to each?";
		assert.ok(voiceBreaks(slip).some((b) => b.rule === "self-correction"));
		assert.ok(voiceBreaks("It is the kernel, or rather its dimension, that rank-nullity counts.").some((b) => b.rule === "self-correction"));
		assert.ok(!voiceBreaks("Write each vector as $a(1,1)+b(1,-1)$ rather than in the standard basis. What are $a$ and $b$ for $(3,1)$?").some((b) => b.rule === "self-correction"));
	});
});
