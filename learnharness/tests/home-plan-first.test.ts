/**
 * Home leads with today's plan, not with what was left over (round 9, 1 D1):
 * a review closed with Done for today waits for its topic's next review
 * day, and a lesson left for next time comes after the plan unless it
 * holds one of the plan's steps.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseMove, openSessions, todayRows } from "../components/study-home/study-facts.ts";
import { lessonTitle } from "../components/study-home/agenda-rows/row-facts.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { LA, chat, map, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-10";
const h = (s: string) => s as TopicHandle;

/** Linear Algebra on Tue 10 Nov: Linear maps' review is due, Inner products starts today, Eigen's review is back on 12 Nov. */
const linalg = (over: { due?: string[]; eigen?: "due" | "later" } = {}): StudyCourse => ({
	map: map({
		today: TODAY,
		topics: [
			topic("eigen", "Eigenvalues and eigenvectors", { review: over.eigen === "due" ? { kind: "due", date: TODAY, overdue: 0 } : { kind: "scheduled", date: "2026-11-12" } }),
			topic("linear-maps", "Linear maps and their matrices", { review: { kind: "due", date: TODAY, overdue: 0 } }),
			topic("inner-product", "Inner products and orthogonality", { level: "new", introduced: null }),
		],
	}),
	unready: null,
	due: (over.due ?? ["linear-maps"]).map(h),
	newToday: [h("inner-product")],
	lastActiveDaysAgo: 1,
});

/** Probability two days before its exam, its review due today. */
const PROB: StudyCourse = {
	map: {
		...map({ today: TODAY, topics: [topic("total-probability", "Law of total probability", { review: { kind: "due", date: TODAY, overdue: 0 } })] }),
		workspace: "/s/prob",
		title: "Probability",
		current: null,
		exam: { date: "2026-11-12", daysLeft: 2 },
	},
	unready: [],
	due: [h("total-probability")],
	newToday: [],
	lastActiveDaysAgo: 3,
};

/** Yesterday's Eigen review, closed with Done for today: "comes back on Thursday 12 November". */
const eigenReview = chat({ id: "eigen-review", title: "Review Eigenvalues and eigenvectors", ended: "left", review: true, updatedAt: "2026-11-09T09:00:00.000Z" });
/** The Eigen lesson, left for next time two days ago. */
const eigenLesson = chat({ id: "eigen-lesson", ended: "left", updatedAt: "2026-11-08T10:00:00.000Z" });
/** Yesterday's Linear maps review, also closed with Done for today. */
const mapsReview = chat({ id: "maps-review", title: "Review Linear maps and their matrices", ended: "left", review: true, topics: ["linear-maps"], ownTopics: ["linear-maps"], updatedAt: "2026-11-09T11:00:00.000Z" });

describe("Home leads with today's plan (1 D1)", () => {
	it("gives a review closed for later no line of its own, and lists the plan before a lesson left for next time", () => {
		const rows = todayRows([linalg()], openSessions([eigenReview, eigenLesson]), TODAY);
		assert.deepEqual(rows.map(lessonTitle), ["Review Linear maps and their matrices", "Start Inner products and orthogonality", "Eigenvalues and eigenvectors"]);
	});

	it("folds the closed review into its topic's next review row, which opens it", () => {
		const course = linalg({ due: ["eigen"], eigen: "due" });
		const rows = todayRows([course], openSessions([eigenReview, eigenLesson]), TODAY);
		assert.deepEqual(rows.map(lessonTitle), ["Review Eigenvalues and eigenvectors", "Start Inner products and orthogonality"], "the lesson on the reviewed topic gives its line to the review");
		const review = rows[0]!;
		assert.equal(review.kind, "course", "the plan's own review row, Due today");
		const move = review.kind === "course" ? courseMove(course, [eigenReview, eigenLesson], review.step) : null;
		assert.deepEqual(move?.kind === "open" && move.chat.id, "eigen-review", "the press picks up the open question he left in it");
	});

	it("lists the exam's course first, and every leftover after both courses' plans", () => {
		const rows = todayRows([linalg(), PROB], openSessions([mapsReview, eigenReview, eigenLesson]), TODAY);
		assert.deepEqual(rows.map(lessonTitle), ["Review Law of total probability", "Review Linear maps and their matrices", "Start Inner products and orthogonality", "Eigenvalues and eigenvectors"]);
		const maps = rows[1]!;
		assert.equal(maps.kind, "course", "today's Linear maps review is the plan's row, and it opens yesterday's review");
	});

	it("puts a lesson left on a planned step in that step's place", () => {
		const inner = chat({ id: "inner", title: "Inner products and orthogonality", ended: "left", topics: ["inner-product"], ownTopics: ["inner-product"], updatedAt: "2026-11-09T15:00:00.000Z" });
		const rows = todayRows([linalg(), PROB], openSessions([inner, eigenLesson]), TODAY);
		assert.deepEqual(rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : lessonTitle(r))), [
			"Review Law of total probability",
			"Review Linear maps and their matrices",
			"session inner",
			"session eigen-lesson",
		]);
	});

	it("keeps a session waiting on him first", () => {
		const waiting = chat({ id: "waiting", title: "Rank practice", pendingProblem: true, topics: ["rank"], ownTopics: ["rank"], updatedAt: "2026-11-10T08:00:00.000Z", course: LA });
		const rows = todayRows([linalg(), PROB], openSessions([waiting, eigenLesson]), TODAY);
		assert.deepEqual(rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : lessonTitle(r))), [
			"session waiting",
			"Review Law of total probability",
			"Review Linear maps and their matrices",
			"Start Inner products and orthogonality",
			"session eigen-lesson",
		]);
	});
});
