/**
 * A slash fraction that reads two ways (round 11, 3 n11): "E = 1/2I",
 * "1/nᵏ (n k)" and "1/1000² (1000 2)". An inline fraction set as a slash
 * with a factor straight after it, or before it, is bracketed whole, so
 * the slash covers what it covers and no more.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transformMathDelimiters } from "../src/core/math-delims.ts";

describe("an inline fraction beside a factor", () => {
	it("is bracketed whole, so the slash never takes in the factor", () => {
		assert.equal(transformMathDelimiters("Let $E = \\frac{1}{2}I$, the matrix that halves."), "Let $E = (1/2)I$, the matrix that halves.");
		assert.equal(transformMathDelimiters("so $\\frac{1}{n^k}\\binom{n}{k}$ tends to"), "so $(1/n^k)\\binom{n}{k}$ tends to");
		assert.equal(transformMathDelimiters("is $\\frac{1}{1000^2} \\binom{1000}{2}$ here"), "is $(1/1000^2) \\binom{1000}{2}$ here");
		assert.equal(transformMathDelimiters("is $2\\frac{1}{3}$ here"), "is $2(1/3)$ here");
	});

	it("stays bare beside an operator, a relation or the end", () => {
		assert.equal(transformMathDelimiters("is $\\frac{1}{2} + x$ here"), "is $1/2 + x$ here");
		assert.equal(transformMathDelimiters("is $x = \\frac{1}{2}$, so"), "is $x = 1/2$, so");
		assert.equal(transformMathDelimiters("is $c \\cdot \\frac{3^k}{k!}$ here"), "is $c \\cdot 3^k/k!$ here");
		assert.equal(transformMathDelimiters("is $(\\frac{1}{2})$ here"), "is $(1/2)$ here");
	});
});
