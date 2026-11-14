import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TopicHandle, TopicSignals } from "../src/core/contracts/course-map.ts";
import { courseShareWords, moreWords, overdueWords, returnWords, slipWords, STANDING_WORDS, type Fill } from "../components/study-words.ts";

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
