import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TopicHandle, TopicSignals } from "../src/core/contracts/course-map.ts";
import { ARC_EXAM_WORDS, ARC_STATE_WORDS, ATTEMPT_WORDS, courseShareWords, disputeStampWords, distanceWords, heldWords, lapsedNow, lapsedOnWords, leftOutWords, moreWords, movedWords, noExamWords, overdueWords, leftOffWords, studiedDaysWords, agoWords, returnWords, reviewWords, startsAfterWords, slipMark, slipWords, STANDING_WORDS, standingWords, startsWhyShort, startsWhyTells, startsWhyWords, type Fill } from "../components/study-words.ts";
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
		assert.equal(assisted(), "Not right last time", "no right answer since his newest wrong one: never help he did not have (round 8, 2 M1)");
		assert.equal(standingWords(0.5, { level: "attempted" }), "Tried, not right yet", "no right answer since his newest wrong one");
	});

	it("never says Right with help when the newest answer was wrong, and drops 'check another day' once the review is due (round 8, 2 M1, 1 D11)", () => {
		assert.equal(standingWords(0.75, { level: "assisted" }), "Not right last time");
		assert.equal(standingWords(0.75, { level: "assisted", right: "unaided", review: { kind: "due", date: "2026-11-09", overdue: 0 } }), "Right on your own");
		assert.equal(standingWords(0.75, { level: "assisted", right: "unaided", review: { kind: "scheduled", date: "2026-11-10" } }), "Right on your own, check another day");
		assert.equal(standingWords(0.5, { level: "attempted", right: "unaided", review: { kind: "due", date: "2026-11-09", overdue: 2 } }), "Right on your own");
	});

	it("puts every pick of his in the dispute's stamp, the mark and how it should count (round 8, 2 m2)", () => {
		assert.equal(disputeStampWords({}), "You disputed the mark");
		assert.equal(disputeStampWords({ proposed: "correct" }), "You disputed the mark · You think: Right");
		assert.equal(disputeStampWords({ proposedHow: "ownWork" }), "You disputed the mark · You think: On your own");
		assert.equal(disputeStampWords({ proposed: "partial", proposedHow: "withHelp" }), "You disputed the mark · You think: Partly right, With help");
	});

	it("says the right answers since a review day's wrong first try, never that he has not got it right (round 7)", () => {
		assert.equal(standingWords(0.5, { level: "attempted", right: "unaided" }), "Right on your own, check another day");
		assert.equal(standingWords(0.5, { level: "attempted", right: "helped" }), "Right with help");
		assert.equal(standingWords(0.5, { level: "attempted", right: "partial" }), "Partly right");
	});
});

describe("why a slip needs him", () => {
	it("says each signal on its own, the signals about a wrong answer only while one is open", () => {
		assert.equal(slip({ repaired: true }), "Check again another day");
		assert.equal(slip({ lapsed: true, mistake: true }), "Not right last time");
		assert.equal(slip({ gap: "Writes det as ad + bc", mistake: true }), "Mistake to fix");
		assert.equal(slip({ choiceErrors: { cramer: 2 }, mistake: true }), "Mixed up with Cramer's rule");
		assert.equal(slip({ confidentErrors: 1, mistake: true }), "Sure, but wrong");
		assert.equal(slip({ mistake: true }), "Mistake to fix", "a wrong answer open with no other signal");
	});

	it("says the first signal when several hold: fixed, nothing open to check, missed, a mistake, mixed up, then sure but wrong", () => {
		const all = { repaired: true, lapsed: true, gap: "sign error", mistake: true, choiceErrors: { cramer: 1 }, confidentErrors: 1 };
		assert.equal(slip(all), "Check again another day");
		assert.equal(slip({ ...all, repaired: false, mistake: false }), "Check on your own");
		assert.equal(slip({ ...all, repaired: false }), "Not right last time");
		assert.equal(slip({ ...all, repaired: false, lapsed: false }), "Mistake to fix");
		assert.equal(slip({ ...all, repaired: false, lapsed: false, gap: null }), "Mixed up with Cramer's rule");
		assert.equal(slip({ confidentErrors: 1, choiceErrors: {}, mistake: true }), "Sure, but wrong");
	});

	it("never says a wrong answer's words once a right one closed it (round 7: 'Not right last time' after a right last try)", () => {
		assert.equal(slip({ lapsed: true }), "Check on your own", "Independence: partly right, then right");
		assert.equal(slip({ confidentErrors: 1 }), "Check on your own");
		assert.equal(slip({ choiceErrors: { cramer: 1 } }), "Check on your own");
		assert.equal(slip({ repaired: true, repairedWithHelp: true, lapsed: true, confidentErrors: 1 }), "Check on your own", "Rank: right with a hint after the partial answer");
		assert.equal(slipMark({ ...QUIET, lapsed: true }, titleOf).key, "check");
		assert.equal(lapsedNow({ ...QUIET, lapsed: true }), false, "Home's line names no lapse a right answer closed");
		assert.equal(lapsedNow({ ...QUIET, lapsed: true, mistake: true }), true);
	});

	it("never calls a mistake fixed when only help repaired it; a wrong answer after the repair is said as any other", () => {
		assert.equal(slip({ repaired: true, repairedWithHelp: true, gap: "Counts nonzero rows", mistake: true }), "Mistake to fix");
		assert.equal(slip({ repaired: true, repairedWithHelp: true, lapsed: true, mistake: true }), "Not right last time");
		assert.equal(slipMark({ ...QUIET, repaired: true, repairedWithHelp: true, mistake: true }, titleOf).key, "gap", "its icon is a mistake's");
	});

	it("gives each slip its own icon, so a fix never wears the mistake's", () => {
		const keys = [{ repaired: true }, { lapsed: true, mistake: true }, { gap: "g", mistake: true }, { gap: "g" }, { choiceErrors: { cramer: 1 }, mistake: true }, { confidentErrors: 1, mistake: true }].map((s) => slipMark({ ...QUIET, ...s }, titleOf).key);
		assert.deepEqual(keys, ["repaired", "lapsed", "gap", "check", "mixed", "confident"]);
		assert.equal(new Set(keys.map((k) => SLIP_ICON[k])).size, keys.length);
		assert.deepEqual(Object.keys(SLIP_ICON).sort(), [...keys].sort(), "every slip has an icon and no icon is left over");
	});

	it("calls a gap a mistake only when a wrong answer is open; a gap with none is what is left to check on his own (round 6)", () => {
		assert.equal(slip({ gap: "Still to check on your own: drawing without replacement" }), "Check on your own");
		assert.equal(slip({ gap: "Loses the sign", mistake: true }), "Mistake to fix");
		assert.equal(slip({ repaired: true, repairedWithHelp: true, gap: "Still to check on your own" }), "Check on your own", "two right answers with help and no wrong one");
		const check = slipMark({ ...QUIET, gap: "g" }, titleOf).key;
		assert.notEqual(SLIP_ICON[check], SLIP_ICON.gap, "its icon is not a mistake's");
	});

	it("reads the engine's mistake from the map", () => {
		const map = courseMapOf("/c", { today: "2026-11-08", topics: [{ topic: "binomial", level: "assisted", gap: "Still to check" }, { topic: "kernel", level: "assisted", gap: "Loses a sign", mistake: true }] });
		assert.deepEqual(map?.topics.map((t) => [t.handle, t.signals.mistake === true]), [["binomial", false], ["kernel", true]]);
	});

	it("names a method by its handle when the map has no title for it", () => {
		assert.equal(slip({ choiceErrors: { pivots: 1 }, mistake: true }), "Mixed up with pivots");
	});
});

describe("why a review needs him", () => {
	it("says since which day a review is due, never a count of days (round 9, 2 m5)", () => {
		assert.deepEqual([0, 1, 5, 40].map((days) => overdueWords(days, "2026-11-08")), ["Due today", "Due since 7 Nov", "Due since 3 Nov", "Due since 29 Sept"]);
	});

	it("says the day work was left and the day he studied, never a count of days (round 9, 2 m5)", () => {
		assert.deepEqual([0, 1, 2, null].map((days) => leftOffWords(days, "2026-11-08")), ["Left off today", "Left off yesterday", "Left off 6 Nov", "Unfinished"]);
		assert.deepEqual([0, 1, 4].map((days) => studiedDaysWords(days, "2026-11-08")), ["Studied today", "Studied yesterday", "Studied 4 Nov"]);
		assert.deepEqual([0, 1, 13].map((days) => agoWords(days, "2026-11-08")), ["Today", "Yesterday", "26 Oct"]);
	});

	it("says the day a dated review comes back, never a count of days (round 8, 2 m4)", () => {
		assert.deepEqual(["2026-11-10", "2026-11-13", "2027-01-05"].map(returnWords), ["Back Tue 10 Nov", "Back Fri 13 Nov", "Back Tue 5 Jan"]);
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
		assert.equal(reviewWords(late, "2026-11-08"), "Due since 1 Oct, back 3 Dec", "with the day the plan brings it back (round 8: Calculus gave none)");
		assert.equal(reviewWords({ kind: "scheduled", date: "2026-12-03" }, "2026-11-08"), "Back Thu 3 Dec");
		assert.equal(reviewWords({ ...behind, held: { exam: "Probability", since: "2026-11-13" } }, "2026-11-08"), "Back Fri 20 Nov", "memory's day is still ahead");
		assert.equal(reviewWords({ kind: "due", date: "2026-11-08", overdue: 3 }, "2026-11-08"), "Due since 5 Nov");
	});
	it("says from which told day a review moved and what of his study moved it, ahead of memory's day", () => {
		const told = { from: "2026-11-10", by: "study" as const, courses: ["Probability"], day: "today" as const };
		assert.equal(movedWords(behind, "2026-11-08", told), "Moved from 10 Nov after your Probability study today");
		assert.equal(movedWords({ kind: "scheduled", date: "2026-11-12" }, "2026-11-08", { from: "2026-11-10", by: "missed" }), "Moved from 10 Nov, no study yesterday");
		assert.equal(movedWords(late, "2026-11-08", { from: "2026-11-09", by: "left" }), "Moved from 9 Nov, yesterday's plan was not finished");
		assert.equal(movedWords(null, "2026-11-08", { from: "2026-11-10", by: "study", courses: ["Probability", "Calculus"], day: "today" as const }), "Moved from 10 Nov after your Probability and Calculus study today", "a start moves too");
		assert.equal(movedWords(behind, "2026-11-08", { ...told, day: "yesterday" }), "Moved from 10 Nov after your Probability study yesterday", "round 9: today's work moves only what it touched, so the rest moves the next morning and says so");
		assert.equal(movedWords(null, "2026-11-09", { ...told, waitsOn: ["Random variables and distributions"] }), "Moved from 10 Nov, since Random variables and distributions is not solid yet", "round 14, m3: the topic that slipped, never \"today's day was full\"");
		assert.equal(movedWords(null, "2026-11-09", { ...told, waitsOn: ["Bases", "Rank"] }), "Moved from 10 Nov, since Bases and Rank are not solid yet");
		assert.equal(movedWords(behind, "2026-11-09", { from: "2026-11-12", by: "answered" }), "Moved from 12 Nov after your answer today", "round 14, m3: Rank, told Thu 12, moved by more practice, says so");
	});
	it("names the last day he studied when the cause is days ago, never a 'yesterday' a week back", () => {
		// Round 10 (1 M3): after a quiet week a close blamed a review he had done for the move.
		assert.equal(movedWords({ kind: "scheduled", date: "2026-11-20" }, "2026-11-17", { from: "2026-11-12", by: "missed", on: "2026-11-10" }), "Moved from 12 Nov, no study since 10 Nov");
		assert.equal(movedWords({ kind: "scheduled", date: "2026-11-20" }, "2026-11-17", { from: "2026-11-18", by: "missed", on: "2026-11-15" }), "Moved from 18 Nov, no study yesterday");
		assert.equal(movedWords({ kind: "scheduled", date: "2026-11-18" }, "2026-11-16", { from: "2026-11-14", by: "left", on: "2026-11-14" }), "Moved from 14 Nov, the plan of 14 Nov was not finished");
		assert.equal(movedWords({ kind: "scheduled", date: "2026-11-18" }, "2026-11-16", { from: "2026-11-15", by: "left", on: "2026-11-15" }), "Moved from 15 Nov, yesterday's plan was not finished");
	});
	it("says since when a held review was due once memory's day has passed, and names no day he was never told", () => {
		assert.equal(movedWords(behind, "2026-11-08"), null, "memory's day is still ahead: no 'Moved from' a day he never heard (round 8)");
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
		assert.equal(why(plain, "invertibility"), "After Rank and the column space, which it needs");
	});
	it("names the arc an early start comes from, or the exam's pace that took it", () => {
		assert.equal(why(arcs, "inner-product"), "Early, from Orthogonality");
		assert.equal(startsWhyWords({ kind: "early", arc: "orthogonality" as ArcHandle, waitingOn: [], exam: true }, arcs), "Early, from Orthogonality, to keep pace with the exam");
		assert.equal(why(plain, "inner-product"), "Early, ahead of its place");
		assert.equal(startsWhyWords({ kind: "early", waitingOn: ["determinant" as TopicHandle], exam: false }, plain), "Early, ahead of its place, while earlier topics wait on Determinants as volume scaling");
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
