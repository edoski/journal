/**
 * An Earlier row never cuts inside a formula (round 13, 2 n1): Binomial's
 * page read "Found P(X=2) = (6 2)" with "2" and "4" floating alone, since
 * the two-line clamp hid the bases (0.4) and (0.6) but not their raised
 * exponents. Each formula is one box: one that does not fit goes to the
 * hidden line whole. Since round 13, 1 n11 ("…4, n…" and "from…" cut in
 * the 320px column beside an empty half-pane), an Earlier row wraps
 * whole: Earlier moves the days that do not fit behind "Show the rest",
 * so no clamp is needed and no formula is cut at all.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { AttemptEntry } from "../components/unit-inbox/topic-page/hybrid/history.tsx";
import type { TopicAttempt } from "../src/core/contracts/topic.ts";

const ATTEMPT = {
	id: "o14", date: "2026-11-08", recorded: null, result: "correct", unaided: true, grade: "solid", gaveUp: false, predicted: false, uncertain: false, sure: "confident", chose: null,
	text: "Found $P(X=2) = \\binom{6}{2}(0.4)^2(0.6)^4 \\approx 0.311$ for six trials with success chance 0.4, counting the arrangements first",
} as unknown as TopicAttempt;

describe("an Earlier row keeps each formula whole (2 n1)", () => {
	it("draws the row's formulas as single boxes in a sentence that wraps whole (1 n11)", () => {
		const html = renderToStaticMarkup(<ul><AttemptEntry attempt={ATTEMPT} titleOf={(h) => h} ends={{ above: false, below: false }} date="Today" /></ul>);
		const { document } = parseHTML(`<html><body>${html}</body></html>`);
		const text = document.querySelector('[data-slot="topic-attempt-text"]');
		assert.ok(text !== null, "the row's sentence");
		const classes = (text.getAttribute("class") ?? "").split(/\s+/);
		assert.ok(!classes.some((c) => /^(line-clamp-\d|truncate)$/.test(c)), `never cut while the pane has room: ${classes.join(" ")}`);
		assert.ok(!classes.includes("[&_.katex]:inline-block"), "a formula wider than the row may break at its relations (round 14, m37)");
		assert.ok(text.querySelector(".katex") !== null, "the formula is typeset");
	});
});
