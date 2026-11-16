/**
 * A start the exam's plan has no room for reads "After the exam" on the
 * exam's course page (round 12, 1 m11): Geometric read "Planned 29 Nov" and
 * Variance "Planned 30 Nov" there, while their topic pages said "Not
 * before the exam".
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseGroups } from "../components/course-page/course-model.ts";

const h = (s: string) => s as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });
const course: StudyCourse = {
	map: {
		workspace: "/s/pr",
		title: "Probability",
		today: "2026-11-17",
		revision: 1,
		exam: { date: "2026-11-19", daysLeft: 2, finalReview: "2026-11-17", doesNotFit: [h("geometric")], unreviewed: [], reasons: {} },
		current: h("bayes"),
		focus: null,
		tasks: [],
		topics: [topic("bayes", "Bayes", { level: "independent", introduced: "2026-11-01" }), topic("geometric", "Geometric distribution", { starts: "2026-11-29" }), topic("covariance", "Covariance", { starts: "2026-12-01" })],
		edges: [],
	},
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
};

describe("a start with no room before the exam (1 m11)", () => {
	it("reads After the exam on the course page, the planned day kept in its hint", () => {
		const rows = courseGroups(course).flatMap((g) => g.topics);
		const geometric = rows.find((r) => r.topic.handle === "geometric")!;
		assert.equal(geometric.factWords, "After the exam");
		assert.match(geometric.fact?.words ?? "", /Planned .*29 Nov/);
		assert.equal(rows.find((r) => r.topic.handle === "covariance")!.factWords, "Planned 1 Dec", "a topic the exam does not leave out keeps its day");
	});
});
