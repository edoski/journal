/**
 * Round 21, m1 to m3 and m5: the plan's words on the course head and the
 * topic page are literal and name what he can act on.
 *
 * m1 (1 m3): the head popover joined titles that hold "and" with "and":
 * "Joint distributions and independent random variables and Geometric
 * distribution start too close to the exam for a review".
 * m2 (1 m4, 2 n2): the amber head line said "leaves some topics out" of
 * one topic, and of Diagonalization alone, which starts 25 Nov with nothing
 * to review; behind it, "Your pace fills every day of the final review."
 * m3 (3 n4): Expectation's page read "Planned Mon 9 Nov, after Linear
 * Algebra's new topics", and the plan started no Linear Algebra topic on
 * those days.
 * m5 (1 m5): Builds-on rows read "Check on your own", which says neither
 * what happened nor what to do.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseExam, CourseMap, CourseMapTopic, TopicHandle } from "../src/core/index.ts";
import { examGapWhyWords, finalReviewLineWords, finalReviewMissWords, standingWords } from "../components/study-words.ts";
import { examGaps } from "../components/course-page/course-head/head-facts.ts";
import { examGapWhich } from "../components/course-page/course-head/exam-gaps.tsx";
import { examReady } from "../components/course-page/standing/standing-model.ts";
import { plannedWords } from "../components/unit-inbox/topic-page/pickup/pickup-facts.ts";
import { buildsOn, topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import type { StudyCourse } from "../src/core/index.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });

/** Linear Algebra on the demo's 8 Nov: the final review leaves out one topic. */
function linearAlgebra(left: CourseMapTopic, rest: CourseMapTopic[] = []): StudyCourse {
	const exam: CourseExam = { date: "2026-12-03", daysLeft: 25, finalReview: "2026-11-27", doesNotFit: [], unreviewed: [left.handle], reasons: { [left.handle]: "full" } };
	return {
		map: { workspace: "/s/la", title: "Linear Algebra", today: "2026-11-08", revision: 1, exam, current: null, focus: null, tasks: [], topics: [topic("vectors", "Vectors", { level: "retained", introduced: "2026-10-01" }), left, ...rest], edges: [] },
		unready: null,
		due: [],
		lastActiveDaysAgo: 0,
		newToday: [],
	} as StudyCourse;
}

/** A course as the pages read it, its map alone mattering here. */
const studied = (map: CourseMap): StudyCourse => ({ map, unready: null, due: [], lastActiveDaysAgo: 0, newToday: [] }) as StudyCourse;

const READINESS = { parts: [{ wontFit: [], notYet: [], toStart: [], ready: [] }] } as never;

describe("round 21, m2: the head's final-review line", () => {
	const diagonalization = topic("diag", "Diagonalization", { starts: "2026-11-25" });
	const hypergeometric = topic("hyper", "Hypergeometric distribution", { level: "attempted", introduced: "2026-11-02" });

	it("says nothing while every topic the final review leaves out is not started yet", () => {
		const la = linearAlgebra(diagonalization);
		assert.equal(examGaps(la.map), null, "no popover of gaps");
		const ready = examReady(READINESS, la.map, null, []);
		assert.notEqual(ready.kind, "short", `no amber line: "${ready.words}"`);
		assert.doesNotMatch(ready.words, /final review|some topics/);
	});

	it("names the one taught topic it leaves out, and its popover says no pace", () => {
		const la = linearAlgebra(hypergeometric, [diagonalization]);
		const ready = examReady(READINESS, la.map, null, []);
		assert.equal(ready.words, "Your final review before 3 Dec leaves out Hypergeometric distribution.");
		const gaps = examGaps(la.map)!;
		assert.equal(examGapWhyWords([], [{ title: "Hypergeometric distribution", reason: "full" }], false), null, "no \"Your pace fills every day of the final review.\"");
		assert.ok(!examGapWhich(la, gaps).some((line) => line.includes("Hypergeometric")), "Which topics does not repeat the topic the line names");
	});

	it("says some topics when it leaves out several taught ones", () => {
		assert.equal(finalReviewLineWords({ date: "2026-12-03", daysLeft: 25 }, ["Rank", "Kernel"]), "Your final review before 3 Dec leaves some topics out.");
	});
});

describe("round 21, m1: the head popover's lists of titles", () => {
	it("joins titles by commas, since a title may hold its own \"and\"", () => {
		const why = examGapWhyWords(
			[{ title: "Variance", reason: "full" }],
			[
				{ title: "Joint distributions and independent random variables", reason: "too_late" },
				{ title: "Geometric distribution", reason: "too_late" },
			],
			false,
		);
		assert.equal(why, "Your pace fills every study day before the exam. Joint distributions and independent random variables, Geometric distribution start too close to the exam for a review.");
		assert.equal(
			finalReviewMissWords(["Law of total probability and Bayes' rule", "Odds"], { finalReview: "2026-11-17" }, "2026-11-17"),
			"Law of total probability and Bayes' rule, Odds are not revisited in the final review",
		);
	});
});

describe("round 21, m3: a topic page's start says its day, never another course's new topics", () => {
	it("reads \"Planned Mon 9 Nov\" for Expectation, whatever courses the engine says come first", () => {
		const expectation = topic("expectation", "Expectation and linearity", { starts: "2026-11-09", startsAfter: ["Linear Algebra"] });
		const map = { workspace: "/s/prob", title: "Probability", today: "2026-11-08", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [expectation], edges: [] } as unknown as CourseMap;
		const facts = topicFacts({ course: studied(map), topic: expectation, chats: [], read: null });
		assert.equal(plannedWords(facts), "Planned Mon 9 Nov");
		assert.equal(facts.starts?.waits ?? null, null);
	});
});

describe("round 21, m5: where he stands on a topic it builds on", () => {
	const binomial = topic("binomial", "Binomial distribution", { level: "attempted", introduced: "2026-11-01", weak: true, right: "unaided", review: { kind: "due", date: "2026-11-10", overdue: 7 } });

	it("says the check is today on a weak topic he got right on his own whose review is due, never \"Check on your own\"", () => {
		assert.equal(standingWords(0.5, binomial), "Check again today");
		assert.equal(standingWords(0.5, { ...binomial, review: { kind: "scheduled", date: "2026-11-20" } }), "Check again another day");
	});

	it("gives Builds on the head's words", () => {
		const poisson = topic("poisson", "Poisson distribution", { starts: "2026-12-06" });
		const map = { workspace: "/s/prob", title: "Probability", today: "2026-11-17", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [binomial, poisson], edges: [{ kind: "needs", topic: h("poisson"), prerequisite: h("binomial") }] } as unknown as CourseMap;
		const [row] = buildsOn(poisson, map);
		const head = topicFacts({ course: studied(map), topic: binomial, chats: [], read: null }).standing?.words;
		assert.equal(row?.words, head);
		assert.equal(row?.words, "Check again today");
	});
});
