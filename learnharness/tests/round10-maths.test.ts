/**
 * Round 10, maths on the screen (practice m6, lesson reading m5): a matrix
 * written as a one-line $$…$$ inside a sentence set inline with its period
 * detached ("Take B = (2 1; 0 3) . Which…"), "$x$-axis" broken between "x"
 * and "-axis", a stacked `\dfrac` doubling a question's line, and displays
 * and inline maths that chain two steps into one line.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transformMathDelimiters } from "../src/core/math-delims.ts";
import { chainedDisplay } from "../src/core/voice-check.ts";

const B = "B = \\begin{pmatrix} 2 & 1 \\\\ 0 & 3 \\end{pmatrix}";

describe("a matrix inside a sentence (2 m6)", () => {
	it("stands on its own line with its punctuation, however it was written", () => {
		assert.equal(transformMathDelimiters(`Take $$${B}$$. Which of the axis vectors does $B$ keep?`), `Take \n\n$$\n${B}.\n$$\n\n Which of the axis vectors does $B$ keep?`);
		assert.equal(transformMathDelimiters(`Take \\(${B}\\). Which?`), `Take \n\n$$\n${B}.\n$$\n\n Which?`);
	});

	it("leaves a one-line $$…$$ with no matrix inline, as before", () => {
		assert.equal(transformMathDelimiters("where $$x^2$$ grows"), "where $$x^2$$ grows");
	});
});

describe("a word joined to inline maths by a hyphen (2 m6)", () => {
	it("stays prose held to the formula by a word joiner, so the line never breaks inside it and the word keeps the prose's type (round 11, 2 n9)", () => {
		assert.equal(transformMathDelimiters("whose only eigenline is the $x$-axis."), "whose only eigenline is the $x$\u2060-axis.");
		assert.equal(transformMathDelimiters("a $2 \\times 2$-matrix-like case"), "a $2 \\times 2$\u2060-matrix-like case");
		assert.equal(transformMathDelimiters("a $4$-dimensional subspace"), "a $4$\u2060-dimensional subspace", "never \\text{-dimensional}, set in maths type");
		assert.equal(transformMathDelimiters("the $x$ - axis"), "the $x$ - axis", "a spaced dash is not a joined word");
	});
});

describe("a stacked fraction inside a line (3 m5)", () => {
	it("is set as a slash, as \\frac is", () => {
		assert.equal(transformMathDelimiters("Take $P(X = k) = c \\cdot \\dfrac{3^k}{k!}$ for each $k$."), "Take $P(X = k) = c \\cdot 3^k/k!$ for each $k$.");
	});
});

describe("two steps chained into one line (3 m5)", () => {
	it("is refused in a display joined by words, and inline with two kinds of relation", () => {
		assert.ok(chainedDisplay("$$c \\sum_k \\frac{3^k}{k!} = c e^3 = 1, \\text{ so } c = e^{-3}$$"));
		assert.ok(chainedDisplay("so $3n \\ln(1 + 2/n) \\approx 3n \\cdot 2/n = 6$."));
	});

	it("passes one relation chained of one kind, and inline maths with one relation", () => {
		assert.equal(chainedDisplay("$$a = b + c = d$$"), null);
		assert.equal(chainedDisplay("so $P(X = k) = 0.2$ here"), null);
	});
});
