/**
 * A one-line label cut where it may end (math-line.md): at spaces, never
 * inside a formula, a formula and the word glued to it one piece.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mathPrefix, mathUnits } from "../components/ui/math-line.tsx";

describe("where a title with formulas may be cut", () => {
	it("cuts at spaces and keeps each formula whole, with the word glued to it", () => {
		assert.deepEqual(mathUnits("Product construction for $M_1 \\times M_2$"), ["Product ", "construction ", "for ", "$M_1 \\times M_2$"]);
		assert.deepEqual(mathUnits("$\\sigma$-algebras and measures"), ["$\\sigma$-algebras ", "and ", "measures"]);
		assert.deepEqual(mathUnits("Plain title"), ["Plain ", "title"]);
	});

	it("ends a shortened title on the last whole piece, then an ellipsis", () => {
		const units = mathUnits("Product construction for $M_1 \\times M_2$");
		assert.equal(mathPrefix(units, 3), "Product construction for…");
		assert.equal(mathPrefix(units, 4), "Product construction for $M_1 \\times M_2$");
		assert.equal(mathPrefix(units, 9), "Product construction for $M_1 \\times M_2$");
	});
});
