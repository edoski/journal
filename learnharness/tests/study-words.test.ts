import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TopicHandle, TopicSignals } from "../src/core/contracts/course-map.ts";
import { courseShareWords, distanceWords, heldWords, moreWords, overdueWords, returnWords, reviewWords, startsAfterWords, slipMark, slipWords, STANDING_WORDS, standingWords, type Fill } from "../components/study-words.ts";
import { SLIP_ICON } from "../components/slip-icons.ts";

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

	it("never calls a mistake fixed when only help repaired it: the signal under it shows", () => {
		assert.equal(slip({ repaired: true, repairedWithHelp: true, gap: "Counts nonzero rows" }), "Mistake to fix");
		assert.equal(slip({ repaired: true, repairedWithHelp: true, lapsed: true }), "Missed last time");
	});

	it("gives each slip its own icon, so a fix never wears the mistake's", () => {
		const keys = [{ repaired: true }, { lapsed: true }, { gap: "g" }, { choiceErrors: { cramer: 1 } }, { confidentErrors: 1 }, {}].map((s) => slipMark({ ...QUIET, ...s }, titleOf).key);
		assert.deepEqual(keys, ["repaired", "lapsed", "gap", "mixed", "confident", "none"]);
		assert.equal(new Set(keys.map((k) => SLIP_ICON[k])).size, keys.length);
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
		assert.equal(courseShareWords(5, 16), "Some topics on your own");
		assert.equal(courseShareWords(9, 16), "Most topics on your own");
		assert.equal(courseShareWords(8, 16), "Some topics on your own", "half is not most");
		assert.equal(courseShareWords(0, 16), "No topics on your own yet");
		assert.equal(courseShareWords(16, 16), "Every topic on your own");
	});

	it("says what Show does without a number", () => {
		assert.equal(moreWords(23, 25), "Show the rest");
		assert.equal(moreWords(40, 25), "Show more");
	});
});

describe("why a review waits", () => {
	const late = { kind: "scheduled", date: "2026-12-03", held: { exam: null, since: "2026-10-01" } } as const;
	const behind = { kind: "scheduled", date: "2026-11-20", held: { exam: "Probability", since: "2026-11-13" } } as const;
	it("names the course whose final review came first, never its own exam as 'your exams'", () => {
		assert.equal(heldWords(behind), "Waits for your Probability exam");
	});
	it("says the earlier days are full when no final review took them", () => {
		assert.equal(heldWords(late), "Earlier days are full");
	});
	it("says nothing for a review the plan does not hold back", () => {
		assert.equal(heldWords({ kind: "scheduled", date: "2026-12-03" }), null);
		assert.equal(heldWords({ kind: "due", date: "2026-11-08", overdue: 0 }), null);
		assert.equal(heldWords(null), null);
	});
	it("says since when a held review was due, so weeks late never reads as 'Back in 4w'", () => {
		assert.equal(reviewWords(late, "2026-11-08"), "Due since 1 Oct");
		assert.equal(reviewWords({ kind: "scheduled", date: "2026-12-03" }, "2026-11-08"), "Back in 4w");
		assert.equal(reviewWords({ ...behind, held: { exam: "Probability", since: "2026-11-13" } }, "2026-11-08"), "Back in 12d", "memory's day is still ahead");
		assert.equal(reviewWords({ kind: "due", date: "2026-11-08", overdue: 3 }, "2026-11-08"), "3d overdue");
	});
	it("says which courses' new topics a first lesson waits behind", () => {
		assert.equal(startsAfterWords(["Probability"]), "After Probability's new topics");
		assert.equal(startsAfterWords(["Probability", "Linear Algebra"]), "After Probability's and Linear Algebra's new topics");
		assert.equal(startsAfterWords(undefined), null);
	});
	it("says how far a day is in days, one form for an exam and a review", () => {
		assert.deepEqual(
			["2026-11-08", "2026-11-09", "2026-11-07", "2026-11-26", "2026-11-01"].map((d) => distanceWords(d, "2026-11-08")),
			["Today", "Tomorrow", "Yesterday", "In 18 days", "7 days ago"],
		);
	});
});
