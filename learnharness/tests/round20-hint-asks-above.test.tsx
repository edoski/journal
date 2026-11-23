/**
 * Round 20, m9 (2 n1, 3 n1): the Hint path. Lens 2 typed "60 − 30 − 20 −
 * 12 = −2?? that cannot be right" on "Now Inclusion-exclusion principle:
 * how many integers from 1 to 60 are divisible by none of 2, 3 and 5, and
 * why?" and pressed Hint; the tutor asked again "How many integers from 1
 * to 60…", printed in full under "Your turn", and the box stayed empty,
 * even after a reload: the words waited in the carry for a re-ask whose
 * words differ. Lens 3 saw the question posted again word for word right
 * under its first posting. After a hint the next question of its kind on
 * its step is the question asked again, whatever its words: it reads
 * "Your turn, on the question above", with no second posting, and takes
 * his words back into its box.
 */
import React from "react";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

class MemoryStorage {
	private map = new Map<string, string>();
	get length() { return this.map.size; }
	key(i: number) { return [...this.map.keys()][i] ?? null; }
	getItem(k: string) { return this.map.get(k) ?? null; }
	setItem(k: string, v: string) { this.map.set(k, v); }
	removeItem(k: string) { this.map.delete(k); }
	clear() { this.map.clear(); }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

const { carryWords, takeCarry, setKeptWindow } = await import("../components/lesson/kept-drafts.ts");
const { askedAgain, proseHintRequest, proseQuestionSpec, reaskedFrom } = await import("../components/lesson/prose/prose-question-data.ts");
const { ProseQuestion } = await import("../components/lesson/prose/prose-question.tsx");

beforeEach(() => {
	storage.clear();
	setKeptWindow("w-one", { live: ["w-one"] });
});

const first = { question: "Now Inclusion-exclusion principle: how many integers from 1 to 60 are divisible by none of 2, 3 and 5, and why?", correctAnswer: "16, by inclusion-exclusion: 60 − (30 + 20 + 12) + (10 + 6 + 4) − 2.", type: "check" };
const again = { question: "How many integers from 1 to 60 are divisible by none of 2, 3 and 5, and why?", correctAnswer: "16", type: "check" };
const typed = "60 − 30 − 20 − 12 = −2?? that cannot be right";
const hinted = proseHintRequest(proseQuestionSpec("explain", "q1", first)!, typed);
const transcript = [
	{ parts: [{ type: "text" }, { type: "tool-explain", toolCallId: "q1", input: first, output: hinted }] },
	{ parts: [{ type: "text" }, { type: "tool-explain", toolCallId: "q2", input: again }] },
];

describe("the question asked again after a Hint", () => {
	it("is known as the hinted question, though its words differ", () => {
		assert.deepEqual([...askedAgain(transcript)], ["q2"]);
		assert.equal(reaskedFrom(transcript, "q2"), "q1");
	});

	it("reads Your turn, on the question above, and posts no question again", () => {
		const html = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="q2" input={again} open repeat />);
		assert.match(html, /Your turn, on the question above/);
		assert.doesNotMatch(html, /How many integers/);
	});

	it("takes his words into its box, on the first read and after a reload", () => {
		carryWords("carry:/study/probability", { question: first.question, from: "q1" }, { text: typed }, []);
		const reaskOf = reaskedFrom(transcript, "q2");
		assert.equal(takeCarry("carry:/study/probability", again.question, reaskOf)?.words.text, typed);
	});

	it("after his side question, a new question on the same step is still a new one", () => {
		const aside = { kind: "explain", tool: "explain", questionText: first.question, answers: [], dismissed: true, reason: "asked", answeredAt: "" };
		const other = { question: "How many integers from 1 to 60 are divisible by 2 or 3?", correctAnswer: "40", type: "check" };
		const sideways = [
			{ parts: [{ type: "tool-explain", toolCallId: "q1", input: first, output: aside }] },
			{ parts: [{ type: "tool-explain", toolCallId: "q2", input: other }] },
		];
		assert.deepEqual([...askedAgain(sideways)], []);
		assert.equal(reaskedFrom(sideways, "q2"), null);
	});
});
