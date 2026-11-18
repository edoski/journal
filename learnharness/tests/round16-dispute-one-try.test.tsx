/**
 * Round 16, m19 (2 m3): disputing a First try / Then card never said which
 * try. The dialog read "Marked Partly right · On your own, Right · With
 * help", its picks set no try in particular, and the stamp read "You
 * think: Right". Each try now has its own Dispute: the dialog names the
 * try, the tutor is sent that try's attempt alone, and the stamp names it.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { MarkLine } from "../components/lesson/mark-line.tsx";
import { AnswerMarksProvider, disputedRows, markedWords } from "../components/answer-mark.tsx";
import { disputeStampWords } from "../components/study-words.ts";
import { ChatInputError, parseChatInput } from "../src/core/input-events.ts";
import { disputeText } from "../src/core/contracts/chat.ts";
import type { AnswerMark, MarkRow } from "../src/core/index.ts";

const row = (id: string, label: string, result: MarkRow["result"], helped: boolean): MarkRow => ({ id, topics: ["rank"], label, result, grade: "helped", helped, predicted: false, gaveUp: false, uncertain: false, sure: null });
const TRIES: AnswerMark = { rows: [row("o41", "First try", "partial", false), row("o42", "Then", "correct", true)], disputed: false, changed: false };
const ONE: AnswerMark = { rows: [{ ...row("o7", "", "partial", false), label: null }], disputed: false, changed: false };

const line = (mark: AnswerMark) =>
	parseHTML(
		renderToStaticMarkup(
			<AnswerMarksProvider value={{ marks: { a1: mark }, onDispute: () => {}, canDispute: true }}>
				<MarkLine answerId="a1" />
			</AnswerMarksProvider>,
		),
	).document;

describe("one Dispute per try (round 16, m19)", () => {
	it("gives each try of a card its own Dispute, named for a screen reader; one try keeps one", () => {
		const presses = [...line(TRIES).querySelectorAll('[data-testid="dispute-mark"]')];
		assert.deepEqual(presses.map((p) => [p.getAttribute("data-row"), p.getAttribute("aria-label")]), [["o41", "Dispute: First try"], ["o42", "Dispute: Then"]]);
		assert.equal(line(ONE).querySelectorAll('[data-testid="dispute-mark"]').length, 1);
	});

	it("disputes only the try pressed, and the dialog's first words name it", () => {
		const first = disputedRows(TRIES, { answerId: "a1", rowId: "o41" });
		assert.deepEqual(first.map((r) => r.id), ["o41"]);
		assert.equal(markedWords(first), "First try: marked Partly right · On your own");
		assert.equal(markedWords(disputedRows(ONE, { answerId: "a1" })), "Marked Partly right · On your own");
	});

	it("tells the tutor which try, with its attempt alone, and the stamp names it", () => {
		const input = parseChatInput({ type: "dispute", answerId: "a1", observations: ["o41"], row: "First try", proposed: "correct" });
		assert.deepEqual(input, { type: "dispute", answerId: "a1", observations: ["o41"], row: "First try", proposed: "correct" });
		assert.throws(() => parseChatInput({ type: "dispute", answerId: "a1", observations: ["o41"], row: " ", proposed: "correct" }), ChatInputError);
		const text = disputeText({ observations: ["o41"], row: "First try", proposed: "correct" }, "Is Ax = b solvable for every b?");
		assert.match(text, /"First try"; the attempt that stands for that try: o41\. Re-judge that try only\./);
		assert.equal(disputeStampWords({ row: "First try", proposed: "correct" }), "You disputed the mark · First try · You think: Right");
		assert.equal(disputeStampWords({ proposed: "correct" }), "You disputed the mark · You think: Right", "one try: as before");
	});
});
