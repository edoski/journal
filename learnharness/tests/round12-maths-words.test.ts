/**
 * Round 12, 3 D5: in the Invertible lesson a display set the sentence "A
 * is invertible exactly when det A ≠ 0" in KaTeX's serif, as
 * `$$A \text{ is invertible exactly when } \det A \neq 0$$`. Prose is never
 * set in maths type: a phrase inside `\text{…}` is refused, and the
 * sentence is written as prose with only its maths in `$…$`. A one- or
 * two-word label in a formula ($P(\text{correct} \mid \text{mastered})$,
 * $\text{Bayes risk}$) stays.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";

const rules = (text: string) => voiceBreaks(text, "teach").map((b) => b.rule);

describe("prose never in maths type", () => {
	it("the recorded display is refused", () => {
		const said = "A square matrix with $\\det A = 0$ squashes the plane.\n\n$$\nA \\text{ is invertible exactly when } \\det A \\neq 0\n$$";
		assert.ok(rules(said).includes("maths-words"), String(rules(said)));
	});

	it("a phrase inline in maths is refused too", () => {
		assert.ok(rules("So $\\dim \\ker A = 2 \\text{ because the rank is } 3$.").includes("maths-words"));
	});

	it("labels in a formula stay", () => {
		for (const said of ["The chance is $P(\\text{correct} \\mid \\text{mastered}) = 0.9$.", "Here $\\text{Bayes risk} = 0.1$.", "So $X \\sim \\text{Bin}(10, 1/4)$.", "$$\nf(x) = x^2 \\quad \\text{for } x > 0\n$$"]) assert.ok(!rules(said).includes("maths-words"), said);
	});
});
