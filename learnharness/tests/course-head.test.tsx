/**
 * The course page head (components/course-page/course-head/): its facts,
 * from the engine's plan and record only, and what it drops and keeps: no
 * progress words and no line that repeats the rows, the title kept and the
 * press in Now under it, Context in place of Add material, "Studied"
 * opening his last session, and what the exam's plan leaves out in the
 * readiness fact's answer.
 */

import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, CourseMapTopic, ExamGapReason, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead } from "../components/course-page/course-model.ts";
import { examGaps, lastSessionOf, namesWords } from "../components/course-page/course-head/head-facts.ts";
import { EXAM_GAP_WORDS, examGapAsk } from "../components/study-words.ts";
import { topicPress } from "../components/unit-inbox/start-unit.ts";
import { CourseHead } from "../components/course-page/course-head/course-head.tsx";
import { CourseNow } from "../components/course-page/course-head/course-now.tsx";
import { StartScope } from "../components/start/start-scope.tsx";
import { ExamGapLine } from "../components/course-page/course-head/exam-gaps.tsx";
import { columnsOf } from "./helpers/course-columns.ts";
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


describe("a list of topics", () => {
	it("names every topic, never \"and others\" and never a count", () => {
		assert.equal(namesWords(["A", "B", "C", "D", "E"]), "A, B, C, D and E");
		assert.equal(namesWords(["A", "B"]), "A and B");
		assert.equal(namesWords(["A"]), "A");
	});
});

const chat = (id: string, updatedAt: string, workspace = WS): ChatListItem =>
	({ id, title: `Session ${id}`, kind: "teach", createdAt: updatedAt, updatedAt, messageCount: 2, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false, course: { workspace, title: "Probability" } }) as ChatListItem;

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
	it("keeps the title and the press in Now, puts Context in place of Add material, drops progress words and lines repeating the rows, and Studied opens the last session", () => {
		const columns = columnsOf(viewOf(course({}, { due: [h("bayes")] }), [chat("b", "2026-11-06T09:00:00Z")]));
		const document = render(
			<>
				<CourseHead {...columns} />
				<CourseNow {...columns} />
			</>,
		);
		const text = document.body.textContent ?? "";
		assert.equal(document.querySelector("[data-slot=course-title]")?.textContent, "Probability");
		assert.ok(document.querySelector("[data-slot=course-now] [data-slot=course-action]"));
		assert.ok(document.querySelector("[data-slot=course-context]"));
		assert.ok(document.querySelector("[data-slot=course-add-material]") === null);
		assert.ok(document.querySelector("[data-slot=course-next]") === null);
		assert.doesNotMatch(text, /on your own/i);
		assert.equal(document.querySelector("[data-slot=course-studied]")?.getAttribute("href"), "/chat/b");
		assert.ok(document.querySelector("[data-slot=page-head] [data-slot=course-exam]") === null, "the exam is a stop on the road, not in the head");
	});
});

describe("a lesson that could not start", () => {
	const noop = () => {};
	it("is said inside the head, under the button he pressed, and nothing otherwise", () => {
		const head = (error: string | null) =>
			render(
				<StartScope lesson={{ start: noop, take: noop, starting: null, busy: false, error, setupOpen: false, openSetup: noop, closeSetup: noop }}>
					<CourseHead {...columnsOf(viewOf(course()))} />
				</StartScope>,
			);
		assert.ok(head(null).querySelector('[role="alert"]') === null);
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

	const gapLine = (c: StudyCourse) => render(<ExamGapLine course={c} chats={[]} />).querySelector('[data-slot="course-exam-gaps"]');

	it("says why in the readiness fact's answer, names what that line does not, and offers a way in: start or review it today, or ask the tutor", () => {
		const one = gapLine(gapped(["variance"], [], { variance: "full" }))!;
		assert.equal(one.querySelector("[data-slot=exam-gaps-why]")?.textContent, "Your pace fills every study day before the exam.");
		assert.deepEqual([...one.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.start, EXAM_GAP_WORDS.ask]);
		const review = gapLine(gapped([], ["binomial"], { binomial: "full" }))!;
		assert.equal(review.querySelector("[data-slot=exam-gaps-why]")?.textContent, "Your pace fills every day of the final review.");
		assert.deepEqual([...review.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.review, EXAM_GAP_WORDS.ask]);
		const late = gapLine(gapped([], ["poisson"], { poisson: "too_late" }))!;
		assert.equal(late.querySelector("[data-slot=exam-gaps-why]")?.textContent, "Poisson starts too close to the exam for a review.", "the topic that starts too late is named");
		assert.deepEqual([...late.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.start, EXAM_GAP_WORDS.ask], "a topic never taught is started, never reviewed");
		const both = gapLine(gapped(["variance", "geometric"], ["binomial"], { variance: "not_ready", geometric: "not_ready", binomial: "full" }))!;
		assert.equal(
			both.querySelector("[data-slot=exam-gaps-why]")?.textContent,
			"What comes first won’t be solid in time. The final review has no room for Binomial at your pace.",
			"the engine's reason for each, each said once, in two sentences",
		);
		assert.doesNotMatch(both.textContent ?? "", /\d/, "no counts");
	});

	it("says no reason the engine does not give, never a default 'your pace fills' (round 13, 1 n4)", () => {
		const review = gapLine(gapped([], ["binomial", "poisson"]))!;
		assert.ok(review.querySelector("[data-slot=exam-gaps-why]") === null, "no why for a gap the engine gives no reason for");
		assert.doesNotMatch(review.textContent ?? "", /pace/);
		const start = gapLine(gapped(["variance"], []))!;
		assert.doesNotMatch(start.textContent ?? "", /pace/);
	});

	it("names the one topic it offers when the line names two (round 12, 1 m2: \"No room… for Inner products and Orthogonal projection… Start it today\")", () => {
		const needs = [{ kind: "needs" as const, topic: h("projection"), prerequisite: h("inner") }];
		const c = gapped(["inner", "projection"], [], { inner: "full", projection: "full" });
		const map = { ...c.map, topics: [...c.map.topics, topic("inner", { title: "Inner products" }), topic("projection", { title: "Orthogonal projection" })], edges: needs };
		const line = gapLine({ ...c, map })!;
		assert.deepEqual([...line.querySelectorAll("button")].map((b) => b.textContent), ["Start Inner products today", EXAM_GAP_WORDS.ask]);
	});

	it("says the round-8 gap in two sentences, your pace once, every reason naming the topics it alone covers (round 8: five sentences)", () => {
		const c = gapped(["expectation", "variance"], ["binomial", "poisson", "geometric"], { expectation: "full", variance: "not_ready", binomial: "full", poisson: "full", geometric: "too_late" });
		const map = { ...c.map, topics: [...c.map.topics, topic("expectation"), topic("geometric")] };
		const line = gapLine({ ...c, map })!;
		const why = line.querySelector("[data-slot=exam-gaps-why]")?.textContent ?? "";
		assert.equal(why, "Your pace fills every study day before the exam, and what Variance needs won’t be solid in time. The final review has no room for Binomial and Poisson, and Geometric starts too close to the exam for a review.");
		assert.equal(why.split(". ").length, 2, "two sentences");
		assert.equal(why.match(/your pace/gi)?.length, 1, "your pace once");
	});

	it("picks one way in and keeps the rest under Or another (round 8: eight options and no pick)", () => {
		const needs = (topic: string, prerequisite: string) => ({ kind: "needs" as const, topic: h(topic), prerequisite: h(prerequisite) });
		const c = gapped(["expectation"], ["binomial", "poisson"], { expectation: "full", binomial: "full", poisson: "full" });
		const map = { ...c.map, topics: [...c.map.topics, topic("expectation")], edges: [needs("poisson", "binomial")] };
		const line = gapLine({ ...c, map })!;
		const presses = [...line.querySelectorAll("button")].map((b) => b.textContent);
		assert.deepEqual(presses, ["Review Binomial today", EXAM_GAP_WORDS.another, EXAM_GAP_WORDS.ask], "a review of a taught topic is the pick, as the tutor orders it (round 10, 1 m6)");
	});

	it("picks today's plan first, as Home and the tutor do, and lists it before the gaps (round 11, 1 N10: Review Conditional probability while Home and the tutor began with Binomial)", () => {
		const c = gapped(["variance"], ["bayes"], { variance: "full", bayes: "full" });
		const due = { kind: "due" as const, date: "2026-11-08", overdue: 2 };
		const topics = [
			topic("bayes", { level: "assisted", introduced: "2026-11-01" }),
			topic("binomial", { level: "attempted", introduced: "2026-11-03", review: due }),
			topic("poisson", { starts: "2026-11-08" }),
			topic("variance"),
		];
		const map = { ...c.map, topics };
		assert.deepEqual(
			examGaps(map)!.ways.map((w) => `${w.starts ? "Start" : "Review"} ${w.topic.handle}`),
			["Review binomial", "Start poisson", "Review bayes", "Start variance"],
			"today's reviews, then today's starts, then the gaps",
		);
		const line = gapLine({ ...c, map })!;
		assert.deepEqual([...line.querySelectorAll("button")].map((b) => b.textContent), ["Review Binomial today", EXAM_GAP_WORDS.another, EXAM_GAP_WORDS.ask]);
		const needsPoisson = [{ kind: "needs" as const, topic: h("variance"), prerequisite: h("poisson") }];
		const alone = gapLine({ ...c, map: { ...map, topics: [topics[0]!, topics[1]!, topics[3]!], exam: { ...map.exam!, doesNotFit: [h("variance")], unreviewed: [] }, edges: needsPoisson } })!;
		assert.deepEqual([...alone.querySelectorAll("button")].map((b) => b.textContent), ["Review Binomial today", EXAM_GAP_WORDS.ask], "today's one item named, never \"Review it today\" for a topic the line does not name");
	});

	it("offers only what he can do today: review what is taught, start what has its prerequisites taught, nothing for the rest (round 7: Review Poisson, Start Variance before Expectation)", () => {
		const needs = (topic: string, prerequisite: string) => ({ kind: "needs" as const, topic: h(topic), prerequisite: h(prerequisite) });
		const c = gapped(["geometric", "expectation", "variance"], ["binomial", "poisson"]);
		const map = { ...c.map, topics: [...c.map.topics, topic("geometric"), topic("expectation")], edges: [needs("variance", "expectation"), needs("poisson", "binomial"), needs("geometric", "binomial")] };
		const ways = examGaps(map)!.ways.map((w) => `${w.starts ? "Start" : "Review"} ${w.topic.handle}`);
		assert.deepEqual(ways, ["Review binomial", "Start geometric", "Start expectation", "Start poisson"]);
		const stuck = gapLine({ ...c, map: { ...map, exam: { ...map.exam!, doesNotFit: [h("variance")], unreviewed: [] } } })!;
		assert.deepEqual([...stuck.querySelectorAll("button")].map((b) => b.textContent), [EXAM_GAP_WORDS.ask], "named, with only the tutor to ask");
	});

	it("shows when a topic has no room, and nothing when every topic fits", () => {
		assert.ok(gapLine(gapped(["variance"], [], { variance: "no_study_day" })));
		assert.ok(gapLine(course()) === null);
	});

	it("asks the tutor in his words, naming the topics", () => {
		assert.equal(examGapAsk(["Variance"]), "My exam plan has no room for Variance. How can I still fit it in before the exam?");
		assert.equal(examGapAsk(["Variance", "Binomial"]), "My exam plan has no room for Variance and Binomial. How can I still fit them in before the exam?");
	});
});

describe("a topic he began, on the exam's ways in (round 12, 1 D5: Start Poisson distribution opened a second chat for the lesson)", () => {
	it("reads Continue and opens the lesson's own chat, never a new one", () => {
		const task = { key: "poisson-lesson", title: "Poisson distribution lesson", step: "The help-desk question", updated: "2026-11-10" };
		const lesson = { ...chat("chat_poisson", "2026-11-10T10:00:00Z"), title: "Poisson", ownTopics: ["poisson"], topics: ["poisson"], ended: "left", studied: true, tasks: [task.key] } as ChatListItem;
		const topics = [topic("bayes", { level: "assisted", introduced: "2026-11-01" }), topic("poisson", { tasks: [task.key] }), topic("geometric")];
		const c = course({ today: "2026-11-17", topics, tasks: [task], exam: { date: "2026-11-19", daysLeft: 2, finalReview: "2026-11-17", doesNotFit: [h("poisson"), h("geometric")], unreviewed: [], reasons: {} } });
		const press = topicPress(topics[1]!, c.map, [lesson]);
		assert.equal(press.resume?.id ?? "a new chat", "chat_poisson");
		assert.equal(press.continues, true);
		const line = render(<ExamGapLine course={c} chats={[lesson]} />).querySelector("[data-slot=course-exam-gaps]")!;
		assert.deepEqual([...line.querySelectorAll("button")].map((b) => b.textContent), ["Continue Poisson today", EXAM_GAP_WORDS.another, EXAM_GAP_WORDS.ask]);
		assert.equal(topicPress(topics[2]!, c.map, [lesson]).resume, null, "a topic he never began still starts");
	});
});
