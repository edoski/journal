/**
 * One status per session on the calendar too (round 12, 2 n2): Problem
 * sheet 4, left for next time this morning, read "Left off today" on Home
 * and in the sidebar and "Unfinished" on the calendar. An entry of open
 * work reads the status Home's line for it says (`needsYouNow`'s `slot`,
 * the function Home's rows and the sidebar's cards share); "Unfinished"
 * stays only for open work Home has no line for.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarCourse } from "../src/core/contracts/calendar.ts";
import type { CourseMap, TopicHandle } from "../src/core/contracts/course-map.ts";
import { calendarEntries, lookOf, lookWords } from "../components/calendar/calendar-facts.ts";
import { needsYouNow, nowLine } from "../components/study-home/needs-you.ts";
import { chat, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-09";
const SHEET = { key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: TODAY, topics: ["rank" as TopicHandle, "basis" as TopicHandle] };

function course(over: Partial<CourseMap> = {}): CalendarCourse {
	const map: CourseMap = {
		workspace: "/s/la",
		title: "Linear Algebra",
		today: TODAY,
		revision: 1,
		exam: null,
		current: "rank" as TopicHandle,
		focus: null,
		tasks: [SHEET],
		topics: [topic("basis", "Basis", { level: "independent" }), topic("rank", "Rank", { level: "assisted", tasks: ["sheet-4"] })],
		edges: [],
		...over,
	};
	return { map, unready: null, due: [], newToday: [], lastActiveDaysAgo: 0, planned: [], doesNotFit: [], finalReview: null };
}

/** The words of each calendar entry of open work today, beside what
 *  Home's lines say. */
function said(courses: CalendarCourse[], chats: ReturnType<typeof chat>[]) {
	const entries = calendarEntries({ courses, chats, scope: null }).filter((e) => e.day === TODAY && lookOf(e) === "task");
	const { lines, also } = needsYouNow(courses, chats, TODAY);
	return { calendar: entries.map((e) => lookWords(e, TODAY)), home: [...lines, ...also].map((l) => l.slot) };
}

describe("the calendar's open work says Home's status (round 12, 2 n2)", () => {
	it("a sheet session waiting on him says Home's line's words, never Unfinished", () => {
		const sheet = chat({ id: "sheet", title: "Problem sheet 4", kind: "practice", pendingProblem: true, tasks: ["sheet-4"], topics: ["rank", "basis"], ownTopics: ["rank"], updatedAt: `${TODAY}T09:30:00.000Z` });
		const { calendar, home } = said([course()], [sheet]);
		assert.deepEqual(calendar, ["Your turn"]);
		assert.ok(home.includes(calendar[0]!), `calendar "${calendar[0]}" is one of Home's ${JSON.stringify(home)}`);
	});

	it("a sheet session left for next time today says Left off today, as its sidebar card does, never Unfinished", () => {
		const sheet = chat({ id: "sheet", title: "Problem sheet 4", kind: "practice", ended: "left", tasks: ["sheet-4"], topics: ["rank", "basis"], ownTopics: ["rank"], updatedAt: `${TODAY}T09:30:00.000Z` });
		const [line] = [nowLine({ kind: "session", chat: sheet, course: course() })];
		assert.deepEqual(said([course()], [sheet]).calendar, [line!.slot]);
		assert.equal(line!.slot, "Left off today");
	});

	it("an open task with no session says Home's words for its course line", () => {
		const { calendar, home } = said([course()], []);
		assert.equal(calendar.length, 1);
		assert.deepEqual(calendar, home.filter(Boolean));
		assert.notEqual(calendar[0], "Unfinished");
	});

	it("a lesson moved to practice and left for next time says Left off today, never its kind (round 13, 2 n4)", () => {
		const eigen = chat({ id: "chat_demo_eigen", title: "Eigenvalues and eigenvectors", kind: "practice", ended: "left", tasks: [], topics: ["rank"], ownTopics: ["rank"], updatedAt: `${TODAY}T09:30:00.000Z` });
		const entry = calendarEntries({ courses: [course({ tasks: [] })], chats: [eigen], scope: null }).find((e) => e.id === "session:chat_demo_eigen")!;
		assert.equal(lookWords(entry, TODAY), "Left off today");
		const finished = calendarEntries({ courses: [course({ tasks: [] })], chats: [{ ...eigen, ended: "closed" }], scope: null }).find((e) => e.id === "session:chat_demo_eigen")!;
		assert.equal(lookWords(finished, TODAY), "Practice", "a finished session still says what it was");
	});
});

/**
 * Round 17, m14 (3 m6): the closes said the lesson "carries on from there",
 * and the calendar showed only the next day's reviews. The rest of a lesson
 * he left today is on the course's next study day the plan holds, under
 * the session's name, and continues it.
 */
describe("the rest of a lesson left today (round 17, m14)", () => {
	const INV = { key: "invertible-lesson", title: "Invertible matrices lesson", step: "Two-sided inverses", updated: TODAY, topics: ["invertible" as TopicHandle] };
	const withPlan = (): CalendarCourse => ({
		...course({ tasks: [INV], topics: [topic("invertible", "Invertible matrices", { level: "attempted", tasks: ["invertible-lesson"] }), topic("rank", "Rank", { level: "independent" })] }),
		planned: [{ date: "2026-11-10", reviews: ["rank" as TopicHandle], new: [] }] as never,
	});
	const lesson = chat({ id: "inv", title: "Invertible matrices lesson", ended: "left", topics: ["invertible"], ownTopics: ["invertible"], tasks: ["invertible-lesson"], updatedAt: `${TODAY}T11:00:00.000Z` });

	it("shows on the next planned study day, opening the lesson", () => {
		const next = calendarEntries({ courses: [withPlan()], chats: [lesson], scope: null }).filter((e) => e.day === "2026-11-10" && e.kind === "task");
		assert.deepEqual(next.map((e) => e.title), ["Invertible matrices lesson"]);
		const entry = next[0]!;
		assert.ok(entry.kind === "task" && entry.move.kind === "open" && entry.move.chat.id === "inv");
	});

	it("not for a lesson he finished", () => {
		const done = { ...lesson, ended: "closed" as const };
		assert.deepEqual(calendarEntries({ courses: [withPlan()], chats: [done], scope: null }).filter((e) => e.day === "2026-11-10" && e.kind === "task"), []);
	});
});
