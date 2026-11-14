import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TopicHandle, TopicSignals } from "../src/core/contracts/course-map.ts";
import { courseShareWords, heldWords, moreWords, overdueWords, returnWords, slipWords, STANDING_WORDS, standingWords, type Fill } from "../components/study-words.ts";

// The app's one wording for where he stands and why a topic needs him
// (study-words.ts), which every surface reads.
const QUIET: TopicSignals = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const titleOf = (handle: TopicHandle) => ({ cramer: "Cramer's rule" })[handle as string] ?? handle;
const slip = (signals: Partial<TopicSignals>) => slipWords({ ...QUIET, ...signals }, titleOf);

describe("where he stands", () => {
	it("says one phrase per step of the pie", () => {
		const fills: Fill[] = [0, 0.25, 0.5, 0.75, 1];
		assert.deepEqual(
			fills.map((fill) => STANDING_WORDS[fill]),
			["Not started", "Taught, not tried", "Tried, not right yet", "Right with help", "On your own"],
		);
	});
});

describe("where he stands, true to the record", () => {
	it("says how a topic he cannot yet do on his own was best answered, never help he was not given", () => {
		const assisted = (right?: "unaided" | "helped" | "guess" | "uncertain" | "partial") => standingWords(0.75, { level: "assisted", ...(right ? { right } : {}) });
		assert.equal(assisted("unaided"), "Right on your own once", "right unaided on the day he learned it");
		assert.equal(assisted("partial"), "Partly right");
		assert.equal(assisted("guess"), "Right, but a guess");
		assert.equal(assisted("uncertain"), "Right, not yet confirmed");
		assert.equal(assisted("helped"), "Right with help");
		assert.equal(assisted(), "Right with help", "an engine that does not say keeps the pie's words");
		assert.equal(standingWords(0.75, { level: "independent" }), "Right with help", "a weak topic he could do on his own keeps its pie's words");
		assert.equal(standingWords(0.5, { level: "attempted" }), "Tried, not right yet");
	});
});

describe("why a slip needs him", () => {
	it("says each signal on its own", () => {
		assert.equal(slip({ repaired: true }), "Fixed, check again later");
		assert.equal(slip({ lapsed: true }), "Missed last time");
		assert.equal(slip({ gap: "Writes det as ad + bc" }), "Mistake to fix");
		assert.equal(slip({ choiceErrors: { cramer: 2 } }), "Mixed up with Cramer's rule");
		assert.equal(slip({ confidentErrors: 1 }), "Sure, but wrong");
		assert.equal(slip({}), "Look again");
	});

	it("says the first signal when several hold: fixed, missed, a mistake, mixed up, then sure but wrong", () => {
		const all = { repaired: true, lapsed: true, gap: "sign error", choiceErrors: { cramer: 1 }, confidentErrors: 1 };
		assert.equal(slip(all), "Fixed, check again later");
		assert.equal(slip({ ...all, repaired: false }), "Missed last time");
		assert.equal(slip({ ...all, repaired: false, lapsed: false }), "Mistake to fix");
		assert.equal(slip({ ...all, repaired: false, lapsed: false, gap: null }), "Mixed up with Cramer's rule");
		assert.equal(slip({ confidentErrors: 1, choiceErrors: {} }), "Sure, but wrong");
	});

	it("names a method by its handle when the map has no title for it", () => {
		assert.equal(slip({ choiceErrors: { pivots: 1 } }), "Mixed up with pivots");
	});
});

describe("why a review needs him", () => {
	it("says a due review in days under a week, then whole weeks", () => {
		assert.deepEqual([0, 1, 3, 6, 7, 13, 14, 30].map(overdueWords), ["Due today", "1d overdue", "3d overdue", "6d overdue", "1w overdue", "1w overdue", "2w overdue", "4w overdue"]);
	});

	it("says when a dated review comes back in days, then weeks, then months", () => {
		assert.deepEqual([1, 5, 13, 14, 21, 59, 60, 90].map(returnWords), ["Back in 1d", "Back in 5d", "Back in 13d", "Back in 2w", "Back in 3w", "Back in 8w", "Back in 2mo", "Back in 3mo"]);
	});
});

describe("counts in plain words", () => {
	it("says a course's share with its noun, and none or all in words", () => {
		assert.equal(courseShareWords(5, 16), "5 of 16 topics on your own");
		assert.equal(courseShareWords(0, 16), "No topics on your own yet");
		assert.equal(courseShareWords(16, 16), "All 16 topics on your own");
	});

	it("says what Show does without a number", () => {
		assert.equal(moreWords(23, 25), "Show the rest");
		assert.equal(moreWords(40, 25), "Show more");
	});
});

describe("why a review waits", () => {
	const held = { kind: "scheduled", date: "2026-12-03", held: true } as const;
	it("says a course with no exam ahead of the review waits for the exam courses", () => {
		assert.equal(heldWords(held, null), "Waits for your exams");
		assert.equal(heldWords(held, "2026-11-19"), "Waits for your exams", "its own exam is past by the review");
	});
	it("says a course whose own exam is still ahead waits for a nearer one", () => {
		assert.equal(heldWords(held, "2026-12-10"), "Waits for a nearer exam");
	});
	it("says nothing for a review the plan does not hold back", () => {
		assert.equal(heldWords({ kind: "scheduled", date: "2026-12-03" }, null), null);
		assert.equal(heldWords({ kind: "due", date: "2026-11-08", overdue: 0 }, null), null);
		assert.equal(heldWords(null, null), null);
	});
});
