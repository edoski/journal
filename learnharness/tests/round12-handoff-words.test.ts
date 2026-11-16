/**
 * Round 12, 3 D4: Explain instead in Rank practice sent "Switching to an
 * explanation of when three vectors form a basis of ℝ³." before handing
 * over to teaching. The handoff needs no words of its own: the explanation
 * is what he reads. A line that narrates the switch is refused, as any
 * narration of what the tutor does.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";

const rules = (text: string) => voiceBreaks(text, "teach").map((b) => b.rule);

describe("a handoff never narrates itself", () => {
	it("the recorded line is refused", () => {
		assert.ok(rules("Switching to an explanation of when three vectors form a basis of $\\mathbb{R}^3$.").includes("narration"));
	});

	it("other ways of announcing the switch are refused", () => {
		for (const said of ["Moving on to practice now.", "Let's switch to an explanation of rank.", "Back to the problems.", "Switching back to practice.", "Turning to the teaching of the kernel."]) assert.ok(rules(said).includes("narration"), said);
	});

	it("maths that switches or moves is no narration", () => {
		for (const said of ["Switching two rows changes the sign of the determinant.", "Moving the pivot to the left leaves the rank unchanged.", "Back substitution gives $x_1 = 2$.", "Go back to the problem and redo its second row."]) assert.ok(!rules(said).includes("narration"), said);
	});
});
