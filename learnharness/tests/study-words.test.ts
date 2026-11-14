import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TopicHandle, TopicSignals } from "../src/core/contracts/course-map.ts";
import { ARC_EXAM_WORDS, ARC_STATE_WORDS, ATTEMPT_WORDS, courseShareWords, distanceWords, heldWords, lapsedOnWords, leftOutWords, moreWords, movedWords, noExamWords, overdueWords, returnWords, reviewWords, startsAfterWords, slipMark, slipWords, STANDING_WORDS, standingWords, startsWhyShort, startsWhyTells, startsWhyWords, type Fill } from "../components/study-words.ts";
import { ARC_STATES, type ArcHandle } from "../src/core/contracts/course-arcs.ts";
import type { CourseMap } from "../src/core/contracts/course-map.ts";
import { courseMapOf } from "../src/store/course-records.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
		assert.equal(assisted("unaided"), "Right on your own, check another day", "right unaided only on the day he learned it, however many times: never 'once'");
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
		assert.equal(slip({ lapsed: true }), "Not right last time");
		assert.equal(slip({ gap: "Writes det as ad + bc" }), "Mistake to fix");
		assert.equal(slip({ choiceErrors: { cramer: 2 } }), "Mixed up with Cramer's rule");
		assert.equal(slip({ confidentErrors: 1 }), "Sure, but wrong");
		assert.equal(slip({}), "Look again");
	});

	it("says the first signal when several hold: fixed, missed, a mistake, mixed up, then sure but wrong", () => {
		const all = { repaired: true, lapsed: true, gap: "sign error", choiceErrors: { cramer: 1 }, confidentErrors: 1 };
		assert.equal(slip(all), "Fixed, check again later");
		assert.equal(slip({ ...all, repaired: false }), "Not right last time");
		assert.equal(slip({ ...all, repaired: false, lapsed: false }), "Mistake to fix");
		assert.equal(slip({ ...all, repaired: false, lapsed: false, gap: null }), "Mixed up with Cramer's rule");
		assert.equal(slip({ confidentErrors: 1, choiceErrors: {} }), "Sure, but wrong");
	});

	it("never calls a mistake fixed when only help repaired it, nor contradicts the right answer since with words about the ones before it", () => {
		assert.equal(slip({ repaired: true, repairedWithHelp: true, gap: "Counts nonzero rows" }), "Mistake to fix");
		assert.equal(slip({ repaired: true, repairedWithHelp: true, lapsed: true }), "Mistake to fix", "not 'Not right last time' after a right answer");
		assert.equal(slip({ repaired: true, repairedWithHelp: true, confidentErrors: 1 }), "Mistake to fix", "not 'Sure, but wrong' after a right answer");
		assert.equal(slipMark({ ...QUIET, repaired: true, repairedWithHelp: true, confidentErrors: 1 }, titleOf).key, "gap", "its icon is a mistake's");
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
		assert.deepEqual([0, 1, 3, 6, 7, 13, 14, 30].map(overdueWords), ["Due today", "1d overdue", "3d overdue", "6d overdue", "7d overdue", "13d overdue", "14d overdue", "30d overdue"]);
	});

	it("says when a dated review comes back in days, then weeks, then months", () => {
		assert.deepEqual([1, 5, 13, 14, 21, 59, 60, 90].map(returnWords), ["Back in 1d", "Back in 5d", "Back in 13d", "Back in 14d", "Back in 21d", "Back in 59d", "Back in 60d", "Back in 90d"]);
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
	it("says since when a held review was due, so weeks late never reads as 'Back in 25d'", () => {
		assert.equal(reviewWords(late, "2026-11-08"), "Due since 1 Oct");
		assert.equal(reviewWords({ kind: "scheduled", date: "2026-12-03" }, "2026-11-08"), "Back in 25d");
		assert.equal(reviewWords({ ...behind, held: { exam: "Probability", since: "2026-11-13" } }, "2026-11-08"), "Back in 12d", "memory's day is still ahead");
		assert.equal(reviewWords({ kind: "due", date: "2026-11-08", overdue: 3 }, "2026-11-08"), "3d overdue");
	});
	it("says from when a held review moved, so a day the tutor named never moves in silence", () => {
		assert.equal(movedWords(behind, "2026-11-08"), "Moved from 13 Nov", "memory's day is still ahead");
		assert.equal(movedWords(late, "2026-11-08"), "Due since 1 Oct");
		assert.equal(movedWords({ kind: "scheduled", date: "2026-12-03" }, "2026-11-08"), null);
		assert.equal(movedWords({ kind: "due", date: "2026-11-08", overdue: 0 }, "2026-11-08"), null);
	});
	it("says what the plan does for a course with no exam, never only that no exam is set", () => {
		assert.equal(noExamWords([{ review: behind }, { review: late }]), "No exam: reviews wait for your Probability exam");
		assert.equal(noExamWords([{ review: late }]), "No exam: reviews wait, earlier days are full");
		assert.equal(noExamWords([{ review: { kind: "scheduled", date: "2026-11-20" } }, { review: null }]), "No exam: reviews come back when memory asks");
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

describe("words he reads after days away", () => {
	it("never says Missed, which beside an overdue review reads as a review he skipped", () => {
		assert.equal(lapsedOnWords("Chain rule"), "Not right last time: Chain rule");
		assert.deepEqual(Object.values(ATTEMPT_WORDS), ["Right", "Partly right", "Not right"]);
	});
});

/** E2's demo Linear Algebra map, with and without arcs, parsed. */
const golden = (name: string): CourseMap => {
	const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "learning", "golden", `${name}.map.json`);
	return courseMapOf("/s/linalg", JSON.parse(fs.readFileSync(file, "utf-8")))!;
};

describe("where an arc stands", () => {
	it("has words for every engine state, none with a count or a percentage", () => {
		assert.deepEqual(Object.keys(ARC_STATE_WORDS), [...ARC_STATES]);
		for (const words of [...Object.values(ARC_STATE_WORDS), ...Object.values(ARC_EXAM_WORDS)]) assert.doesNotMatch(words, /\d|%|tonight/i, words);
	});
});

describe("why a topic starts then", () => {
	const arcs = golden("linear-algebra-arcs");
	const plain = golden("linear-algebra");
	const why = (map: CourseMap, handle: string) => startsWhyWords(map.topics.find((t) => t.handle === handle)!.startsWhy!, map);
	it("names its prerequisites, in a course with arcs or without", () => {
		assert.equal(why(arcs, "change-basis"), "After Invertible matrices, which it needs");
		assert.equal(why(plain, "invertibility"), "After Determinants as volume scaling, which it needs");
	});
	it("names the arc an early start comes from, or the exam's pace that took it", () => {
		assert.equal(why(arcs, "inner-product"), "Early, from Orthogonality, to keep pace with the exam");
		assert.equal(why(plain, "inner-product"), "Early, ahead of its place, while earlier topics wait on Determinants as volume scaling");
		const orthogonality = "orthogonality" as ArcHandle;
		assert.equal(startsWhyWords({ kind: "early", arc: orthogonality, waitingOn: [], exam: false }, arcs), "Early, from Orthogonality");
	});
	it("says a topic the exam ahead leaves out is not on it, and after it when the plan starts it then", () => {
		const exam = { date: "2026-11-19", daysLeft: 11, leavesOut: ["covariance" as TopicHandle] };
		const covariance = { handle: "covariance" as TopicHandle, starts: "2026-11-23" };
		assert.equal(leftOutWords(covariance, exam), "Not on the exam; after it");
		assert.equal(leftOutWords({ ...covariance, starts: "2026-11-16" }, exam), "Not on the exam", "nothing the exam examines waits");
		assert.equal(leftOutWords({ ...covariance, handle: "variance" as TopicHandle }, exam), null);
		assert.equal(leftOutWords(covariance, { ...exam, daysLeft: -1 }), null, "once the exam has passed");
		assert.equal(leftOutWords(covariance, null), null);
	});
	it("says next in its arc when that is where he is or further on, else in the course", () => {
		assert.equal(arcs.current, "eigen", "You are here is in Eigenvalues");
		assert.equal(startsWhyWords({ kind: "next", arc: "eigenvalues" as ArcHandle }, arcs), "Next in Eigenvalues and diagonalization");
		assert.equal(startsWhyWords({ kind: "next", arc: "orthogonality" as ArcHandle }, arcs), "Next in Orthogonality");
		assert.equal(startsWhyWords({ kind: "next" }, plain), "Next in Linear Algebra");
	});
	it("says the plan goes back when its next start sits in an arc before the one You are here is in (round 6: You are here z tests, Next in Sampling distributions)", () => {
		const systems = { kind: "next" as const, arc: "systems" as ArcHandle };
		assert.equal(startsWhyWords(systems, arcs), "Back to Linear systems, earlier in the course");
		assert.equal(startsWhyShort(systems, arcs), "Back to Linear systems");
		assert.equal(startsWhyWords(systems, { ...arcs, current: "rank" as TopicHandle }), "Next in Linear systems", "once You are here is in Linear systems");
		assert.equal(startsWhyWords(systems, { ...arcs, current: null, currentArc: undefined }), "Next in Linear systems", "with nowhere he is");
	});
	it("is worth saying in every course but as plain next in a course without arcs, which only repeats the course beside it", () => {
		assert.equal(startsWhyTells({ kind: "early", waitingOn: ["change-basis" as TopicHandle], exam: false }), true, "early in a course without arcs");
		assert.equal(startsWhyTells({ kind: "after", needs: ["expectation" as TopicHandle], partners: [] }), true);
		assert.equal(startsWhyTells({ kind: "next", arc: "systems" as ArcHandle }), true);
		assert.equal(startsWhyTells({ kind: "next" }), false);
		assert.equal(startsWhyTells({ kind: "after", needs: [], partners: [] }), false);
	});
	it("names a method it competes with, beside what it needs", () => {
		const [rank, kernel, cramer] = ["rank", "kernel", "cramer"].map((h) => arcs.topics.find((t) => t.handle === h)!.handle);
		assert.equal(startsWhyWords({ kind: "after", needs: [], partners: [cramer!] }, arcs), "After Cramer's rule, so the two methods stay apart");
		assert.equal(
			startsWhyWords({ kind: "after", needs: [rank!, kernel!], partners: [cramer!] }, arcs),
			"After Rank and the column space and Kernel and rank-nullity, which it needs, and Cramer's rule, so the two methods stay apart",
		);
	});
});
