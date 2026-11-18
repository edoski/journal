/**
 * Round 17, m20 (4 minor 9): the Linear maps probe asked "A linear map h
 * sends (1,1) to (2,0) and (1,−1) to (0,4)" with each vector a column
 * matrix, so the question spanned six lines with "to" and "and" alone.
 * A short vector is written inline as a tuple; display maths stays for
 * matrices and equations. The voice refuses the column, and the
 * formatting prompt says so.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks, promptVoiceBreaks } from "../src/core/voice-check.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

// The lens's question, as the record holds it.
const LENS = "A linear map $h \\colon \\mathbb{R}^2 \\to \\mathbb{R}^2$ sends $\\begin{pmatrix}1\\\\1\\end{pmatrix}$ to $\\begin{pmatrix}2\\\\0\\end{pmatrix}$ and $\\begin{pmatrix}1\\\\-1\\end{pmatrix}$ to $\\begin{pmatrix}0\\\\4\\end{pmatrix}$. What is $h\\begin{pmatrix}3\\\\1\\end{pmatrix}$, and why?";
const rules = (text: string) => voiceBreaks(text).map((b) => b.rule);

describe("short vectors are written inline (round 17, m20)", () => {
	it("the lens's question is refused, and so is a display holding a vector alone", () => {
		assert.ok(rules(LENS).includes("vector"));
		assert.ok(rules("The image is\n$$\\begin{bmatrix} 2 \\\\ 0 \\end{bmatrix}.$$").includes("vector"));
	});

	it("the same question with tuples, a matrix display and a matrix equation go through", () => {
		assert.ok(!rules("A linear map $h$ sends $(1,1)$ to $(2,0)$ and $(1,-1)$ to $(0,4)$. What is $h(3,1)$, and why?").includes("vector"));
		assert.ok(!rules("Take\n$$A = \\begin{pmatrix} 0 & -1 \\\\ 1 & 0 \\end{pmatrix}.$$").includes("vector"));
		assert.ok(!rules("Solve\n$$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}\\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} 5 \\\\ 6 \\end{pmatrix}.$$").includes("vector"));
	});

	it("every prompt says it, in the voice", () => {
		for (const kind of ["prober", "teacher", "practice"] as const) {
			const prompt = composeInstructions(kind);
			assert.match(prompt, /A short vector is not a matrix: write it inline as a tuple/, kind);
			assert.deepEqual(promptVoiceBreaks(prompt), [], kind);
		}
	});
});
