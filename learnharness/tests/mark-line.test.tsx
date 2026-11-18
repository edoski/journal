/** The mark line under his answer (mark-line.md). */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { MarkLine } from "../components/lesson/mark-line.tsx";
import { AnswerMarksProvider } from "../components/answer-mark.tsx";
import type { AnswerMark } from "../src/core/index.ts";

const noop = () => {};

describe("the mark line", () => {
	const mark: AnswerMark = {
		rows: [{ id: "r1", result: "correct", grade: "unaided", helped: false, sure: "confident", label: null }],
		disputed: false,
		changed: false,
	} as unknown as AnswerMark;
	const line = (marks: Record<string, AnswerMark>) =>
		renderToStaticMarkup(
			<AnswerMarksProvider value={{ marks, onDispute: noop, canDispute: true }}>
				<MarkLine answerId="a1" />
			</AnswerMarksProvider>,
		);

	it("says the result, how it counted and the confidence on one 13px line, with Dispute at its end", () => {
		const html = line({ a1: mark });
		assert.match(html, /data-testid="mark-line"/);
		assert.match(html, /text-body/);
		assert.match(html, /Right/);
		assert.match(html, /Confident/);
		assert.match(html, /data-testid="dispute-mark"/);
	});

	it("its facts end on the bubble's edge, and Dispute takes no room in the line while hidden", () => {
		const { document } = parseHTML(line({ a1: mark }));
		const facts = document.querySelector('[data-slot="mark-facts"]');
		assert.ok(facts, "the facts are one group");
		assert.match(facts!.className, /items-end/, "they end where his words end");
		const dispute = document.querySelector('[data-testid="dispute-mark"]')!;
		assert.match(dispute.className, /\babsolute\b/, "Dispute is drawn beside the facts, out of the line's flow");
		assert.ok(facts!.contains(dispute), "and placed against the facts, not the bubble");
	});

	it("gives each try of a problem its own line, its facts read across it", () => {
		const tries = {
			rows: [
				{ id: "r1", result: "partial", grade: "assisted", helped: false, sure: "guess", label: "First try" },
				{ id: "r2", result: "correct", grade: "assisted", helped: true, sure: "confident", label: "Then" },
			],
			disputed: false,
			changed: false,
		} as unknown as AnswerMark;
		const { document } = parseHTML(line({ a1: tries }));
		const facts = document.querySelector('[data-slot="mark-facts"]')!;
		assert.match(facts.className, /\bflex-col\b/, "the tries stack, one line each, never one row of chips");
		assert.match(facts.className, /\bitems-end\b/, "each line ends where his words end");
		const rows = [...document.querySelectorAll('[data-testid="mark-row"]')];
		assert.deepEqual(rows.map((r) => r.textContent), ["First tryPartly rightOn your ownGuessing", "ThenRightWith helpConfident"]);
	});

	it("says a dispute was ruled on and whether the mark stood, never the ruling the reply says (round 16, m20)", () => {
		const stood = parseHTML(line({ a1: { ...mark, disputed: true, changed: false } })).document.querySelector('[data-testid="mark-disputed"]');
		assert.equal(stood?.textContent, "Disputed · the mark stands");
		const changed = parseHTML(line({ a1: { ...mark, disputed: true, changed: true } })).document.querySelector('[data-testid="mark-disputed"]');
		assert.equal(changed?.textContent, "Disputed · the mark changed");
		assert.doesNotMatch(line({ a1: { ...mark, disputed: true, changed: false, ruling: "The question asked why." } as AnswerMark }), /asked why/);
	});

	it("draws nothing until the engine holds a mark", () => {
		assert.equal(line({}), "");
	});
});
