/**
 * What the calendar draws: the engine's dates and the stored sessions as
 * one entry per thing on one day, and the server's reading of `plan`'s
 * run-up and the Journal's study windows. Engine day 2026-11-08, as the
 * seeded demo's.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarCourse } from "../src/core/contracts/calendar.ts";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { doesNotFitOf, finalReviewOf, planDays, plannedOf, scheduleOf } from "../src/server/calendar.ts";
import { finalReviewGapWords } from "../components/study-words.ts";
import { courseMove, todaySteps } from "../components/study-home/study-facts.ts";
import { calendarEntries, distanceWords, dueDay, finalReviewWords, lookOf, lookWords, misfitWords, moreWords, quietBetween, roadLines, roadOf, sessionType, spanWords, studyTimeWords } from "../components/calendar/calendar-facts.ts";

const TODAY = "2026-11-08";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({
	handle: handle as TopicHandle,
	title: handle,
	level: "independent",
	introduced: "2026-10-20",
	review: null,
	weak: false,
	signals: QUIET,
	tasks: [],
	...over,
});

function course(workspace: string, title: string, over: Partial<CourseMap> = {}, rest: Partial<CalendarCourse> = {}): CalendarCourse {
	const map: CourseMap = { workspace, title, today: TODAY, revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [], edges: [], ...over };
	return { map, unready: null, due: [], newToday: [], lastActiveDaysAgo: 0, planned: [], doesNotFit: [], finalReview: null, ...rest };
}

const LINALG = course(
	"/study/linalg",
	"Linear Algebra",
	{
		exam: { date: "2026-11-29", daysLeft: 21 },
		tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: null }],
		topics: [
			topic("span", { title: "Span", review: { kind: "due", date: TODAY, overdue: 10 } }),
			topic("basis", { title: "Basis", review: { kind: "due", date: TODAY, overdue: 0 } }),
			topic("vectors", { title: "Vectors", review: { kind: "scheduled", date: "2026-11-13" } }),
			topic("rank", { title: "Rank", level: "assisted", review: { kind: "due", date: TODAY, overdue: 3 }, tasks: ["sheet-4"] }),
			topic("eigen", { title: "Eigenvalues", level: "new" }),
		],
	},
	{
		due: ["span" as TopicHandle, "basis" as TopicHandle],
		finalReview: "2026-11-23",
		planned: [
			{ date: TODAY, reviews: ["span" as TopicHandle, "basis" as TopicHandle], new: [] },
			{ date: "2026-11-09", reviews: [], new: ["eigen" as TopicHandle] },
			{ date: "2026-11-13", reviews: ["vectors" as TopicHandle], new: [] },
		],
		doesNotFit: ["eigen" as TopicHandle],
	},
);
const PROB = course(
	"/study/prob",
	"Probability",
	{
		exam: { date: "2026-11-19", daysLeft: 11 },
		topics: [topic("bayes", { title: "Bayes' rule", review: { kind: "scheduled", date: "2026-11-09" } }), topic("odds", { title: "Odds", review: { kind: "scheduled", date: "2026-11-25" } })],
	},
	{ planned: [{ date: "2026-11-09", reviews: ["bayes" as TopicHandle], new: [] }] },
);

let ids = 0;
function chat(over: Partial<ChatListItem> = {}): ChatListItem {
	ids += 1;
	return {
		id: `chat_${ids}`,
		title: `Session ${ids}`,
		createdAt: "2026-11-06T09:00:00",
		updatedAt: "2026-11-06T10:00:00",
		kind: "teach",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		course: { workspace: "/study/linalg", title: "Linear Algebra" },
		topics: [],
		busy: false,
		...over,
	};
}

const summary = (entries: ReturnType<typeof calendarEntries>) => entries.map((e) => `${e.day} ${lookOf(e)} ${e.title}`);

describe("an exam's next step", () => {
	it("names the later day it is planned for and offers nothing to start today (round 10: 1 m9)", () => {
		const exam = calendarEntries({ courses: [PROB], chats: [], scope: null }).find((e) => e.kind === "exam");
		assert.deepEqual(exam?.kind === "exam" && exam.next && [exam.next.verb, exam.next.what, exam.next.on], ["Review", "Bayes' rule", "2026-11-09"]);
		const today = calendarEntries({ courses: [LINALG], chats: [], scope: null }).find((e) => e.kind === "exam");
		assert.equal(today?.kind === "exam" && today.next?.on, null, "a step for today is today's");
	});
});

describe("calendar entries", () => {
	it("puts each exam on its date, today's review today, and each later day's reviews and new topics as the daily plan proposes", () => {
		const entries = calendarEntries({ courses: [LINALG, PROB], chats: [], scope: null });
		assert.deepEqual(summary(entries), [
			"2026-11-08 overdue Span",
			"2026-11-08 review Basis",
			"2026-11-08 task Problem sheet 4",
			"2026-11-09 new Eigenvalues",
			"2026-11-09 review Bayes' rule",
			"2026-11-13 review Vectors",
			"2026-11-19 exam Probability exam",
			"2026-11-29 exam Linear Algebra exam",
		]);
	});

	it("shows every review plan makes today, past the five its due list names, and no stored date the plan does not propose", () => {
		// 17 Nov in the demo world: eight Probability reviews planned today, `due` naming five; the sixth's first entry
		// was its next review after the exam, while its topic page and the tutor's brief said today.
		const handles = ["a", "b", "c", "d", "e", "f"] as TopicHandle[];
		const many = course(
			"/study/many",
			"Many",
			{ topics: handles.map((h) => topic(h, { title: h.toUpperCase(), review: { kind: "due", date: TODAY, overdue: 4 } })) },
			{ due: handles.slice(0, 5), planned: [{ date: TODAY, reviews: handles, new: [] }, { date: "2026-12-12", reviews: ["f" as TopicHandle], new: [] }] },
		);
		const f = calendarEntries({ courses: [many], chats: [], scope: null }).filter((e) => e.title === "F");
		assert.deepEqual(f.map((e) => `${e.day} ${lookOf(e)}`), ["2026-11-08 overdue", "2026-12-12 review"]);
		const titles = calendarEntries({ courses: [LINALG, PROB], chats: [], scope: null }).map((e) => e.title);
		assert.ok(!titles.includes("Rank"), "Rank's stored date is due, but the plan reviews it on no day: no entry");
		assert.ok(!titles.includes("Odds"), "a stored date after the exam is not planned");
	});

	it("gives a planned new topic the topic page's action and the exam the topics that do not fit", () => {
		const entries = calendarEntries({ courses: [LINALG], chats: [], scope: null });
		const eigen = entries.find((e) => e.kind === "new");
		assert.equal(eigen?.kind === "new" && eigen.action.kind, "start");
		const exam = entries.find((e) => e.kind === "exam");
		assert.deepEqual(exam?.kind === "exam" && exam.doesNotFit, ["Eigenvalues"]);
		assert.equal(misfitWords(["Eigenvalues", "Rank"]), "No room before the exam to start Eigenvalues and Rank");
		assert.equal(misfitWords([]), null);
	});

	it("says why a review waits on the day the plan holds it to, naming the exams it waits for, and only there", () => {
		const FREE = course(
			"/study/calc",
			"Calculus",
			{ topics: [topic("limits", { title: "Limits", review: { kind: "scheduled", date: "2026-12-03", held: { exam: "Probability", since: "2026-10-01" } } })] },
			{ planned: [{ date: "2026-12-03", reviews: ["limits" as TopicHandle], new: [] }, { date: "2026-12-20", reviews: ["limits" as TopicHandle], new: [] }] },
		);
		const reviews = calendarEntries({ courses: [FREE, PROB], chats: [], scope: null }).filter((e) => e.kind === "review");
		assert.deepEqual(
			reviews.map((e) => e.kind === "review" && [e.title, e.day, e.since, e.waits]),
			[
				["Bayes' rule", "2026-11-09", null, null],
				// Memory's day is never named beside the day the plan gives (round 19, m2).
				["Limits", "2026-12-03", null, "Waits for your Probability exam"],
				["Limits", "2026-12-20", null, null],
			],
		);
	});

	it("names no day a review moved from while the day memory asked for is still ahead: he was never told that day (round 8)", () => {
		const MOVED = course(
			"/study/calc",
			"Calculus",
			{ topics: [topic("eigen", { title: "Eigenvalues", review: { kind: "scheduled", date: "2026-11-11", held: { exam: null, since: "2026-11-09" } } })] },
			{ planned: [{ date: "2026-11-11", reviews: ["eigen" as TopicHandle], new: [] }] },
		);
		const [review] = calendarEntries({ courses: [MOVED], chats: [], scope: null }).filter((e) => e.kind === "review");
		assert.deepEqual(review?.kind === "review" && [review.day, review.since, review.waits], ["2026-11-11", null, null], "nor that earlier days are full (round 11)");
	});

	it("says from which told day a review or a start moved and what of his study moved it", () => {
		const MOVED = course(
			"/study/la",
			"Linear Algebra",
			{
				topics: [
					topic("eigen", { title: "Eigenvalues", review: { kind: "scheduled", date: "2026-11-11", held: { exam: null, since: "2026-11-09" } }, moved: { from: "2026-11-10", by: "study", courses: ["Probability"], day: "today" as const } }),
					topic("projection", { title: "Projection", level: "new", starts: "2026-11-12", moved: { from: "2026-11-11", by: "missed" } }),
				],
			},
			{ planned: [{ date: "2026-11-11", reviews: ["eigen" as TopicHandle], new: [] }, { date: "2026-11-12", reviews: [], new: ["projection" as TopicHandle] }] },
		);
		const entries = calendarEntries({ courses: [MOVED], chats: [], scope: null });
		const review = entries.find((e) => e.kind === "review");
		assert.deepEqual(review?.kind === "review" && [review.day, review.since, review.waits], ["2026-11-11", "Moved from 10 Nov after your Probability study today", null]);
		const fresh = entries.find((e) => e.kind === "new");
		assert.deepEqual(fresh?.kind === "new" && [fresh.day, fresh.waits], ["2026-11-12", "Moved from 11 Nov, no study yesterday"]);
	});

	it("gives a review the topic page's action and an open task its opening and topic", () => {
		const entries = calendarEntries({ courses: [LINALG], chats: [], scope: null });
		const span = entries.find((e) => e.kind === "review" && e.title === "Span");
		assert.deepEqual(span?.kind === "review" && span.action, { kind: "review", opening: "Review Span" });
		const task = entries.find((e) => e.kind === "task");
		assert.deepEqual(task?.kind === "task" && task.move, { kind: "start", opening: "Continue Problem sheet 4", topics: ["rank"] });
		assert.equal(task?.kind === "task" && task.topic?.handle, "rank");
		const exam = entries.find((e) => e.kind === "exam" && e.course.workspace === "/study/linalg");
		assert.deepEqual(exam?.kind === "exam" && [exam.road, exam.finalReview], [[{ from: "2026-11-09", to: "2026-11-09", titles: ["Eigenvalues"] }], "2026-11-23"]);
	});

	it("continues an open task in the session that holds it, as Home's line does (round 13, N6: the calendar's Continue started a new session)", () => {
		const sheet = chat({ title: "Problem sheet 4", tasks: ["sheet-4"], topics: ["rank"], updatedAt: "2026-11-06T19:45:00" });
		const task = calendarEntries({ courses: [LINALG], chats: [sheet], scope: null }).find((e) => e.kind === "task");
		assert.ok(task?.kind === "task" && task.move.kind === "open" && task.move.chat === sheet, `Continue opens ${JSON.stringify(task?.kind === "task" && task.move)}`);
		assert.deepEqual(task.move, courseMove(LINALG, [sheet], todaySteps(LINALG).find((s) => s.kind === "task")));
	});

	it("puts each session on the day of its last message, with its type, its topic and whether it waits", () => {
		const lesson = chat({ title: "Rank, second pass", topics: ["noise", "rank"] });
		const practice = chat({ title: "Rank practice", kind: "practice", phase: "probe", pendingProblem: true, updatedAt: "2026-11-08T07:54:00" });
		const later = chat({ title: "From tomorrow", phase: "probe", updatedAt: "2026-11-09T09:00:00" });
		const general = chat({ title: "A general question", course: undefined, updatedAt: "2026-11-02T09:00:00" });
		const entries = calendarEntries({ courses: [LINALG], chats: [lesson, practice, later, general], scope: null }).filter((e) => e.kind === "session");
		assert.deepEqual(summary(entries), [
			"2026-11-02 lesson A general question",
			"2026-11-06 lesson Rank, second pass",
			"2026-11-08 practice Rank practice",
			"2026-11-08 lesson From tomorrow",
		]);
		const [orphan, second, waiting] = entries;
		assert.equal(orphan?.course, null);
		assert.equal(second?.kind === "session" && second.topic?.title, "Rank", "the first topic the map lists");
		assert.equal(waiting?.kind === "session" && waiting.waits, true);
	});

	it("leads a day with its exam, then a session waiting on him, then what is due, then what was done", () => {
		const examDay = course("/study/linalg", "Linear Algebra", { exam: { date: TODAY, daysLeft: 0 }, topics: [topic("span", { title: "Span", review: { kind: "due", date: "2026-11-01", overdue: 7 } })] }, { due: ["span" as TopicHandle] });
		const done = chat({ title: "Done earlier", updatedAt: "2026-11-08T07:00:00" });
		const waits = chat({ title: "Waiting", pendingQuestion: true, updatedAt: "2026-11-08T08:00:00" });
		const entries = calendarEntries({ courses: [examDay], chats: [done, waits], scope: null });
		assert.deepEqual(entries.map((e) => e.title), ["Linear Algebra exam", "Waiting", "Span", "Done earlier"]);
	});

	it("shows one review once: today's task and session on only its topics fold into its entry", () => {
		const PROB_TODAY = course(
			"/study/prob",
			"Probability",
			{
				tasks: [
					{ key: "review-total", title: "Review: law of total probability", step: "Ask the open question first", updated: TODAY },
					{ key: "sheet-2", title: "Problem sheet 2", step: null, updated: TODAY },
				],
				topics: [
					topic("total", { title: "Law of total probability", review: { kind: "due", date: "2026-11-07", overdue: 1 }, tasks: ["review-total", "sheet-2"] }),
					topic("bayes", { title: "Bayes' rule", review: { kind: "scheduled", date: "2026-11-12" }, tasks: ["sheet-2"] }),
				],
			},
			{ due: ["total" as TopicHandle] },
		);
		const prob = { workspace: "/study/prob", title: "Probability" };
		const review = chat({ title: "Review Law of total probability", phase: "probe", course: prob, topics: ["total"], updatedAt: "2026-11-08T11:00:00" });
		const wider = chat({ title: "Total probability and Bayes", course: prob, topics: ["total", "bayes"], updatedAt: "2026-11-08T12:00:00" });
		const earlier = chat({ title: "Total probability, last week", course: prob, topics: ["total"], updatedAt: "2026-11-02T12:00:00" });
		const entries = calendarEntries({ courses: [PROB_TODAY], chats: [review, wider, earlier], scope: null });
		assert.deepEqual(summary(entries), [
			"2026-11-02 lesson Total probability, last week",
			"2026-11-08 overdue Law of total probability",
			"2026-11-08 task Problem sheet 2",
			"2026-11-08 lesson Total probability and Bayes",
		]);
	});

	it("shows one lesson once: the open task an unfinished session of today left folds into that session's entry, under its name", () => {
		const LA_TODAY = course("/study/linalg", "Linear Algebra", {
			tasks: [{ key: "eigen-lesson", title: "Eigenvalues lesson: eigenspaces and diagonalisation", step: "Find the eigenspace", updated: TODAY }],
			topics: [topic("eigen", { title: "Eigenvalues", level: "assisted", tasks: ["eigen-lesson"] })],
		});
		const la = { workspace: "/study/linalg", title: "Linear Algebra" };
		const lesson = chat({ id: "eigen", title: "Eigenvalues and eigenvectors", course: la, topics: ["eigen"], ended: "left", updatedAt: "2026-11-08T09:00:00" });
		const entries = calendarEntries({ courses: [LA_TODAY], chats: [lesson], scope: null });
		assert.deepEqual(summary(entries), ["2026-11-08 task Eigenvalues and eigenvectors"]);
		const done = calendarEntries({ courses: [LA_TODAY], chats: [{ ...lesson, ended: "closed" }], scope: null });
		assert.deepEqual(summary(done), ["2026-11-08 task Eigenvalues lesson: eigenspaces and diagonalisation", "2026-11-08 lesson Eigenvalues and eigenvectors"], "a finished lesson that only touched the topic leaves the task its own entry");
		const yesterday = calendarEntries({ courses: [LA_TODAY], chats: [{ ...lesson, updatedAt: "2026-11-07T09:00:00" }], scope: null });
		assert.equal(yesterday.filter((e) => e.day === TODAY).length, 1, "an older session stays on its own day; today keeps the task");
	});

	it("lists no Unfinished row for a review he left for next time: it rides with its next review (round 10, 1 m7)", () => {
		const LA_LATER = course("/study/linalg", "Linear Algebra", {
			tasks: [{ key: "eigen-review", title: "Eigenvalues review", step: "The eigenvector of B", updated: "2026-11-06" }],
			topics: [topic("eigen", { title: "Eigenvalues", level: "assisted", tasks: ["eigen-review"], review: { kind: "scheduled", date: "2026-11-12" } })],
		}, { planned: [{ date: "2026-11-12", reviews: ["eigen" as TopicHandle], new: [] }] });
		const la = { workspace: "/study/linalg", title: "Linear Algebra" };
		const review = chat({ id: "eigen-r", title: "Review Eigenvalues", course: la, topics: ["eigen"], ended: "left", updatedAt: "2026-11-06T09:00:00" });
		const entries = calendarEntries({ courses: [LA_LATER], chats: [review], scope: null });
		assert.deepEqual(summary(entries).filter((line) => line.includes("task")), []);
		assert.ok(summary(entries).includes("2026-11-12 review Eigenvalues"), "its review day lists the review");
	});

	it("keeps one course when scoped, and with it no session outside a course", () => {
		const general = chat({ course: undefined });
		const entries = calendarEntries({ courses: [LINALG, PROB], chats: [general, chat()], scope: "/study/prob" });
		assert.deepEqual(summary(entries), ["2026-11-09 review Bayes' rule", "2026-11-19 exam Probability exam"]);
	});

	it("names a session practice or lesson, a lesson still asking its opening questions included, never a quiz", () => {
		assert.equal(sessionType(chat({ kind: "practice", phase: "probe" })), "practice");
		assert.equal(sessionType(chat({ phase: "probe" })), "lesson");
		assert.equal(sessionType(chat({ phase: "plan" })), "lesson");
		assert.equal(sessionType(chat({ phase: "teach" })), "lesson");
	});

	it("shows a session on every day he worked in it, its status on the last alone (round 16, m8)", () => {
		// The Linear maps lesson begun on Fri 6 Nov and left on Sat 7 Nov.
		const lesson = chat({ title: "Linear maps lesson", updatedAt: "2026-11-07T15:00:00", studiedDays: ["2026-11-06", "2026-11-07"], ended: "left" });
		const days = calendarEntries({ courses: [LINALG], chats: [lesson], scope: null }).filter((e) => e.kind === "session" && e.chat.id === lesson.id);
		assert.deepEqual(days.map((e) => e.day), ["2026-11-06", "2026-11-07"]);
		assert.ok(days[0]!.kind === "session" && days[0]!.status === null, "the earlier day is what he did, no status");
	});

	it("knows a quiet week", () => {
		const entries = calendarEntries({ courses: [LINALG], chats: [], scope: null });
		assert.equal(quietBetween(entries, "2026-11-30", "2026-12-07"), true);
		assert.equal(quietBetween(entries, "2026-11-02", "2026-11-09"), false);
	});
});

/**
 * Round 19, m6 (1 n6, 2 N4, 3 n4): the Stirling's formula lesson left on
 * Tue 10 read "Stirling's formula lesson · Left off today" on Tue 10 and
 * again "Continue Stirling's formula lesson · Left off today" on Wed 11, one
 * lesson twice; Mon 9 read "Continue Problem sheet 4: rank and nullity ·
 * Left off today" for a sheet left on Sun 8. A lesson left today is one
 * entry of left work, "Continue …" on the next study day, saying the day it
 * was left ("Left off 8 Nov"); the day he worked in it shows what he did.
 */
describe("a lesson left for next time on the calendar (round 19, m6)", () => {
	const stirling = { key: "stirling-lesson", title: "Stirling's formula lesson", step: "The trapezoid sum", updated: TODAY, topics: ["stirling" as TopicHandle] };
	const PROB_LEFT = course(
		"/study/prob",
		"Probability",
		{ tasks: [stirling], topics: [topic("stirling", { title: "Stirling's formula", level: "attempted", tasks: ["stirling-lesson"] }), topic("odds", { title: "Odds", review: { kind: "scheduled", date: "2026-11-09" } })] },
		{ planned: [{ date: "2026-11-09", reviews: ["odds" as TopicHandle], new: [] }] },
	);
	const lesson = chat({ id: "stirling", title: "Stirling's formula lesson", course: { workspace: "/study/prob", title: "Probability" }, ended: "left", topics: ["stirling"], ownTopics: ["stirling"], tasks: ["stirling-lesson"], updatedAt: `${TODAY}T11:00:00` });
	const entries = () => calendarEntries({ courses: [PROB_LEFT], chats: [lesson], scope: null });
	const ofLesson = (e: ReturnType<typeof calendarEntries>[number]) => (e.kind === "session" && e.chat.id === "stirling") || (e.kind === "task" && e.task?.key === "stirling-lesson");

	it("lists the left lesson once, as Continue on the next study day, and the day he left it as what he did", () => {
		const left = entries().filter(ofLesson).filter((e) => lookWords(e, TODAY).startsWith("Left off"));
		assert.deepEqual(left.map((e) => `${e.day} ${e.title}`), ["2026-11-09 Continue Stirling's formula lesson"]);
		const worked = entries().filter(ofLesson).filter((e) => e.day === TODAY);
		assert.deepEqual(worked.map((e) => `${e.title} · ${lookWords(e, TODAY)}`), ["Stirling's formula lesson · Lesson"]);
	});

	it("says on a later day the day it was left, never Left off today", () => {
		const later = entries().filter((e) => e.day > TODAY && ofLesson(e));
		assert.deepEqual(later.map((e) => lookWords(e, TODAY)), ["Left off 8 Nov"]);
		assert.ok(entries().every((e) => e.day === TODAY || lookWords(e, TODAY) !== "Left off today"), "no later day says Left off today");
	});
});

/**
 * Round 20, m3 (3 n3, 2 free): after Rank practice's Done for today, whose
 * close said it "continues tomorrow, Monday 9 November", Mon 9 listed only
 * the two lessons left the same day, and Sun 8 read "Rank practice · Left
 * off today" beside the lessons' "Lesson". Every session left for next time
 * today is left work on the next study day, practice as a lesson, from the
 * session state Home reads; the day he worked in it says what he did.
 */
describe("practice left for next time on the calendar (round 20, m3)", () => {
	const invertible = { key: "invertible-lesson", title: "Invertible matrices lesson", step: "Left and right inverses", updated: TODAY, topics: ["invertible" as TopicHandle] };
	const LA_LEFT = course(
		"/study/linalg",
		"Linear Algebra",
		{
			tasks: [invertible],
			topics: [
				topic("invertible", { title: "Invertible matrices", level: "attempted", tasks: ["invertible-lesson"] }),
				topic("rank", { title: "Rank", level: "assisted" }),
				topic("odds", { title: "Odds", review: { kind: "scheduled", date: "2026-11-09" } }),
			],
		},
		{ planned: [{ date: "2026-11-09", reviews: ["odds" as TopicHandle], new: [] }] },
	);
	const lesson = chat({ id: "inv", title: "Invertible matrices lesson", ended: "left", topics: ["invertible"], ownTopics: ["invertible"], tasks: ["invertible-lesson"], updatedAt: `${TODAY}T11:00:00` });
	const practice = chat({ id: "rank", title: "Rank practice", kind: "practice", ended: "left", topics: ["rank"], ownTopics: ["rank"], updatedAt: `${TODAY}T12:00:00` });
	const entries = () => calendarEntries({ courses: [LA_LEFT], chats: [lesson, practice], scope: null });
	const said = (day: string) => entries().filter((e) => e.day === day && e.kind !== "review").map((e) => `${e.title} · ${lookWords(e, TODAY)}`);

	it("continues Rank practice on Mon 9 beside the lesson, saying the day he left it", () => {
		assert.deepEqual(said("2026-11-09").sort(), ["Continue Invertible matrices lesson · Left off 8 Nov", "Continue Rank practice · Left off 8 Nov"]);
	});

	it("says on Sun 8 what he did, practice as a lesson", () => {
		assert.deepEqual(said(TODAY).sort(), ["Invertible matrices lesson · Lesson", "Rank practice · Practice"]);
	});

	it("opens the left practice from its Mon 9 entry", () => {
		const next = entries().find((e) => e.day === "2026-11-09" && e.title === "Continue Rank practice");
		assert.ok(next?.kind === "task" && next.move.kind === "open" && next.move.chat.id === "rank");
	});
});

describe("calendar words", () => {
	it("says a day's study time from the Journal, or Day off, or nothing", () => {
		assert.equal(studyTimeWords({ date: TODAY, off: false, journalOff: false, windows: [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }] }), "Study 9:00 to 12:30, 13:30 to 18:00");
		assert.equal(studyTimeWords({ date: TODAY, off: true, journalOff: true, windows: [] }), "Day off");
		assert.equal(studyTimeWords({ date: TODAY, off: false, journalOff: true, windows: [] }), "Day off in your Journal", "a Journal day off the plan studies says so");
		assert.equal(studyTimeWords({ date: TODAY, off: false, journalOff: false, windows: [] }), null);
		assert.equal(studyTimeWords(undefined), null);
	});

	it("says when the final review starts, or that it is under way", () => {
		assert.equal(finalReviewWords("2026-11-13", TODAY), "Final review from 13 Nov");
		assert.equal(finalReviewWords(TODAY, TODAY), "Final review now, until the exam");
		assert.equal(finalReviewWords(null, TODAY), null);
	});

	it("says today, tomorrow or yesterday beside a day, and never counts days (round 14, m9)", () => {
		assert.deepEqual(
			["2026-11-08", "2026-11-09", "2026-11-07", "2026-11-19", "2026-11-29", "2026-11-01"].map((d) => distanceWords(d, TODAY)),
			["Today", "Tomorrow", "Yesterday", null, null, null],
		);
	});
});

describe("the calendar's read of plan", () => {
	it("takes the final review's start only when plan gives its lead", () => {
		const exam = { date: "2026-11-29", daysLeft: 21 };
		assert.equal(finalReviewOf({ courses: [{ plan: { final_review_days: 6 } }] }, exam), "2026-11-23");
		assert.equal(finalReviewOf({ courses: [{}] }, exam), null);
		assert.equal(finalReviewOf(null, exam), null);
	});

	it("reads the daily plan's days and the topics that do not fit, keeping the handles the map lists", () => {
		const map = { topics: [topic("span"), topic("eigen")] };
		const plan = {
			courses: [
				{
					plan: {
						days: [
							{ date: "2026-11-08", reviews: ["span", "gone"], new: [] },
							{ date: "2026-11-09", reviews: [], new: ["eigen"] },
							{ date: "2026-11-10", reviews: ["gone"], new: [] },
							{ date: "soon", reviews: ["span"], new: [] },
						],
						does_not_fit: ["eigen", "gone"],
					},
				},
			],
		};
		assert.deepEqual(plannedOf(plan, map), [
			{ date: "2026-11-08", reviews: ["span"], new: [] },
			{ date: "2026-11-09", reviews: [], new: ["eigen"] },
		]);
		assert.deepEqual(doesNotFitOf(plan, map), ["eigen"]);
		assert.deepEqual(plannedOf({ courses: [{}] }, map), []);
		assert.deepEqual(doesNotFitOf(null, map), []);
	});

	it("reads the Journal's days ahead, their windows and days off", () => {
		const plan = {
			journal: {
				upcoming_schedule: [
					{ date: "2026-11-08", study_windows: [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }], is_off_day: false },
					{ date: "2026-11-09", study_windows: [], is_off_day: true },
					{ date: "2026-11-10", study_windows: [{ start: "9", end: "x" }], is_off_day: false },
					{ study_windows: [] },
				],
			},
		};
		assert.deepEqual(scheduleOf(plan), [
			{ date: "2026-11-08", off: false, journalOff: false, windows: [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }] },
			{ date: "2026-11-09", off: true, journalOff: true, windows: [] },
			{ date: "2026-11-10", off: false, journalOff: false, windows: [] },
		]);
		assert.deepEqual(scheduleOf({ journal: { error: "no vault" } }), []);
	});

	it("makes a weekday he does not study a day off, whatever the Journal says", () => {
		const journal = {
			upcoming_schedule: [
				{ date: "2026-11-08", study_windows: [{ start: "08:30", end: "12:00" }], is_off_day: false },
				{ date: "2026-11-09", study_windows: [], is_off_day: true },
			],
		};
		const capacity = { study_days: ["mon", "tue"] };
		assert.deepEqual(scheduleOf({ journal, capacity }), [
			{ date: "2026-11-08", off: true, journalOff: false, windows: [] },
			{ date: "2026-11-09", off: false, journalOff: true, windows: [] },
		]);
		const alone = scheduleOf({ today: "2026-11-08", capacity });
		assert.equal(alone.length, 42);
		assert.deepEqual(alone.slice(0, 3).map((d) => d.off), [true, false, false]);
	});
});

describe("the road to an exam", () => {
	const titles: Record<string, string> = { a: "Groups", b: "Subgroups", c: "Cosets", d: "Lagrange", e: "Late" };
	const titleOf = (h: TopicHandle) => titles[h] ?? h;
	const day = (date: string, ...fresh: string[]) => ({ date, reviews: [] as TopicHandle[], new: fresh as TopicHandle[] });

	it("puts the plan's new topics before the exam into weeks, in plan order, and leaves days with none out", () => {
		const road = roadOf([day("2026-11-09", "a"), day("2026-11-10"), day("2026-11-13", "b"), day("2026-11-16", "c", "d"), day("2026-12-14", "e")], "2026-12-14", titleOf);
		assert.deepEqual(road, [
			{ from: "2026-11-09", to: "2026-11-13", titles: ["Groups", "Subgroups"] },
			{ from: "2026-11-16", to: "2026-11-16", titles: ["Cosets", "Lagrange"] },
		]);
		assert.deepEqual(road.map(spanWords), ["9 to 13 Nov", "16 Nov"]);
		assert.equal(spanWords({ from: "2026-11-30", to: "2026-12-04" }), "30 Nov to 4 Dec");
		assert.equal(finalReviewWords("2026-12-08", TODAY), "Final review from 8 Dec");
	});

	it("lists the final review among the road's weeks by its day, a week split at its start (round 9, 1 D8)", () => {
		const planned = [day("2026-11-09", "a"), day("2026-11-13", "b"), day("2026-11-17", "c")];
		const road = roadOf(planned, "2026-11-19", titleOf, "2026-11-12");
		assert.deepEqual(roadLines(road, "2026-11-12"), [
			{ kind: "week", week: { from: "2026-11-09", to: "2026-11-09", titles: ["Groups"] } },
			{ kind: "final", day: "2026-11-12" },
			{ kind: "week", week: { from: "2026-11-13", to: "2026-11-13", titles: ["Subgroups"] } },
			{ kind: "week", week: { from: "2026-11-17", to: "2026-11-17", titles: ["Cosets"] } },
		]);
		const now = roadOf([day("2026-11-17"), day("2026-11-18", "d")], "2026-11-19", titleOf, "2026-11-13");
		assert.deepEqual(
			roadLines(now, "2026-11-13").map((line) => line.kind),
			["final", "week"],
			"\"Final review now\" comes before a start inside it",
		);
		assert.deepEqual(roadLines(road, null).map((line) => line.kind), ["week", "week", "week"]);
	});

	it("gives the exam entry its road and its final review", () => {
		const topics = [topic("a", { title: "Groups", level: "new" }), topic("b", { title: "Subgroups", level: "new" })];
		const gt = course("/study/gt", "Group Theory", { exam: { date: "2026-12-14", daysLeft: 36 }, topics }, { planned: [day("2026-11-09", "a"), day("2026-11-10", "b")], finalReview: "2026-12-08" });
		const exam = calendarEntries({ courses: [gt], chats: [], scope: null }).find((e) => e.kind === "exam");
		assert.ok(exam?.kind === "exam");
		assert.deepEqual([exam.road, exam.finalReview], [[{ from: "2026-11-09", to: "2026-11-10", titles: ["Groups", "Subgroups"] }], "2026-12-08"]);
		assert.equal(exam.allStarted, false);
	});

	it("says every topic started only when the plan starts none and none is left without room", () => {
		const started = (rest: Partial<CalendarCourse>, topics = [topic("a", { title: "Groups" })]) => {
			const gt = course("/study/gt", "Group Theory", { exam: { date: "2026-12-14", daysLeft: 36 }, topics }, rest);
			const exam = calendarEntries({ courses: [gt], chats: [], scope: null }).find((e) => e.kind === "exam");
			return exam?.kind === "exam" && exam.allStarted;
		};
		assert.equal(started({}), true);
		assert.equal(started({ doesNotFit: ["a" as TopicHandle] }), false);
		assert.equal(started({}, []), false, "a course with no topics yet has started none");
	});

	it("reads the final review's first day from the plan, and asks the plan up to the exam, at least six weeks", () => {
		const plan = { courses: [{ plan: { final_review_days: 6 } }] };
		assert.equal(finalReviewOf(plan, { date: "2026-12-03", daysLeft: 25 }), "2026-11-27");
		assert.equal(finalReviewOf(plan, null), null);
		assert.equal(finalReviewOf({ courses: [{}] }, { date: "2026-12-03", daysLeft: 25 }), null);
		assert.equal(planDays({ exam: null }), 42);
		assert.equal(planDays({ exam: { date: "2027-02-01", daysLeft: 85 } }), 85);
		assert.equal(planDays({ exam: { date: "2028-02-01", daysLeft: 450 } }), 366, "never past the engine's limit");
	});
});

describe("the plan's reasons and gaps in the calendar", () => {
	it("names what More folds away by kind, never by number", () => {
		const entries = calendarEntries({ courses: [LINALG], chats: [], scope: null });
		const found = entries.find((e) => e.kind === "review")!;
		const review = { ...found, overdue: false };
		assert.equal(moreWords([review, review]), "Also reviews");
		assert.equal(moreWords([{ ...found, overdue: true }]), "Also an overdue review");
		const fresh = { ...review, kind: "new" as const, waits: null };
		assert.equal(moreWords([review, fresh, review]), "Also reviews and a new topic");
		assert.doesNotMatch(moreWords([review, review, fresh]), /\d/);
	});

	it("names the topics an exam's final review has no room for, and why a first lesson waits", () => {
		const COURSE = course(
			"/study/la",
			"Linear Algebra",
			{
				exam: { date: "2026-12-03", daysLeft: 25, unreviewed: ["kernel" as TopicHandle] },
				topics: [topic("kernel", { title: "Kernel", level: "retained" }), topic("det", { title: "Determinants", level: "new", starts: "2026-11-19", startsAfter: ["Probability"] })],
			},
			{ planned: [{ date: "2026-11-19", reviews: [], new: ["det" as TopicHandle] }], finalReview: "2026-11-27" },
		);
		const entries = calendarEntries({ courses: [COURSE], chats: [], scope: null });
		const exam = entries.find((e) => e.kind === "exam");
		assert.deepEqual(exam?.kind === "exam" && exam.unreviewed, [{ title: "Kernel" }]);
		assert.deepEqual(finalReviewGapWords([{ title: "Kernel" }, { title: "Rank", reason: "full" }]), ["No room in it for Kernel and Rank"]);
		assert.deepEqual(
			finalReviewGapWords([{ title: "Binomial", reason: "full" }, { title: "Poisson", reason: "too_late" }, { title: "Geometric", reason: "no_study_day" }]),
			["No room in it for Binomial", "Poisson starts too close to the exam for a review", "No study day left in it for Geometric"],
			"round 9 (1 D8): the calendar says why as the head does, never \"No room\" for a topic that starts too close",
		);
		const fresh = entries.find((e) => e.kind === "new");
		assert.equal(fresh?.kind === "new" && fresh.waits, "After Probability's new topics");
	});

	it("says a topic the exam leaves out waits for the exam, whatever other course started first", () => {
		const COURSE = course(
			"/study/prob",
			"Probability",
			{
				exam: { date: "2026-11-19", daysLeft: 11, leavesOut: ["covariance" as TopicHandle] },
				topics: [topic("covariance", { title: "Covariance", level: "new", starts: "2026-11-21", startsAfter: ["Linear Algebra"] })],
			},
			{ planned: [{ date: "2026-11-21", reviews: [], new: ["covariance" as TopicHandle] }], finalReview: "2026-11-14" },
		);
		const entries = calendarEntries({ courses: [COURSE], chats: [], scope: null });
		const fresh = entries.find((e) => e.kind === "new");
		assert.equal(fresh?.kind === "new" && fresh.waits, "Not on the exam; after it");
		const exam = entries.find((e) => e.kind === "exam");
		assert.deepEqual(exam?.kind === "exam" && exam.road, []);
	});
});

describe("an overdue review's due day", () => {
	it("is its days overdue before the day the engine dates it, never that day itself", () => {
		assert.equal(dueDay({ kind: "due", date: "2026-11-08", overdue: 2 }), "2026-11-06");
		assert.equal(dueDay({ kind: "due", date: "2026-11-01", overdue: 7 }), "2026-10-25");
		assert.equal(dueDay({ kind: "due", date: "2026-11-08", overdue: 0 }), "2026-11-08");
		assert.equal(dueDay({ kind: "scheduled", date: "2026-11-12" }), null);
		assert.equal(dueDay(null), null);
	});

	it("rides on the calendar's overdue entry", () => {
		const entries = calendarEntries({ courses: [LINALG], chats: [], scope: null });
		const span = entries.find((e) => e.kind === "review" && e.topic.handle === "span");
		assert.equal(span?.kind === "review" ? span.dueOn : undefined, "2026-10-29");
	});
});
