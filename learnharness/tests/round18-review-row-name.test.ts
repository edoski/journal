/**
 * Round 18, m10 (3 n5; round 17's m5, in part): Home's due review row and
 * its sidebar card read "Review Binomial distribution, Inclusion-exclusion
 * principle, Random variables and distributions", clamped at "…and…" in
 * the sidebar, while the session it opens is "Probability review". A
 * line names one topic at most; the session still opens on all three.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseMove, todayRows } from "../components/study-home/study-facts.ts";
import { lessonTitle } from "../components/study-home/agenda-rows/row-facts.ts";
import { lessonOf } from "../components/study-home/lesson-facts.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { map, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-08";
const due = { kind: "due" as const, date: "2026-11-06", overdue: 2 };
const PROB: StudyCourse = {
	map: map({
		workspace: "/s/prob",
		title: "Probability",
		today: TODAY,
		current: "random-variables" as TopicHandle,
		topics: [
			topic("binomial", "Binomial distribution", { level: "retained", review: due }),
			topic("inclusion-exclusion", "Inclusion-exclusion principle", { level: "retained", review: due }),
			topic("random-variables", "Random variables and distributions", { level: "retained", review: due }),
		],
	}),
	unready: null,
	due: ["binomial", "inclusion-exclusion", "random-variables"] as TopicHandle[],
	newToday: [],
	lastActiveDaysAgo: 0,
};
const LA: StudyCourse = { ...PROB, map: map({ today: TODAY, topics: [topic("homomorphism", "Homomorphisms (linear maps)", { level: "retained", review: { kind: "due", date: TODAY, overdue: 0 } })] }), due: ["homomorphism"] as TopicHandle[] };
const TITLES = ["Binomial distribution", "Inclusion-exclusion principle", "Random variables and distributions"];
const names = (title: string) => TITLES.filter((t) => title.includes(t)).length;

describe("a due review of several topics is named as its session is (round 18, m10)", () => {
	const rows = todayRows([PROB, LA], [], TODAY);
	const review = rows.find((row) => row.kind === "course" && row.course === PROB)!;

	it("Home's row reads Probability review, never the list of its topics", () => {
		assert.equal(lessonTitle(review), "Probability review");
		assert.equal(lessonOf(review).title, "Probability review");
	});

	it("the sidebar's card for it reads the same, and no line names more than one topic", () => {
		for (const line of needsYouNow([PROB, LA], [], TODAY).lines) assert.ok(names(line.title) <= 1, line.title);
	});

	it("a review of one topic keeps its topic's name", () => {
		const one = rows.find((row) => row.kind === "course" && row.course === LA)!;
		assert.equal(lessonTitle(one), "Review Homomorphisms (linear maps)");
	});

	it("the review it opens still opens on all three topics, by their names", () => {
		const move = courseMove(PROB, [], review.kind === "course" ? review.step : undefined);
		assert.equal(move.kind, "start");
		assert.equal(move.kind === "start" && move.opening, `Review ${TITLES.join(", ")}`);
		assert.deepEqual(move.kind === "start" && move.topics, ["binomial", "inclusion-exclusion", "random-variables"]);
	});
});
