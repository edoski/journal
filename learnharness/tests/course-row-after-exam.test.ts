/**
 * A start the exam's plan puts after the exam says so on the exam's course
 * page (round 12, 1 m11): Geometric read "Planned 29 Nov" and Variance
 * "Planned 30 Nov" there, while their topic pages said "Not before the
 * exam". In the topic page's own words (round 15, M7: on the exam eve
 * Geometric and Variance, exam topics that won't fit, and Covariance, which
 * the exam leaves out, all read "After the exam"): an exam topic with no
 * room is "Not before the exam", a topic the exam leaves out "Not on the
 * exam".
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
		exam: { date: "2026-11-19", daysLeft: 2, finalReview: "2026-11-17", doesNotFit: [h("geometric")], unreviewed: [], reasons: {}, leavesOut: [h("covariance")] },
		current: h("bayes"),
		focus: null,
		tasks: [],
		topics: [topic("bayes", "Bayes", { level: "independent", introduced: "2026-11-01" }), topic("geometric", "Geometric distribution", { starts: "2026-11-29" }), topic("covariance", "Covariance", { starts: "2026-12-01" }), topic("markov", "Markov chains", { starts: "2026-12-03" })],
		edges: [],
	},
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
};

describe("a start with no room before the exam (1 m11)", () => {
	it("reads Not before the exam for an exam topic with no room, Not on the exam for one the exam leaves out, the planned day kept in the hint", () => {
		const rows = courseGroups(course).flatMap((g) => g.topics);
		const geometric = rows.find((r) => r.topic.handle === "geometric")!;
		assert.equal(geometric.factWords, "Not before the exam");
		assert.match(geometric.fact?.words ?? "", /Planned .*29 Nov/);
		const covariance = rows.find((r) => r.topic.handle === "covariance")!;
		assert.equal(covariance.factWords, "Not on the exam");
		assert.match(covariance.fact?.words ?? "", /Planned .*1 Dec/);
		assert.equal(rows.find((r) => r.topic.handle === "markov")!.factWords, "Planned 3 Dec", "a topic the exam's plan says nothing of keeps its day");
	});

	it("reads Not before the exam for the topic he is at too, never You are here (round 13, 1 n2)", () => {
		const here = { ...course, map: { ...course.map, current: h("geometric") } };
		const geometric = courseGroups(here).flatMap((g) => g.topics).find((r) => r.topic.handle === "geometric")!;
		assert.equal(geometric.factWords, "Not before the exam");
		assert.match(geometric.fact?.words ?? "", /Planned .*29 Nov/);
	});
});
