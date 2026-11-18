/**
 * Round 8, maths on the screen (lesson reading m6): `\\tfrac` kept fractions
 * tiny inside displays, a 2 × 2 matrix sat inline in a question and doubled
 * its line, and inline maths broke across a line ("R₃ = / R₂ − R₁").
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { transformMathDelimiters } from "../src/core/math-delims.ts";

describe("maths on the screen (m6)", () => {
	it("sets a display's fractions at full size", () => {
		assert.equal(transformMathDelimiters("$$\nX \\sim \\text{Bin}(n, \\tfrac{4}{n})\n$$"), "$$\nX \\sim \\text{Bin}(n, \\frac{4}{n})\n$$");
		assert.equal(transformMathDelimiters("$$\n\\frac{4}{n}\n$$"), "$$\n\\frac{4}{n}\n$$", "a display keeps its fraction");
	});

	it("stands a matrix in a display of its own, out of the line, but not inside a list item", () => {
		const out = transformMathDelimiters("Is $M = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$ invertible, and why?");
		assert.match(out, /^Is \n\n\$\$\nM = \\begin\{pmatrix\}.*\\end\{pmatrix\}\n\$\$\n\n invertible, and why\?$/s);
		assert.equal(transformMathDelimiters("- item $\\begin{pmatrix}1\\end{pmatrix}$"), "- item $\\begin{pmatrix}1\\end{pmatrix}$");
	});

	it("never breaks an inline formula across lines", () => {
		const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
		assert.match(css, /\.katex \{ white-space: nowrap; \}/);
	});
});
