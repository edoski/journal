/**
 * Round 19, m21 (2 N8, 2 N10, 3 n1; round-18 m4's remainder). After a Hint
 * the transcript's "Your turn" sat alone under the cue with no question
 * after it (`2` `05-hint`, `3` `08`). And "Your turn · What next on
 * eigenvalues? · Practice problems now · Stop here for today" headed an
 * offer, which asks nothing of him (`2` `61`). Now no "Your turn" stands
 * without a question under it or the words "on the question above", and an
 * offer to go on has none. Round 20, m9: after a Hint it is "on the
 * question above" too, with no question posted again.
 */
import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";

const check = { question: "Which lines through the origin does $T$ map onto themselves?", correctAnswer: "The eigenvector lines.", type: "check" };
const offer = { question: "What next on eigenvalues?", options: [{ label: "Practice problems now" }, { label: "Stop here for today", stops: true }] };
const choice = { question: "Which is an eigenvector of $T$?", options: [{ label: "(1, 1)" }, { label: "(1, 0)" }] };

/** The open question as drawn, and what follows its "Your turn". */
function drawn(node: React.ReactElement): { turn: string | null; below: string } {
	const { document } = parseHTML(`<div>${renderToStaticMarkup(node)}</div>`);
	const mark = document.querySelector('[data-slot="your-turn"]');
	const all = document.querySelector('[data-slot="prose-question"]')?.textContent ?? "";
	return { turn: mark?.textContent ?? null, below: mark ? all.slice(all.indexOf(mark.textContent!) + mark.textContent!.length).trim() : "" };
}

/** The rule: no "Your turn" without a question under it or "on the question above". */
function heldBy(view: { turn: string | null; below: string }): boolean {
	return view.turn === null || view.turn === "Your turn, on the question above" || view.below !== "";
}

describe("the transcript's Your turn (round 19, m21)", () => {
	it("after a hint or his side question, the mark points at the question above (round 20, m9)", () => {
		const view = drawn(<ProseQuestion tool="explain" toolCallId="q2" input={check} open repeat />);
		assert.equal(view.turn, "Your turn, on the question above");
	});

	it("an offer to go on, with a stop for today among its options, has no Your turn", () => {
		const view = drawn(<ProseQuestion tool="ask_user_question" toolCallId="o1" input={offer} open />);
		assert.equal(view.turn, null);
	});

	it("a question that asks him something keeps it", () => {
		for (const [tool, input] of [["explain", check], ["ask_user_question", choice]] as const) {
			const view = drawn(<ProseQuestion tool={tool} toolCallId="q1" input={input} open />);
			assert.equal(view.turn, "Your turn");
			assert.ok(heldBy(view), JSON.stringify(view));
		}
	});
});
