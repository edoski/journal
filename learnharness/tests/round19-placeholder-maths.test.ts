/**
 * Round 19, m25 (1 n5, `87`). The binomial coefficients page's composer read
 * "Ask a question or paste a problem on Combinations and binomial
 * coefficients binomnj": its title's $\binom{n}{j}$, stripped of its TeX.
 * A plain-text label now reads a formula it knows in words and drops one it
 * cannot read, never leaving TeX's remains.
 */
import assert from "node:assert/strict";
import { it } from "node:test";
import { courseComposerPlaceholder } from "../components/course-page/course-composer.tsx";
import { mathPlain } from "../components/ui/math-text.tsx";

it("a topic's maths reads as words in its composer's placeholder, never as stripped TeX (round 19, m25)", () => {
	assert.equal(courseComposerPlaceholder("Probability", "Combinations and binomial coefficients $\\binom{n}{j}$"), "Ask a question or paste a problem on Combinations and binomial coefficients C(n, j)");
});

it("a formula with a command it cannot read is dropped, and the words around it stay whole", () => {
	assert.equal(mathPlain("Roots $\\sqrt[3]{x}$ and powers"), "Roots and powers");
	assert.equal(mathPlain("Limits $\\overline{\\lim}$, then sums"), "Limits, then sums");
	assert.equal(mathPlain("$\\sigma$-algebras on $\\mathbb{R}$"), "σ-algebras on ℝ");
	assert.equal(mathPlain("The map $x \\mapsto \\lambda x$"), "The map x ↦ λ x");
});
