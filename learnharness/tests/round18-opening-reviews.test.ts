/**
 * Round 18, m17 (3 n6): Start on Poisson, 8 Nov, opened "First, your
 * Binomial distribution review.", then "Next, your Random variables and
 * distributions review." with two questions: four answers and about 1.5
 * minutes before Poisson's probe. Poisson builds on Binomial only. The
 * brief listed all three of the day's due reviews with nothing to say
 * which the lesson builds on, and the prompt said "a due review it
 * touches comes first". The brief now says which, and the rest stay
 * Home's.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectCourseBrief } from "../src/core/course-brief.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";

const signals: CourseMapTopic["signals"] = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, extra: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: handle as TopicHandle, title, level: "assisted", introduced: "2026-10-01", review: { kind: "due", date: "2026-11-08", overdue: 1 }, weak: false, signals, tasks: [], ...extra });
const needs = (prerequisite: string, t: string) => ({ kind: "needs" as const, prerequisite: prerequisite as TopicHandle, topic: t as TopicHandle });
const PROBABILITY: CourseMap = {
	workspace: "/study/probability",
	title: "Probability",
	today: "2026-11-08",
	revision: 1,
	exam: { date: "2026-11-19", daysLeft: 11 },
	current: null,
	focus: null,
	tasks: [],
	topics: [
		topic("binomial", "Binomial distribution"),
		topic("inclusion-exclusion", "Inclusion-exclusion principle"),
		topic("random-variables", "Random variables and distributions"),
		topic("poisson", "Poisson distribution", { level: "new", introduced: null, review: null, starts: "2026-11-17" }),
	],
	edges: [needs("binomial", "poisson"), needs("binomial-coefficients", "inclusion-exclusion")],
};
const plan = { workspace: "/study/probability", courses: [{ map: PROBABILITY, days: [] }], unread: [] };
const RESUME = { today: "2026-11-08", due: [{ topic: "binomial", overdue: 2, level: "assisted" }, { topic: "inclusion-exclusion", overdue: 1, level: "assisted" }, { topic: "random-variables", overdue: 1, level: "assisted" }] };

describe("a lesson's opening runs only the reviews it builds on (round 18, m17)", () => {
	it("Poisson's brief takes Binomial first and leaves the other two to Home", () => {
		const { text } = projectCourseBrief(RESUME, "teach", { plan, opened: ["poisson"] });
		assert.match(text, /poisson builds on binomial: its review comes first, opened with one plain line naming it\. inclusion-exclusion, random-variables are not one poisson builds on: Home offers their reviews, so this lesson leaves them alone\./);
	});

	it("a lesson that builds on none of them opens on the lesson", () => {
		const { text } = projectCourseBrief({ today: "2026-11-08", due: [RESUME.due[2]] }, "teach", { plan, opened: ["poisson"] });
		assert.match(text, /poisson builds on none of them, so it opens on the lesson\. random-variables is not one poisson builds on/);
	});

	it("a review, and a session opened on nothing, keep the plain list", () => {
		assert.doesNotMatch(projectCourseBrief(RESUME, "teach", { plan, opened: ["inclusion-exclusion"], review: true }).text, /builds on/);
		assert.doesNotMatch(projectCourseBrief(RESUME, "teach", { plan }).text, /builds on/);
	});

	it("the prompt runs only those first", () => {
		assert.match(courseRecordPrompt("teacher", { arcs: true }), /A due review of a topic it builds on comes first, as above, and only those/);
	});
});
