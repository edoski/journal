/**
 * The study home's Today: what each line says from the engine's map and
 * plan, the order across courses, what Today's rows say, and
 * that reviews are named by topic, never counted. Same tsx classic-JSX
 * shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
	byUrgency,
	laterOnly,
	nextStepOf,
	stepWords,
	titleList,
	todayRows,
	openSessions,
	todayCourses,
	courseMove,
	withLessonHere,
	type TodayRow,
} from "../components/study-home/study-facts.ts";
import { lessonOf, topicSpan } from "../components/study-home/lesson-facts.ts";
import { LessonButton } from "../components/study-home/lesson-button.tsx";
import { Today } from "../components/study-home/today.tsx";
import { courseProgress, foldLines, lessonTitle, studiedAgo, whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { UnreadableLines } from "../components/study-home/unreadable-course.tsx";
import { studyCourseOf } from "../src/server/study.ts";
import type { ChatListItem, CourseMap, CourseMapTopic, StudyCourse, TopicHandle, TopicLevel } from "../src/core/index.ts";

const TODAY = "2026-11-08";

function topic(handle: string, title: string, level: TopicLevel, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return {
		handle: handle as TopicHandle,
		title,
		level,
		introduced: null,
		review: null,
		weak: false,
		signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false },
		tasks: [],
		...over,
	};
}
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });

function map(over: Partial<CourseMap>): CourseMap {
	return {
		workspace: "/s/linalg",
		title: "Linear Algebra",
		today: TODAY,
		revision: 3,
		exam: null,
		current: null,
		focus: null,
		tasks: [],
		topics: [],
		edges: [],
		...over,
	};
}

const LINALG: StudyCourse = {
	map: map({
		exam: { date: "2026-11-29", daysLeft: 21 },
		current: "rank" as TopicHandle,
		focus: "sheet-4",
		tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Pending question, not yet answered: part (c). He needs the matrix first", updated: "2026-11-05" }],
		topics: [
			topic("vectors", "Vectors", "transferred", { review: { kind: "scheduled", date: "2026-11-13" } }),
			topic("span", "Span", "retained", { review: due(10) }),
			topic("independence", "Linear independence", "assisted", { review: due(16), weak: true, signals: { gap: "Misses a third vector", lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false } }),
			topic("rank", "Rank", "assisted", { review: due(3), weak: true }),
			topic("eigen", "Eigenvalues", "new"),
		],
	}),
	unready: ["span", "independence", "rank", "eigen"] as TopicHandle[],
	due: null,
	newToday: [], lastActiveDaysAgo: 2,
};
const PROB: StudyCourse = {
	map: map({
		workspace: "/s/prob",
		title: "Probability",
		exam: { date: "2026-11-19", daysLeft: 11 },
		current: "bayes" as TopicHandle,
		topics: [topic("conditional", "Conditional probability", "independent", { review: { kind: "scheduled", date: "2026-11-09" } }), topic("bayes", "Bayes' rule", "assisted")],
	}),
	unready: [],
	due: [],
	newToday: [], lastActiveDaysAgo: 4,
};
const ANALYSIS: StudyCourse = {
	map: map({ workspace: "/s/ra", title: "Real Analysis", exam: { date: "2027-01-26", daysLeft: 79 }, topics: [topic("seq", "Sequences", "independent", { review: due(1) })] }),
	unready: null,
	due: ["seq" as TopicHandle],
	newToday: [], lastActiveDaysAgo: 11,
};

function chat(over: Partial<ChatListItem>): ChatListItem {
	return {
		id: "c1",
		title: "Eigen lesson",
		kind: "teach",
		createdAt: "2026-11-08T08:00:00.000Z",
		updatedAt: "2026-11-08T09:00:00.000Z",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		busy: false,
		compacting: false,
		...over,
	};
}

describe("study facts", () => {
	it("words the next step in the order Continue takes it, naming every review with commas and never counting them", () => {
		assert.equal(stepWords(nextStepOf(LINALG)), "Review Linear independence, Rank, Span");
		assert.equal(stepWords(nextStepOf(PROB)), "Continue Bayes' rule");
		assert.equal(titleList(["A", "B", "C"]), "A, B, C");
		assert.equal(titleList(["Random variables and distributions", "Independent events"]), "Random variables and distributions, Independent events");
	});

	it("takes today's review from the engine's plan, in its order", () => {
		const planned: StudyCourse = { ...LINALG, due: ["rank", "span"] as TopicHandle[] };
		const step = nextStepOf(planned);
		assert.equal(stepWords(step), "Review Rank, Span");
		assert.deepEqual(step.kind === "review" && step.topics, ["rank", "span"]);
	});

	it("starts the new topics today's plan names, once reviews and the open task are done", () => {
		const fresh: StudyCourse = { ...PROB, newToday: ["bayes"] as TopicHandle[] };
		const step = nextStepOf(fresh);
		assert.equal(stepWords(step), "Start Bayes' rule");
		assert.deepEqual(step.kind === "topic" && [step.topics, step.planned], [["bayes"], true]);
		assert.equal(whyOf({ kind: "course", course: fresh, step })?.short, "Planned today");
		assert.equal(stepWords(nextStepOf({ ...LINALG, newToday: ["span"] as TopicHandle[] })), "Review Linear independence, Rank, Span", "reviews still come first");
	});

	it("after a review leaves the current topic his own, next is the topic the plan starts next, not that topic again", () => {
		const reviewed: StudyCourse = {
			...PROB,
			map: {
				...PROB.map,
				topics: [
					topic("bayes", "Bayes' rule", "independent", { review: { kind: "scheduled", date: "2026-11-11" } }),
					topic("geometric", "Geometric distribution", "new", { starts: "2026-11-11" }),
					topic("poisson", "Poisson distribution", "new", { starts: "2026-11-09" }),
				],
			},
		};
		const step = nextStepOf(reviewed);
		assert.equal(stepWords(step), "Start Poisson distribution");
		assert.equal(whyOf({ kind: "course", course: reviewed, step })?.short, "Planned Mon 9 Nov", "the plan's day, not Next up");
		const done: StudyCourse = { ...reviewed, map: { ...reviewed.map, topics: reviewed.map.topics.slice(0, 1) } };
		const back = nextStepOf(done);
		assert.deepEqual([stepWords(back), whyOf({ kind: "course", course: done, step: back })?.short], ["Review Bayes' rule", "Planned Wed 11 Nov"], "no Continue on a topic he has on his own: its dated review is next");
	});

	it("names the plan's next item with its day when nothing is today: a held review before a later new topic", () => {
		const analysis: StudyCourse = {
			...PROB,
			due: [],
			map: {
				...PROB.map,
				current: "series" as TopicHandle,
				topics: [
					topic("cauchy", "Cauchy sequences", "assisted", { review: { kind: "scheduled", date: "2026-11-15", held: true } }),
					topic("series", "Series", "retained", { review: { kind: "scheduled", date: "2026-12-04" } }),
					topic("continuity", "Continuity", "new", { starts: "2026-11-22" }),
				],
			},
		};
		const step = nextStepOf(analysis);
		assert.deepEqual([stepWords(step), whyOf({ kind: "course", course: analysis, step })?.short], ["Review Cauchy sequences", "Planned Sun 15 Nov"]);
		assert.equal(laterOnly(step), true, "Home's Today leaves it out");
	});

	it("a course never studied comes after every course with reviews tonight, even with the nearer exam", () => {
		const fresh: StudyCourse = { map: map({ workspace: "/s/graphs", title: "Graph theory", exam: { date: "2026-11-20", daysLeft: 12 } }), unready: [], due: [], newToday: [], lastActiveDaysAgo: null };
		const rows = todayRows([fresh, ANALYSIS], [], TODAY);
		assert.deepEqual(
			rows.map((r) => r.course?.map.title),
			["Real Analysis", "Graph theory"],
		);
		assert.deepEqual(foldLines(todayRows([fresh, PROB, ANALYSIS, LINALG], [], TODAY)).shown.at(-1)?.course?.map.title, "Graph theory");
	});

	it("puts a course in its exam run-up first, the nearest exam first", () => {
		assert.deepEqual(byUrgency([ANALYSIS, LINALG, PROB]).map((c) => c.map.title), ["Probability", "Linear Algebra", "Real Analysis"]);
	});
});

describe("today's lines", () => {
	const eigen = chat({ id: "q", title: "Eigen lesson", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" } });

	it("gives each recent session to pick up a line first, and keeps every course's next step that no such session works on", () => {
		const writing = chat({ id: "w", busy: true, course: { workspace: "/s/prob", title: "Probability" }, updatedAt: "2026-11-08T08:00:00.000Z" });
		const open = openSessions([chat({ id: "idle" }), writing, eigen]);
		assert.deepEqual(open.map((c) => c.id), ["q", "w"], "a session waiting on him and one the tutor writes in, never a finished one");
		const rows = todayRows([ANALYSIS, LINALG, PROB], open, TODAY);
		assert.deepEqual(
			rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : r.course.map.title)),
			["session q", "session w", "Probability", "Linear Algebra", "Real Analysis"],
			"Linear Algebra's due review keeps its line beside the waiting lesson on another topic",
		);
		assert.deepEqual(todayCourses(rows).map((c) => c.map.title), ["Linear Algebra", "Probability", "Real Analysis"], "each course once for the map's tabs");
	});

	it("lets a session that works on the step stand for it", () => {
		const review = chat({ id: "r", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["independence", "rank", "span"] });
		const rows = todayRows([LINALG], [review], TODAY);
		assert.deepEqual(rows.map((r) => r.kind), ["session"]);
		const sheet = chat({ id: "s", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" }, tasks: ["sheet-4"] });
		assert.deepEqual(todayRows([{ ...LINALG, due: [] }], [sheet], TODAY).map((r) => r.kind), ["session"], "the open task's lesson");
	});

	it("gives a second session waiting in the same course its own line too, the newest first, and keeps the course's line for the step neither works on", () => {
		const rank = chat({ id: "r", title: "Rank practice", pendingProblem: true, updatedAt: "2026-11-08T08:30:00.000Z", course: { workspace: "/s/linalg", title: "Linear Algebra" } });
		const rows = todayRows([ANALYSIS, LINALG, PROB], openSessions([rank, eigen]), TODAY);
		assert.deepEqual(
			rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : r.course.map.title)),
			["session q", "session r", "Probability", "Linear Algebra", "Real Analysis"],
		);
	});

	it("leaves a session waiting since before yesterday to the sidebar", () => {
		const old = { ...eigen, updatedAt: "2026-11-05T09:00:00.000Z" };
		const rows = todayRows([LINALG], [old], TODAY);
		assert.deepEqual(rows.map((r) => r.kind), ["course"]);
	});
});

describe("lessons", () => {
	const lesson = (course: StudyCourse) => lessonOf(todayRows([course], [], TODAY)[0]!);

	it("words a course's step as a lesson: its name, what follows, its button and its topics' place in the path", () => {
		const review = lesson(LINALG);
		assert.equal(review.title, "Review Linear independence, Rank, Span");
		assert.equal(review.detail, "Then Problem sheet 4");
		assert.equal(review.action, "Review");
		assert.equal(review.exam, "Exam in 21 days");
		assert.deepEqual(review.place, { from: 2, to: 4, of: 5 });
		const topic = lesson(PROB);
		assert.deepEqual([topic.title, topic.detail, topic.action, topic.place], ["Continue Bayes' rule", null, "Continue", { from: 2, to: 2, of: 2 }]);
		const later = lesson({ ...PROB, map: { ...PROB.map, current: null } });
		assert.deepEqual([later.title, later.action], ["Review Conditional probability", "Review"], "with no current topic, the plan's next item, the review it dates first");
		assert.equal(lesson({ ...PROB, map: { ...PROB.map, current: null, topics: [] } }).action, "Start");
	});

	it("leaves out a Then that only repeats a review", () => {
		const course: StudyCourse = { ...ANALYSIS, map: { ...ANALYSIS.map, current: "seq" as TopicHandle } };
		assert.deepEqual([lesson(course).title, lesson(course).detail], ["Review Sequences", null]);
	});

	it("places a waiting session at the course topics its transcript worked on", () => {
		const waiting = chat({ id: "q", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["eigen", "charpoly"] });
		const reply = lessonOf(todayRows([LINALG], [waiting], TODAY)[0]!);
		assert.deepEqual([reply.kind, reply.title, reply.detail, reply.action], ["reply", "Eigen lesson", "Waiting for your reply", "Open"]);
		assert.deepEqual(reply.open, { kind: "session", href: "/chat/q" });
		assert.deepEqual(reply.place, { from: 5, to: 5, of: 5 });
		const unplaced = lessonOf(todayRows([LINALG], [{ ...waiting, topics: [] }], TODAY)[0]!);
		assert.equal(unplaced.place, null);
		assert.equal(topicSpan(LINALG, ["gone"] as TopicHandle[]), null);
	});

});

describe("the study read", () => {
	it("joins the map with plan's run-up, today's review and last activity, dropping handles the map does not list", () => {
		const plan = {
			courses: [{ runup: { days_left: 21, unready: ["span", "gone"] }, due: [{ topic: "rank" }, { topic: "gone" }, { topic: "span" }], last_activity: { days_ago: 0 }, last_studied: { days_ago: 2 } }],
		};
		const course = studyCourseOf(LINALG.map, plan);
		assert.deepEqual(course.unready, ["span"]);
		assert.deepEqual(course.due, ["rank", "span"]);
		assert.equal(course.lastActiveDaysAgo, 2);
		assert.deepEqual(studyCourseOf(LINALG.map, { courses: [{}] }), { map: LINALG.map, unready: null, due: [], lastActiveDaysAgo: null, newToday: [] });
		assert.equal(studyCourseOf(LINALG.map, { courses: [{ last_activity: { days_ago: 0 } }] }).lastActiveDaysAgo, null, "a course saved today but never studied is not studied today");
		assert.equal(studyCourseOf(LINALG.map, null).due, null);
	});

	it("reads the new topics today's plan starts, only when its first day is today", () => {
		const day = (date: string) => ({ today: "2026-11-08", courses: [{ plan: { days: [{ date, reviews: [], new: ["span", "gone"] }] } }] });
		assert.deepEqual(studyCourseOf(LINALG.map, day("2026-11-08")).newToday, ["span"]);
		assert.deepEqual(studyCourseOf(LINALG.map, day("2026-11-09")).newToday, [], "a later day is not today's");
	});
});

describe("Today", () => {
	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const render = (node: React.ReactNode) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
	const waiting = [chat({ id: "q", title: "Eigen lesson", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" } })];

	it("gives each line its pie, its course ending in how long ago it was studied, and its lesson ending in an icon and a few words for why it is on Today, with no button and no review counted", () => {
		const doc = render(<Today rows={todayRows([ANALYSIS, LINALG, PROB], waiting, TODAY)} done={[]} busy={false} onContinue={() => {}} />);
		const lines = [...doc.querySelectorAll('[data-slot="today-line"]')];
		assert.deepEqual(
			lines.map((l) => l.textContent),
			["Linear AlgebraTodayEigen lessonYour turn", "Probability4d agoContinue Bayes' ruleNext up", "Linear Algebra2d agoReview Linear independence, Rank, Span2w overdue", "Real Analysis11d agoReview Sequences1d overdue"],
		);
		assert.equal(lines[0]!.getAttribute("href"), "/chat/q");
		assert.equal(doc.querySelectorAll('[data-slot="today-progress"]').length, 4);
		assert.deepEqual([...doc.querySelectorAll('[data-slot="today-why"]')].map((w) => [w.getAttribute("data-kind"), w.querySelectorAll("svg").length]), [["reply", 1], ["next", 1], ["review", 1], ["review", 1]]);
		assert.equal(doc.querySelectorAll(".bg-primary").length, 0);
		assert.doesNotMatch(doc.body.textContent ?? "", /Exam|Then |Step|\d+\s+due\b/i);
		assert.match(doc.querySelector("#today-heading")?.textContent ?? "", /^What are we studying (this morning|this afternoon|this evening|today)\?$/);
		assert.equal(doc.querySelector('[data-slot="today-done"]'), null, "nothing says done before he finishes anything");
	});

	it("once he finished something today, asks what else and names what he did, never a count", () => {
		const doc = render(<Today rows={todayRows([ANALYSIS, LINALG, PROB], [], TODAY)} done={["Eigenvalues and eigenvectors", "Rank practice"]} busy={false} onContinue={() => {}} />);
		assert.match(doc.querySelector("#today-heading")?.textContent ?? "", /^What else are we studying (this morning|this afternoon|this evening|today)\?$/);
		assert.equal(doc.querySelector('[data-slot="today-done"]')?.textContent, "Done today: Eigenvalues and eigenvectors, Rank practice");
	});

	it("past five lines, names the other courses on the last", () => {
		const many = Array.from({ length: 6 }, (_, i) => ({ ...PROB, map: { ...PROB.map, workspace: `/s/c${i}`, title: `Course ${i}` } }));
		const doc = render(<Today rows={todayRows(many, [], TODAY)} done={[]} busy={false} onContinue={() => {}} />);
		assert.equal(doc.querySelectorAll('[data-slot="today-line"]').length, 4);
		assert.match(doc.querySelector('[data-slot="today-also"]')?.textContent ?? "", /Also today:Course 4Course 5/);
	});
});


describe("what a line of Today reads", () => {
	const waiting = chat({ id: "q", title: "Eigen lesson", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" } });
	const lapsed: StudyCourse = {
		...ANALYSIS,
		map: { ...ANALYSIS.map, topics: [topic("seq", "Sequences", "independent", { review: due(0), signals: { gap: null, lapsed: true, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false } })] },
	};
	const rowOf = (course: StudyCourse) => todayRows([course], [], TODAY)[0]!;

	it("gives each reason a kind and a few words that fit beside its icon, from the engine's fields", () => {
		const short = (row: TodayRow) => {
			const why = whyOf(row);
			return why && [why.kind, why.short];
		};
		assert.deepEqual(short(todayRows([LINALG], [waiting], TODAY)[0]!), ["reply", "Your turn"]);
		assert.deepEqual(short(rowOf(LINALG)), ["review", "2w overdue"]);
		assert.deepEqual(short(rowOf(ANALYSIS)), ["review", "1d overdue"]);
		assert.deepEqual(short(rowOf(lapsed)), ["missed", "Missed Sequences"]);
		assert.deepEqual(short(rowOf({ ...LINALG, due: [] })), ["task", "Left off 3d ago"], "when the task was left, never the tutor's step");
		assert.deepEqual(short(rowOf(PROB)), ["next", "Next up"]);
	});

	it("names the next dated review, and the day the plan puts it, on a course with every topic his own and nothing due (round 3: \"Calculus I · Start a lesson\")", () => {
		const done: StudyCourse = {
			...ANALYSIS,
			due: [],
			map: {
				...ANALYSIS.map,
				current: "fundamental" as TopicHandle,
				topics: [
					topic("fundamental", "Fundamental theorem", "retained", { review: { kind: "scheduled", date: "2026-12-09" } }),
					topic("improper", "Improper integrals", "retained", { review: { kind: "scheduled", date: "2026-11-29", held: true } }),
				],
			},
		};
		const row = rowOf(done);
		assert.equal(lessonTitle(row), "Review Improper integrals");
		assert.deepEqual(whyOf(row), { kind: "review", short: "Planned Sun 29 Nov" }, "the plan's day, the same words as every course line with nothing today");
		const empty = rowOf({ ...done, map: { ...done.map, topics: done.map.topics.map((t) => ({ ...t, review: null })) } });
		assert.equal(lessonTitle(empty), "Start a lesson", "with no review dated at all, the tutor proposes");
	});

	it("says how long ago a course was studied in a few characters", () => {
		const ago = (days: number | null) => studiedAgo(rowOf({ ...LINALG, lastActiveDaysAgo: days }));
		assert.deepEqual([0, 1, 2, 13, 14, 59, 60, null].map(ago), ["Today", "Yesterday", "2d ago", "13d ago", "2w ago", "8w ago", "2mo ago", null]);
	});

	it("gives each row one clock: a session its own last turn, an open task none beside its Left off", () => {
		const started = chat({ id: "new", pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" }, updatedAt: new Date(2026, 10, 8, 9, 30).toISOString() });
		const [row] = todayRows([{ ...LINALG, lastActiveDaysAgo: 3 }], [started], TODAY);
		assert.equal(studiedAgo(row!), "Today", "a session started minutes ago never reads 3d ago");
		const task = rowOf({ ...LINALG, due: [], lastActiveDaysAgo: 0 });
		assert.deepEqual([studiedAgo(task), whyOf(task)?.short], [null, "Left off 3d ago"], "no Today above Left off 3d ago");
	});

	it("counts how much of a course he can do on his own, weak topics left out", () => {
		assert.deepEqual(courseProgress(LINALG), { solid: 2, of: 5 });
		assert.deepEqual(courseProgress(PROB), { solid: 1, of: 2 });
		assert.equal(courseProgress({ ...LINALG, map: { ...LINALG.map, topics: [] } }), null);
	});

	it("folds a sixth course into the last line", () => {
		const many = Array.from({ length: 6 }, (_, i) => ({ ...PROB, map: { ...PROB.map, workspace: `/s/c${i}`, title: `Course ${i}` } }));
		const { shown, also } = foldLines(todayRows(many, [], TODAY));
		assert.deepEqual([shown.length, also.length], [4, 2]);
	});

	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const render = (node: React.ReactNode) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
	const rows = () => todayRows([ANALYSIS, LINALG, PROB], [waiting], TODAY);
	const props = () => ({ rows: rows(), busy: false, onContinue: () => {} });
	const plain = (doc: Document) => {
		assert.equal(doc.querySelectorAll(".bg-primary").length, 0);
		assert.doesNotMatch(doc.body.textContent ?? "", /Exam|Then |Step|\d+\s+due\b/);
	};

	it("hybrid: each line has its pie, its course ending in how long ago it was studied, and its lesson ending in an icon and a few words for why it is on Today", () => {
		const doc = render(<HybridRows {...props()} />);
		const lines = [...doc.querySelectorAll('[data-slot="today-line"]')].map((l) => l.textContent);
		assert.deepEqual(lines, [
			"Linear AlgebraTodayEigen lessonYour turn",
			"Probability4d agoContinue Bayes' ruleNext up",
			"Linear Algebra2d agoReview Linear independence, Rank, Span2w overdue",
			"Real Analysis11d agoReview Sequences1d overdue",
		]);
		assert.equal(doc.querySelectorAll('[data-slot="today-progress"]').length, 4);
		assert.deepEqual([...doc.querySelectorAll('[data-slot="today-why"]')].map((w) => [w.getAttribute("data-kind"), w.querySelectorAll("svg").length]), [["reply", 1], ["next", 1], ["review", 1], ["review", 1]]);
		plain(doc);
	});
});

describe("a course whose record can't be read", () => {
	it("stays on Home by its name, with the line that says what's wrong in plain words", () => {
		const html = renderToStaticMarkup(
			<UnreadableLines
				courses={[
					{ workspace: "/s/real-analysis", title: "Real Analysis", problem: "damaged" },
					{ workspace: "/s/probability", title: "Probability", problem: "denied" },
				]}
			/>,
		);
		const lines = [...parseHTML(`<html><body>${html}</body></html>`).document.querySelectorAll('[data-slot="unreadable-course"]')];
		assert.deepEqual(
			lines.map((p) => p.textContent),
			[
				"Real Analysis Couldn't read this course's record. Its file is damaged.",
				"Probability Couldn't read this course's record. The app isn't allowed to open its files.",
			],
		);
	});
});

describe("You are here during a lesson", () => {
	const la = { workspace: "/s/linalg", title: "Linear Algebra" };
	it("sits on the topic of the lesson he is in, not the engine's stale current topic, and goes back once it is finished", () => {
		const lessonOn = (over: Partial<ChatListItem>) => chat({ id: "l", kind: "teach", course: la, topics: ["eigen"], ownTopics: ["eigen"], messageCount: 4, updatedAt: "2026-11-08T09:00:00.000Z", ...over });
		const [during] = withLessonHere([LINALG], [lessonOn({ pendingQuestion: true })]);
		assert.equal(during!.map.current, "eigen");
		const [after] = withLessonHere([LINALG], [lessonOn({ ended: "closed" })]);
		assert.equal(after!.map.current, LINALG.map.current, "a finished lesson leaves the engine's topic");
		const [practice] = withLessonHere([LINALG], [lessonOn({ kind: "practice", pendingProblem: true })]);
		assert.equal(practice!.map.current, LINALG.map.current, "practice leaves it where it is");
	});
});
