/**
 * Round 15, m6 (1 m6, 3 m7): one topic on two rows.
 *   - Home on 10 Nov: "Review Linear maps and their matrices · Due today"
 *     beside "Continue Linear maps and their matrices lesson · Left off
 *     yesterday". The lesson counted the review once resumed, so while a
 *     topic's lesson is open, its review folds into the lesson's line.
 *   - The calendar on Sun 8: "Linear maps · Your turn" (the lesson started
 *     that day) beside "Linear maps · New topic" (the plan's start). A
 *     lesson on a planned new topic that day is its start: only the session.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openSessions, todayRows } from "../components/study-home/study-facts.ts";
import { lessonTitle } from "../components/study-home/agenda-rows/row-facts.ts";
import { calendarEntries } from "../components/calendar/calendar-facts.ts";
import type { CalendarCourse, ChatListItem, CourseMap, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { LA, chat, map, topic } from "./fixtures/round8-home.ts";

const h = (s: string) => s as TopicHandle;

describe("Home on 10 Nov: the Linear maps lesson left yesterday, its topic's review due today (m6)", () => {
	const D10 = "2026-11-10";
	const TASK = { key: "linear-maps-lesson", title: "Linear maps and their matrices lesson", step: "The columns of a map's matrix", updated: "2026-11-09", topics: [h("linear-maps")] };
	const course: StudyCourse = {
		map: map({
			today: D10,
			current: h("linear-maps"),
			tasks: [TASK],
			topics: [
				topic("linear-maps", "Linear maps and their matrices", { review: { kind: "due", date: D10, overdue: 0 }, tasks: [TASK.key] }),
				topic("binomial", "Matrix multiplication as composition", { review: { kind: "due", date: D10, overdue: 0 } }),
			],
		}),
		unready: null,
		due: [h("linear-maps"), h("binomial")],
		newToday: [],
		lastActiveDaysAgo: 1,
	};
	const lesson = chat({ id: "lm", title: "Linear maps and their matrices lesson", ended: "left", tasks: [TASK.key], topics: ["linear-maps"], ownTopics: ["linear-maps"], updatedAt: "2026-11-09T15:00:00.000Z" });

	it("lists the topic once, on the lesson's line in the review's place, the rest of the review on its own", () => {
		const rows = todayRows([course], openSessions([lesson]), D10);
		assert.deepEqual(rows.map((r) => (r.kind === "session" ? `session ${r.chat.id}` : lessonTitle(r))), ["session lm", "Review Matrix multiplication as composition"]);
	});

	it("keeps the review's line when no lesson on the topic is open", () => {
		const rows = todayRows([course], openSessions([]), D10);
		assert.deepEqual(rows.map(lessonTitle), ["Linear Algebra review", "Continue Linear maps and their matrices lesson"]);
	});
});

describe("the calendar on Sun 8 Nov: a lesson started on the topic the plan starts that day (m6)", () => {
	const D8 = "2026-11-08";
	const mapOf: CourseMap = { ...map({ today: D8, topics: [topic("linear-maps", "Linear maps and their matrices", { level: "new", introduced: null, starts: D8 })] }) };
	const course: CalendarCourse = { map: mapOf, unready: null, due: [], newToday: [h("linear-maps")], lastActiveDaysAgo: 0, planned: [{ date: D8, reviews: [], new: [h("linear-maps")] }], doesNotFit: [], finalReview: null };
	const started: ChatListItem = chat({ id: "lm", title: "Linear maps and their matrices", pendingQuestion: true, course: LA, topics: ["linear-maps"], ownTopics: ["linear-maps"], updatedAt: `${D8}T11:00:00.000Z` });

	it("draws the session alone, never beside the plan's New topic", () => {
		const entries = calendarEntries({ courses: [course], chats: [started], scope: null }).filter((e) => e.day === D8 && e.kind !== "exam");
		assert.deepEqual(entries.map((e) => e.kind), ["session"]);
	});

	it("draws the plan's start while no lesson on it was started that day", () => {
		const entries = calendarEntries({ courses: [course], chats: [], scope: null }).filter((e) => e.day === D8 && e.kind !== "exam");
		assert.deepEqual(entries.map((e) => e.kind), ["new"]);
	});
});
