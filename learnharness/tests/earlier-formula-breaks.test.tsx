/**
 * An Earlier row's formula wider than the row breaks after a top-level
 * relation or operator instead of running past the column (round 14, m37:
 * 2 n1, "P(X≥2)=1−P(X=0)−P(X=1)≈0.756" was one 297px box in a column that
 * clips at 612px, read "≈ 0.7"). KaTeX gives each top-level piece its own
 * box, so a power or a fraction never splits; the app's rule that keeps an
 * inline formula on one line (round 8, in a lesson's prose) gives way only
 * in an Earlier row.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { AttemptEntry } from "../components/unit-inbox/topic-page/hybrid/history.tsx";
import type { TopicAttempt } from "../src/core/contracts/topic.ts";

const ATTEMPT = {
	id: "o5", date: "2026-11-08", recorded: null, result: "correct", unaided: true, grade: "solid", gaveUp: false, predicted: false, uncertain: false, sure: "confident", chose: null,
	text: "Found $P(X\\geq 2)=1-P(X=0)-P(X=1)\\approx 0.756$ by the complement",
} as unknown as TopicAttempt;

const css = readFileSync(join(import.meta.dirname, "..", "app", "globals.css"), "utf8");

describe("an Earlier row's long formula (m37)", () => {
	it("is typeset in KaTeX's top-level pieces, with nothing holding them in one box", () => {
		const html = renderToStaticMarkup(<ul><AttemptEntry attempt={ATTEMPT} titleOf={(h) => h} ends={{ above: false, below: false }} date="Today" /></ul>);
		const { document } = parseHTML(`<html><body>${html}</body></html>`);
		const text = document.querySelector('[data-slot="topic-attempt-text"]');
		assert.ok(text !== null, "the row's sentence");
		assert.ok(!(text.getAttribute("class") ?? "").includes("inline-block"), "no class holds the formula in one box");
		const pieces = text.querySelectorAll(".katex .katex-base");
		assert.ok(pieces.length >= 4, `a break point after each relation and operator: ${pieces.length} pieces`);
	});

	it("lets those pieces wrap in an Earlier row only, every other inline formula staying on one line", () => {
		const nowrap = css.search(/^\.katex\s*\{\s*white-space:\s*nowrap;\s*\}/m);
		const earlier = css.search(/^\[data-slot="topic-attempt-text"\]\s+\.katex\s*\{\s*white-space:\s*normal;\s*\}/m);
		assert.ok(nowrap >= 0, "inline maths stays on one line in prose (round 8)");
		assert.ok(earlier > nowrap, "an Earlier row's rule, unlayered and after it, wins");
		const before = css.slice(0, earlier);
		assert.equal((before.match(/\{/g) ?? []).length, (before.match(/\}/g) ?? []).length, "outside any @layer or block");
	});
});

describe("a wrapping formula's brackets (m37)", () => {
	it("holds the pieces between a bracket and its close on one line, so it breaks only outside every bracket", async () => {
		const katex = (await import("katex")).default;
		const { holdBrackets } = await import("../components/ui/math-text.tsx");
		const raw = katex.renderToString("P(X\\geq 2)=1-P(X=0)-P(X=1)\\approx 0.756", { output: "htmlAndMathml" });
		const held = holdBrackets(raw);
		const { document } = parseHTML(`<html><body>${held}</body></html>`);
		const root = document.querySelector(".katex-html")!;
		const top = [...root.children].map((el) => (el.getAttribute("class") === "katex-hold" ? `[${el.textContent}]` : el.textContent));
		assert.deepEqual(top, ["[P(X≥2)=]", "1−", "[P(X=0)−]", "[P(X=1)≈]", "0.756"], "a break after =, after 1−, after each closed bracket");
		assert.equal(document.querySelector(".katex-html")!.textContent, parseHTML(`<html><body>${raw}</body></html>`).document.querySelector(".katex-html")!.textContent, "nothing lost");
		assert.equal(holdBrackets("<span>plain</span>"), "<span>plain</span>", "anything else as it was");
		assert.match(css, /^\.katex-hold\s*\{\s*white-space:\s*nowrap;\s*\}/m, "a held run never breaks");
	});
});
