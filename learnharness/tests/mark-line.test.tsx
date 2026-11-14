/** The mark line under his answer (mark-line.md). */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { MarkLine } from "../components/lesson/mark-line.tsx";
import { AnswerMarksProvider } from "../components/answer-mark.tsx";
import type { AnswerMark } from "../src/core/index.ts";

const noop = () => {};

describe("the mark line", () => {
	const mark: AnswerMark = {
		rows: [{ id: "r1", result: "correct", grade: "unaided", helped: false, sure: "confident", label: null }],
		disputed: false,
		ruling: null,
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
		assert.match(html, /text-row/);
		assert.match(html, /Right/);
		assert.match(html, /Confident/);
		assert.match(html, /data-testid="dispute-mark"/);
	});

	it("its facts end on the bubble's edge, and Dispute takes no room in the line while hidden", () => {
		const { document } = parseHTML(line({ a1: mark }));
		const facts = document.querySelector('[data-slot="mark-facts"]');
		assert.ok(facts, "the facts are one group");
		assert.match(facts!.className, /justify-end/, "they end where his words end");
		const dispute = document.querySelector('[data-testid="dispute-mark"]')!;
		assert.match(dispute.className, /\babsolute\b/, "Dispute is drawn beside the facts, out of the line's flow");
		assert.ok(facts!.contains(dispute), "and placed against the facts, not the bubble");
	});

	it("draws nothing until the engine holds a mark", () => {
		assert.equal(line({}), "");
	});
});
