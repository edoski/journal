/**
 * Round 9, maths on the screen (lesson reading m6, practice m12): inline
 * fractions such as −15/n and the binomial expansion set at two thirds of
 * the text, a `\displaystyle` limit doubling a question's line, and a
 * matrix lifted out of "Take $A = …$. Before computing anything" leaving
 * the next line to start with its full stop.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transformMathDelimiters } from "../src/core/math-delims.ts";

describe("maths inside a line keeps the line's size (m6)", () => {
	it("sets inline fractions as a slash, with parentheses only where the slash would misread", () => {
		assert.equal(transformMathDelimiters("Your logarithm $-\\frac{15}{n}$ is right."), "Your logarithm $-15/n$ is right.");
		assert.equal(transformMathDelimiters("so $2n \\cdot \\left(-\\frac{1}{n}\\right) = -2$"), "so $2n \\cdot \\left(-1/n\\right) = -2$");
		assert.equal(transformMathDelimiters("$\\frac{n(n-1)\\cdots(n-k+1)}{k!}$"), "$n(n-1)\\cdots(n-k+1)/k!$");
		assert.equal(transformMathDelimiters("$p = \\frac{\\lambda}{n}$"), "$p = \\lambda/n$");
		assert.equal(transformMathDelimiters("$\\frac{a+b}{2n}$"), "$(a+b)/(2n)$");
		assert.equal(transformMathDelimiters("$\\tfrac12$"), "$1/2$");
	});

	it("drops \\displaystyle inside a line, so a limit's subscript sits beside it", () => {
		assert.equal(transformMathDelimiters("What is $\\displaystyle\\lim_{n\\to\\infty}\\left(1-\\frac{3}{n}\\right)^5$?"), "What is $\\lim_{n\\to\\infty}\\left(1-3/n\\right)^5$?");
	});

	it("keeps a display's fractions", () => {
		assert.equal(transformMathDelimiters("$$\n\\left(1-\\frac{1}{n}\\right)^{2n}\n$$"), "$$\n\\left(1-\\frac{1}{n}\\right)^{2n}\n$$");
	});
});

describe("a clause's full stop stays with its formula (practice m12)", () => {
	it("moves the full stop after a lifted matrix into its display", () => {
		const out = transformMathDelimiters("Take $A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$. Before computing anything, guess.");
		assert.equal(out, "Take \n\n$$\nA = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}.\n$$\n\n Before computing anything, guess.");
		assert.doesNotMatch(out, /\n\s*\./);
	});

	it("does the same for an old \\[ … \\] display written inside a line", () => {
		assert.doesNotMatch(transformMathDelimiters("Take \\[ A = 2 \\], then go on."), /\n\s*,/);
	});
});
