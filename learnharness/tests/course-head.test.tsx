/**
 * The course page head candidates (components/course-page/course-head/):
 * the facts each adds, from the engine's plan and record only, and what
 * every candidate drops and keeps: no progress words and no line that
 * repeats the rows, the title and the press kept, Context in place of
 * Add material, "Studied" opening his last session.
 */

import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, CourseMapTopic, ExamGapReason, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead } from "../components/course-page/course-model.ts";
import { examGaps, lastSessionOf, namesWords, paceOf } from "../components/course-page/course-head/head-facts.ts";
import { EXAM_GAP_WHY, EXAM_GAP_WORDS, examGapAsk } from "../components/study-words.ts";
import { PaceHead } from "../components/course-page/course-head/pace-head.tsx";
import { CourseLessonError } from "../components/course-page/course-head/head-parts.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle[0]!.toUpperCase() + handle.slice(1), level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });
const WS = "/study/probability";

function course(over: Partial<StudyCourse["map"]> = {}, rest: Partial<Omit<StudyCourse, "map">> = {}): StudyCourse {
	return {
		map: {
			workspace: WS,
			title: "Probability",
			today: "2026-11-08",
			revision: 1,
			exam: { date: "2026-11-19", daysLeft: 11 },
			current: h("bayes"),
			focus: null,
			tasks: [],
			topics: [topic("bayes", { level: "assisted", introduced: "2026-11-01" }), topic("binomial", { level: "attempted", introduced: "2026-11-03" }), topic("poisson"), topic("variance")],
			edges: [],
			...over,
		},
		unready: null,
		due: [],
		lastActiveDaysAgo: 2,
		newToday: [],
		...rest,
	};
}

const plan = (doesNotFit: string[] = []) => ({ doesNotFit: doesNotFit.map(h), planned: [{ date: "2026-11-08", reviews: [], new: [h("poisson")] }, { date: "2026-11-12", reviews: [], new: [h("variance")] }] });

describe("pace, from the engine's plan", () => {
	it("names the topics the plan has no room for before the exam first", () => {
		assert.deepEqual(paceOf(course({}, { unready: [h("bayes")] }), plan(["variance"])), { kind: "short", words: "No room before the exam to start Variance" });
	});

	it("inside the run-up, names the topics not yet solid", () => {
		assert.deepEqual(paceOf(course({}, { unready: [h("bayes"), h("binomial")] }), plan()), { kind: "unready", words: "Not yet solid for the exam: Bayes and Binomial" });
	});

	it("says every topic fits, or that every topic is started", () => {
		assert.equal(paceOf(course(), plan())?.words, "Every topic fits before the exam");
		const taught = course({ topics: [topic("bayes", { introduced: "2026-11-01" }), topic("poisson", { excluded: "Not examined" })] });
		assert.equal(paceOf(taught, plan())?.words, "Every topic started");
	});

	it("says nothing with no exam ahead or before the plan is read", () => {
		assert.equal(paceOf(course({ exam: null }), plan()), null);
		assert.equal(paceOf(course(), null), null);
	});

	it("names four or more topics as three and others, never a count", () => {
		assert.equal(namesWords(["A", "B", "C", "D", "E"]), "A, B, C and others");
	});
});

const chat = (id: string, updatedAt: string, workspace = WS): ChatListItem =>
	({ id, title: `Session ${id}`, kind: "teach", createdAt: updatedAt, updatedAt, messageCount: 2, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false, compacting: false, course: { workspace, title: "Probability" } }) as ChatListItem;

describe("his last session", () => {
	it("is the course's latest, never another course's", () => {
		const chats = [chat("a", "2026-11-05T09:00:00Z"), chat("b", "2026-11-06T09:00:00Z"), chat("c", "2026-11-07T09:00:00Z", "/study/other")];
		assert.deepEqual(lastSessionOf(WS, chats), { id: "b", title: "Session b" });
		assert.equal(lastSessionOf(WS, []), null);
	});
});

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close: () => {} }) as never}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

function viewOf(c: StudyCourse, chats: ChatListItem[] = []) {
	const read = courseRead({ status: "ready", courses: [c], failed: [], open: [], chats }, c.map.workspace);
	assert.equal(read.status, "ready");
	return (read as Extract<typeof read, { status: "ready" }>).view;
}

describe("the course head", () => {
	for (const [name, Head] of [["Pace", PaceHead]] as const) {
		it(`${name}: the title and the press stay, Context replaces Add material, no progress words, no line repeating the rows, Studied opens the last session`, () => {
			const document = render(<Head view={viewOf(course({}, { due: [h("bayes")] }), [chat("b", "2026-11-06T09:00:00Z")])} busy={false} onContinue={() => {}} />);
			const text = document.body.textContent ?? "";
			assert.equal(document.querySelector("[data-slot=course-title]")?.textContent, "Probability");
			assert.ok(document.querySelector("[data-slot=course-action]"));
			assert.ok(document.querySelector("[data-slot=course-context]"));
			assert.equal(document.querySelector("[data-slot=course-add-material]"), null);
			assert.equal(document.querySelector("[data-slot=course-next]"), null);
			assert.doesNotMatch(text, /on your own/i);
			assert.equal(document.querySelector("[data-slot=course-studied]")?.getAttribute("href"), "/chat/b");
			assert.match(document.querySelector("[data-slot=course-exam]")?.textContent ?? "", /Exam in 11 days/);
		});
	}
});

describe("a lesson that could not start", () => {
	it("is said inside the head, under the button he pressed, and nothing otherwise", () => {
		const head = (error: string | null) =>
			render(
				<CourseLessonError value={error}>
					<PaceHead view={viewOf(course())} busy={false} onContinue={() => {}} />
				</CourseLessonError>,
			);
		assert.equal(head(null).querySelector('[role="alert"]'), null);
		const alert = head("Couldn’t open the session. Try again.").querySelector('[data-slot="page-head"] [role="alert"]');
		assert.equal(alert?.textContent, "Couldn’t open the session. Try again.");
	});
});

describe("what the final review leaves out (round 6: Variance had no word, Random variables showed only in the calendar)", () => {
	const gapped = (doesNotFit: string[], unreviewed: string[], reasons: Record<string, ExamGapReason> = {}) =>
		course({ exam: { date: "2026-11-19", daysLeft: 11, finalReview: "2026-11-14", doesNotFit: doesNotFit.map(h), unreviewed: unreviewed.map(h), reasons } });

	it("reads the engine's two facts: the topics it has no room to start, and the taught ones its final review has no room for", () => {
		const gaps = examGaps(gapped(["variance"], ["binomial"]).map);
		assert.deepEqual(gaps && { start: gaps.start.map((t) => t.handle), review: gaps.review.map((t) => t.handle) }, { start: ["variance"], review: ["binomial"] });
		assert.equal(examGaps(gapped([], []).map), null);
		assert.equal(examGaps(course({ exam: null }).map), null);
		assert.equal(examGaps(course({ exam: { date: "2026-11-01", daysLeft: -7, unreviewed: [h("binomial")] } }).map), null, "once the exam has passed");
	});

	it("never says every topic fits while the final review leaves one out", () => {
		assert.deepEqual(paceOf(gapped([], ["binomial"]), plan()), { kind: "short", words: "No room in the final review for Binomial" });
		assert.deepEqual(paceOf(gapped(["variance"], ["binomial"]), plan(["variance"])), { kind: "short", words: "No room before the exam to start Variance" }, "what has no room to start first");
	});

	const gapLine = (c: StudyCourse, lead?: React.ReactNode) => render(<PaceHead view={viewOf(c)} busy={false} onContinue={() => {}} lead={lead} />).querySelector('[data-slot="page-head"] [data-slot="course-exam-gaps"]');

	it("says why under the head's first line, names what that line does not, and offers a way in: start or review it today, or ask the tutor", () => {
		const one = gapLine(gapped(["variance"], [], { variance: "full" }))!;
		assert.equal(one.querySelector("[data-slot=exam-gaps-why]")?.textContent, `${EXAM_GAP_WHY.start.full}.`);
		assert.deepEqual([...one.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.start, EXAM_GAP_WORDS.ask]);
		const review = gapLine(gapped([], ["binomial"], { binomial: "full" }))!;
		assert.equal(review.querySelector("[data-slot=exam-gaps-why]")?.textContent, `${EXAM_GAP_WHY.review.full}.`);
		assert.deepEqual([...review.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.review, EXAM_GAP_WORDS.ask]);
		const late = gapLine(gapped([], ["poisson"], { poisson: "too_late" }))!;
		assert.equal(late.querySelector("[data-slot=exam-gaps-why]")?.textContent, "Starts too close to the exam for a review.");
		assert.deepEqual([...late.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.start, EXAM_GAP_WORDS.ask], "a topic never taught is started, never reviewed");
		const both = gapLine(gapped(["variance", "geometric"], ["binomial"], { variance: "not_ready", geometric: "not_ready", binomial: "full" }))!;
		assert.equal(
			both.querySelector("[data-slot=exam-gaps-why]")?.textContent,
			`${EXAM_GAP_WHY.start.not_ready}. No room in the final review for Binomial either. ${EXAM_GAP_WHY.review.full}.`,
			"the engine's reason for each, each said once",
		);
		assert.deepEqual([...both.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.startOne, EXAM_GAP_WORDS.ask], "one press picks which, from a menu");
		assert.doesNotMatch(both.textContent ?? "", /\d/, "no counts");
	});

	it("offers only what he can do today: review what is taught, start what has its prerequisites taught, nothing for the rest (round 7: Review Poisson, Start Variance before Expectation)", () => {
		const needs = (topic: string, prerequisite: string) => ({ kind: "needs" as const, topic: h(topic), prerequisite: h(prerequisite) });
		const c = gapped(["geometric", "expectation", "variance"], ["binomial", "poisson"]);
		const map = { ...c.map, topics: [...c.map.topics, topic("geometric"), topic("expectation")], edges: [needs("variance", "expectation"), needs("poisson", "binomial"), needs("geometric", "binomial")] };
		const ways = examGaps(map)!.ways.map((w) => `${w.starts ? "Start" : "Review"} ${w.topic.handle}`);
		assert.deepEqual(ways, ["Start geometric", "Start expectation", "Review binomial", "Start poisson"]);
		const stuck = gapLine({ ...c, map: { ...map, exam: { ...map.exam!, doesNotFit: [h("variance")], unreviewed: [] } } })!;
		assert.deepEqual([...stuck.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.ask], "named, with only the tutor to ask");
	});

	it("shows under either candidate's first line, and nothing when every topic fits", () => {
		assert.ok(gapLine(gapped(["variance"], [], { variance: "no_study_day" }), <p data-slot="course-ready">Ready line</p>), "the Exam & mistakes candidates keep it");
		assert.equal(gapLine(course()), null);
	});

	it("asks the tutor in his words, naming the topics", () => {
		assert.equal(examGapAsk(["Variance"]), "My exam plan has no room for Variance. How can I still fit it in before the exam?");
		assert.equal(examGapAsk(["Variance", "Binomial"]), "My exam plan has no room for Variance and Binomial. How can I still fit them in before the exam?");
	});
});
