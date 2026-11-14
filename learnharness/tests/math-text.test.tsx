/**
 * MathText (components/ui/math-text.md): a one-line label's TeX typeset
 * inline, money left alone, and the plain words an attribute takes.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MathText, mathPieces, mathPlain } from "../components/ui/math-text.tsx";

describe("MathText", () => {
	it("typesets $…$, \\(…\\) and $$…$$ inline, beside the words", () => {
		for (const label of ["$\\sigma$-algebras", "The map \\(f: \\mathbb{R}\\to\\mathbb{R}\\)", "$$\\int_0^1 x\\,dx$$ as area"]) {
			const html = renderToStaticMarkup(<MathText>{label}</MathText>);
			assert.match(html, /class="katex"/, label);
			assert.doesNotMatch(html, /katex-display/, `${label} stays inline`);
		}
		assert.match(renderToStaticMarkup(<MathText>{"$\\sigma$-algebras"}</MathText>), /<\/span>-algebras<\/span>$/, "the words follow the formula");
	});

	it("leaves a label with no formula as plain text, money included", () => {
		assert.equal(renderToStaticMarkup(<MathText>{"Rank and the column space"}</MathText>), "Rank and the column space");
		assert.deepEqual(mathPieces("Costs $5 and $10"), [{ kind: "text", text: "Costs $5 and $10" }]);
		assert.deepEqual(mathPieces("\\$5, then $x^2$"), [
			{ kind: "text", text: "$5, then " },
			{ kind: "math", tex: "x^2" },
		]);
	});

	it("shows a formula KaTeX cannot read as its TeX rather than throwing", () => {
		assert.match(renderToStaticMarkup(<MathText>{"Broken $\\frac{1}{$ here"}</MathText>), /Broken/);
	});

	it("flattens formulas to words for attributes", () => {
		assert.equal(mathPlain("$\\sigma$-algebras"), "σ-algebras");
		assert.equal(mathPlain("Maps \\(f: \\mathbb{R}\\to\\mathbb{R}\\)"), "Maps f: ℝ→ℝ");
		assert.equal(mathPlain("$\\frac{a}{b}$ and $x\\,y$"), "a/b and x y");
		assert.equal(mathPlain("Plain"), "Plain");
	});

	it("keeps a formula and the letters touching it on one line, as one word", () => {
		const html = renderToStaticMarkup(<MathText>{"Nondeterministic finite automata (NFA) with $\\varepsilon$-moves"}</MathText>);
		const word = html.match(/<span data-slot="math-word" class="whitespace-nowrap">(.*?)<\/span>-moves<\/span>/);
		assert.ok(word, "ε and -moves share one unbreakable word");
		assert.match(html, /^Nondeterministic finite automata \(NFA\) with <span data-slot="math-word"/, "the words before it still wrap");
		assert.match(renderToStaticMarkup(<MathText>{"Kernel of $A$, then rank"}</MathText>), /<span data-slot="math-word" class="whitespace-nowrap"><span data-slot="math-text".*?<\/span>,<\/span> then rank$/);
	});

	it("keeps a lone symbol and its hyphenated word together in plain titles", () => {
		for (const label of ["Computing the ε-closure", "The k-means idea", "(ε-NFA) runs"]) {
			assert.match(renderToStaticMarkup(<MathText>{label}</MathText>), /data-slot="math-word"/, label);
		}
		assert.equal(renderToStaticMarkup(<MathText>{"Rank-nullity and well-defined maps"}</MathText>), "Rank-nullity and well-defined maps");
	});
});
