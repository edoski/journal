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
import { doesNotFitOf, finalReviewDaysOf, plannedOf, scheduleOf } from "../src/server/calendar.ts";
import { calendarEntries, dayListWords, distanceWords, finalReviewWords, lookOf, misfitWords, newTopicWords, quietBetween, sessionType, studyTimeWords } from "../components/calendar/calendar-facts.ts";

const TODAY = "2026-11-08";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };
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
	return { map, unready: null, due: [], lastActiveDaysAgo: 0, finalReviewDays: null, planned: [], doesNotFit: [], ...rest };
}

const LINALG = course(
	"/study/linalg",
	"Linear Algebra",
	{
		exam: { date: "2026-11-29", daysLeft: 21 },
		tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" }],
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
		finalReviewDays: 6,
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

	it("gives a review the topic page's action and an open task its opening and topic", () => {
		const entries = calendarEntries({ courses: [LINALG], chats: [], scope: null });
		const span = entries.find((e) => e.kind === "review" && e.title === "Span");
		assert.deepEqual(span?.kind === "review" && span.action, { kind: "review", opening: "Review Span" });
		const task = entries.find((e) => e.kind === "task");
		assert.equal(task?.kind === "task" && task.opening, "Continue Problem sheet 4");
		assert.equal(task?.kind === "task" && task.topic?.handle, "rank");
		const exam = entries.find((e) => e.kind === "exam" && e.course.workspace === "/study/linalg");
		assert.deepEqual(exam?.kind === "exam" && [exam.newDays, exam.finalReview], [["2026-11-09"], "2026-11-23"]);
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
		assert.equal(studyTimeWords({ date: TODAY, off: false, windows: [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }] }), "9:00 to 12:30, 13:30 to 18:00");
		assert.equal(studyTimeWords({ date: TODAY, off: true, windows: [] }), "Day off");
		assert.equal(studyTimeWords({ date: TODAY, off: false, windows: [] }), null);
		assert.equal(studyTimeWords(undefined), null);
	});

	it("says the exam's new-topic days and final review as the calendar shows them", () => {
		assert.equal(dayListWords(["2026-11-09", "2026-11-11", "2026-11-12"]), "Monday 9, Wednesday 11 and Thursday 12 November");
		assert.equal(dayListWords(["2026-11-30", "2026-12-01"]), "Monday 30 November and Tuesday 1 December");
		assert.equal(newTopicWords(["2026-11-09"], []), "New topics on Monday 9 November");
		assert.equal(newTopicWords([], []), "Every topic started");
		assert.equal(newTopicWords([], ["Rank"]), null);
		assert.equal(newTopicWords(null, []), null);
		assert.equal(finalReviewWords("2026-11-13", TODAY), "Final review from Friday 13 November");
		assert.equal(finalReviewWords(TODAY, TODAY), "Final review now, until the exam");
		assert.equal(finalReviewWords(null, TODAY), null);
	});

	it("says how far a day is from the engine's", () => {
		assert.deepEqual(
			["2026-11-08", "2026-11-09", "2026-11-07", "2026-11-19", "2026-11-29", "2026-11-01"].map((d) => distanceWords(d, TODAY)),
			["Today", "Tomorrow", "Yesterday", "In 11 days", "In 3 weeks", "7 days ago"],
		);
	});
});

describe("the calendar's read of plan", () => {
	it("takes the final review's lead only when plan gives it", () => {
		assert.equal(finalReviewDaysOf({ courses: [{ plan: { final_review_days: 6 } }] }), 6);
		assert.equal(finalReviewDaysOf({ courses: [{}] }), null);
		assert.equal(finalReviewDaysOf(null), null);
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
			{ date: "2026-11-08", off: false, windows: [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }] },
			{ date: "2026-11-09", off: true, windows: [] },
			{ date: "2026-11-10", off: false, windows: [] },
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
			{ date: "2026-11-08", off: true, windows: [] },
			{ date: "2026-11-09", off: false, windows: [] },
		]);
		const alone = scheduleOf({ today: "2026-11-08", capacity });
		assert.equal(alone.length, 42);
		assert.deepEqual(alone.slice(0, 3).map((d) => d.off), [true, false, false]);
	});
});
