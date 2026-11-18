/**
 * Home leads with today's plan, not with what was left over (round 9, 1 D1):
 * a review closed with Done for today waits for its topic's next review
 * day, and a lesson left for next time comes after the plan unless it
 * holds one of the plan's steps.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseMove, openSessions, todayRows } from "../components/study-home/study-facts.ts";
import { foldLines, lessonTitle } from "../components/study-home/agenda-rows/row-facts.ts";
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
		assert.deepEqual(rows.map(lessonTitle), ["Review Linear maps and their matrices", "Start Inner products and orthogonality", "Continue Eigenvalues and eigenvectors"]);
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
		assert.deepEqual(rows.map(lessonTitle), ["Review Law of total probability", "Review Linear maps and their matrices", "Start Inner products and orthogonality", "Continue Eigenvalues and eigenvectors"]);
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

	it("lists a session waiting on him after the plan's reviews and new topics (round 10, 1 m2)", () => {
		const waiting = chat({ id: "waiting", title: "Rank practice", pendingProblem: true, topics: ["rank"], ownTopics: ["rank"], updatedAt: "2026-11-10T08:00:00.000Z", course: LA });
		const rows = todayRows([linalg(), PROB], openSessions([waiting, eigenLesson]), TODAY);
		assert.deepEqual(rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : lessonTitle(r))), [
			"Review Law of total probability",
			"Review Linear maps and their matrices",
			"Start Inner products and orthogonality",
			"session waiting",
			"session eigen-lesson",
		]);
	});

	it("keeps a waiting session that works on a planned step in that step's place", () => {
		const inner = chat({ id: "inner", title: "Inner products and orthogonality", pendingQuestion: true, topics: ["inner-product"], ownTopics: ["inner-product"], updatedAt: "2026-11-10T09:00:00.000Z" });
		const rows = todayRows([linalg(), PROB], openSessions([inner, eigenLesson]), TODAY);
		assert.deepEqual(rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : lessonTitle(r))), [
			"Review Law of total probability",
			"Review Linear maps and their matrices",
			"session inner",
			"session eigen-lesson",
		]);
	});
});

/**
 * 17 Nov, two days before the Probability exam (round 10, 1 m2, shots 55
 * and 70): only opening Problem sheet 4 made it Home's first row, above
 * the exam's review, and the leftover lessons on the course's tasks pushed
 * the plan's new topic into "Also today".
 */
describe("the plan outranks a session he only opened (round 10, 1 m2)", () => {
	const D17 = "2026-11-17";
	const la: StudyCourse = {
		map: map({
			today: D17,
			current: h("rank"),
			tasks: [
				{ key: "sheet4", title: "Problem sheet 4", step: "Part (c)", updated: "2026-11-06", topics: [h("rank")] },
				{ key: "eigen-task", title: "Continue Eigenvalues: the full 2×2 computation", step: null, updated: "2026-11-09", topics: [h("eigen")] },
				{ key: "maps-task", title: "Continue Linear maps: the matrix of a map", step: null, updated: "2026-11-10", topics: [h("linear-maps")] },
			],
			topics: [
				topic("rank", "Rank and the column space", { review: { kind: "due", date: D17, overdue: 0 } }),
				topic("eigen", "Eigenvalues and eigenvectors", { review: { kind: "scheduled", date: "2026-11-20" } }),
				topic("linear-maps", "Linear maps and their matrices", { review: { kind: "scheduled", date: "2026-11-21" } }),
				topic("inner-product", "Inner products and orthogonality", { level: "new", introduced: null }),
			],
		}),
		unready: null,
		due: [h("rank")],
		newToday: [h("inner-product")],
		lastActiveDaysAgo: 0,
	};
	const prob: StudyCourse = { ...PROB, map: { ...PROB.map, today: D17, exam: { date: "2026-11-19", daysLeft: 2 }, topics: [topic("total-probability", "Law of total probability", { review: { kind: "due", date: D17, overdue: 0 } })] } };
	const sheet4 = chat({ id: "sheet4", title: "Problem sheet 4", pendingQuestion: true, tasks: ["sheet4"], topics: ["rank"], ownTopics: ["rank"], updatedAt: "2026-11-17T10:00:00.000Z" });
	const eigen = chat({ id: "eigen", ended: "left", tasks: ["eigen-task"], updatedAt: "2026-11-17T09:00:00.000Z" });
	const maps = chat({ id: "maps", title: "Linear maps and their matrices", ended: "left", tasks: ["maps-task"], topics: ["linear-maps"], ownTopics: ["linear-maps"], updatedAt: "2026-11-10T11:00:00.000Z" });

	it("leads with the exam's review, then each course's review and new topics, then the session he opened, then the tasks", () => {
		const chats = [sheet4, { ...eigen, updatedAt: "2026-11-16T09:00:00.000Z" }, maps];
		const rows = todayRows([la, prob], openSessions(chats), D17);
		// Rank's review folds into sheet 4, open on Rank, in the review's place: one topic, one line (round 15, m6).
		assert.deepEqual(rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : lessonTitle(r))), [
			"Review Law of total probability",
			"session sheet4",
			"Start Inner products and orthogonality",
			"session eigen",
			"session maps",
		]);
		const { shown } = foldLines(rows);
		assert.ok(shown.some((r) => lessonTitle(r) === "Start Inner products and orthogonality"), "the plan's new topic is a full line, never an Also today chip");
	});
});
