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
import { calendarEntries, distanceWords, finalReviewWords, lookOf, misfitWords, quietBetween, unreviewedWords, roadOf, sessionType, spanWords, studyTimeWords } from "../components/calendar/calendar-facts.ts";

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
			topic("span", { title: "Span", review: { kind: "due", date: "2026-10-29", overdue: 10 } }),
			topic("basis", { title: "Basis", review: { kind: "due", date: TODAY, overdue: 0 } }),
			topic("vectors", { title: "Vectors", review: { kind: "scheduled", date: "2026-11-13" } }),
			topic("rank", { title: "Rank", level: "assisted", review: { kind: "due", date: "2026-11-05", overdue: 3 }, tasks: ["sheet-4"] }),
			topic("eigen", { title: "Eigenvalues", level: "new" }),
		],
	},
	{
		due: ["span" as TopicHandle, "basis" as TopicHandle],
		finalReview: "2026-11-23",
		planned: [
			{ date: TODAY, reviews: ["span" as TopicHandle, "basis" as TopicHandle, "rank" as TopicHandle], new: [] },
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
		compacting: false,
		...over,
	};
}

const summary = (entries: ReturnType<typeof calendarEntries>) => entries.map((e) => `${e.day} ${lookOf(e)} ${e.title}`);

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

	it("shows only the reviews plan makes for today, and no stored date the plan does not propose", () => {
		const titles = calendarEntries({ courses: [LINALG, PROB], chats: [], scope: null }).map((e) => e.title);
		assert.ok(!titles.includes("Rank"), "Rank is due but not in today's review");
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

	it("says why a review waits on the day the plan holds it to, and only there", () => {
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
				["Limits", "2026-12-03", "Due since 1 Oct", "Waits for your Probability exam"],
				["Limits", "2026-12-20", null, null],
			],
		);
	});

	it("gives a review the topic page's action and an open task its opening and topic", () => {
		const entries = calendarEntries({ courses: [LINALG], chats: [], scope: null });
		const span = entries.find((e) => e.kind === "review" && e.title === "Span");
		assert.deepEqual(span?.kind === "review" && span.action, { kind: "review", opening: "Review Span" });
		const task = entries.find((e) => e.kind === "task");
		assert.equal(task?.kind === "task" && task.opening, "Continue Problem sheet 4");
		assert.equal(task?.kind === "task" && task.topic?.handle, "rank");
		const exam = entries.find((e) => e.kind === "exam" && e.course.workspace === "/study/linalg");
		assert.deepEqual(exam?.kind === "exam" && [exam.road, exam.finalReview], [[{ from: "2026-11-09", to: "2026-11-09", titles: ["Eigenvalues"] }], "2026-11-23"]);
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
			"2026-11-08 check-in From tomorrow",
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

	it("keeps one course when scoped, and with it no session outside a course", () => {
		const general = chat({ course: undefined });
		const entries = calendarEntries({ courses: [LINALG, PROB], chats: [general, chat()], scope: "/study/prob" });
		assert.deepEqual(summary(entries), ["2026-11-09 review Bayes' rule", "2026-11-19 exam Probability exam"]);
	});

	it("names a session's type from its transcript", () => {
		assert.equal(sessionType(chat({ kind: "practice", phase: "probe" })), "practice");
		assert.equal(sessionType(chat({ phase: "probe" })), "check-in");
		assert.equal(sessionType(chat({ phase: "plan" })), "plan");
		assert.equal(sessionType(chat({ phase: "teach" })), "lesson");
	});

	it("knows a quiet week", () => {
		const entries = calendarEntries({ courses: [LINALG], chats: [], scope: null });
		assert.equal(quietBetween(entries, "2026-11-30", "2026-12-07"), true);
		assert.equal(quietBetween(entries, "2026-11-02", "2026-11-09"), false);
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

	it("says how far a day is from the engine's", () => {
		assert.deepEqual(
			["2026-11-08", "2026-11-09", "2026-11-07", "2026-11-19", "2026-11-29", "2026-11-01"].map((d) => distanceWords(d, TODAY)),
			["Today", "Tomorrow", "Yesterday", "In 11 days", "In 21 days", "7 days ago"],
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
		assert.deepEqual(exam?.kind === "exam" && exam.unreviewed, ["Kernel"]);
		assert.equal(unreviewedWords(["Kernel", "Rank"]), "No room in it for Kernel and Rank");
		const fresh = entries.find((e) => e.kind === "new");
		assert.equal(fresh?.kind === "new" && fresh.waits, "After Probability's new topics");
	});
});
