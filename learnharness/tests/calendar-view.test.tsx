/**
 * The calendar page as Edo sees it, mounted on FullCalendar's day grid in
 * a DOM: an empty week says so, a busy week shows each entry's course
 * mark, title and type, an exam names how far off it is, an overdue
 * review says how late, as Home does ("Due since 29 Oct"), and a review's panel starts the topic page's
 * session or opens the topic.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
// The day grid's More panel asks whether its root is a Document.
(globalThis as Record<string, unknown>).Document = dom.document.constructor;
// next/link reaches for `self` when a link mounts.
(globalThis as Record<string, unknown>).self = globalThis;
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CalendarCourse } from "../src/core/contracts/calendar.ts";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { calendarEntries } from "../components/calendar/calendar-facts.ts";
import { CalendarView } from "../components/calendar/calendar-view.tsx";
import type { StartSession } from "../components/calendar/calendar-entry.tsx";

const TODAY = "2026-11-08";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, review: CourseMapTopic["review"]): CourseMapTopic => ({
	handle: handle as TopicHandle,
	title,
	level: "retained",
	introduced: "2026-10-01",
	review,
	weak: false,
	signals: QUIET,
	tasks: [],
});

function linalg(exam: string | null): CalendarCourse {
	return {
		map: {
			workspace: "/study/linalg",
			title: "Linear Algebra",
			today: TODAY,
			revision: 1,
			exam: exam ? { date: exam, daysLeft: 0 } : null,
			current: null,
			focus: null,
			tasks: [],
			topics: [topic("span", "Span", { kind: "due", date: TODAY, overdue: 10 }), topic("vectors", "Vectors", { kind: "scheduled", date: "2026-11-13" })],
			edges: [],
		},
		unready: null,
		due: ["span" as TopicHandle],
		newToday: [],
		lastActiveDaysAgo: 0,
		planned: [{ date: "2026-11-13", reviews: ["vectors" as TopicHandle], new: [] }],
		doesNotFit: [],
		finalReview: null,
	};
}

const lesson: ChatListItem = {
	id: "chat_eigen",
	title: "Eigenvalues and eigenvectors",
	createdAt: "2026-11-08T08:00:00",
	updatedAt: "2026-11-08T08:19:00",
	kind: "teach",
	messageCount: 6,
	phase: "teach",
	pendingQuestion: true,
	pendingProblem: false,
	course: { workspace: "/study/linalg", title: "Linear Algebra" },
	topics: [],
	busy: false,
};

const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
});

async function mount(courses: CalendarCourse[], chats: ChatListItem[], onStart: StartSession = () => {}) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const entries = calendarEntries({ courses, chats, scope: null });
	await act(async () => {
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<CalendarView courses={courses} entries={entries} schedule={[{ date: TODAY, off: false, journalOff: false, windows: [{ start: "09:00", end: "12:30" }] }]} today={TODAY} scope={null} onScopeChange={() => {}} busy={false} onStart={onStart} />
			</AppRouterContext.Provider>,
		);
	});
	await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
}

const text = (selector: string) => [...document.querySelectorAll(selector)].map((n) => n.textContent?.replace(/\s+/g, " ").trim());

async function press(target: Element) {
	await act(async () => {
		for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
			const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
			Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1 });
			target.dispatchEvent(event);
		}
	});
}

/** Month, then a day's More: the day grid's own panel of everything on it. */
async function openDayPanel(day: string) {
	await press(document.querySelector("[data-testid=calendar-view-month]")!);
	await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
	await press(document.querySelector(`[data-date="${day}"] [data-slot=calendar-more]`)!.closest("[aria-expanded]")!);
}

describe("the calendar page", () => {
	it("says an empty week is empty", async () => {
		await mount([{ ...linalg(null), due: [], map: { ...linalg(null).map, topics: [] } }], []);
		assert.deepEqual(text("[data-slot=calendar-quiet]"), ["Nothing scheduled this week"]);
		assert.deepEqual(text("[data-slot=calendar-range]"), ["2 to 8 Nov 2026"]);
		assert.equal(document.querySelectorAll("[data-slot=calendar-entry]").length, 0);
	});

	it("shows a busy week by day: the title, then the course mark and the type, or Your turn on a waiting lesson", async () => {
		const drills = { ...lesson, id: "chat_drills", title: "Span drills", kind: "practice" as const, phase: "probe" as const, pendingQuestion: false, updatedAt: "2026-11-04T18:00:00" };
		await mount([linalg(null)], [lesson, drills]);
		assert.equal(document.querySelector("[data-slot=calendar-quiet]"), null);
		assert.deepEqual(text("[data-slot=calendar-entry]"), ["Span drillsLAPractice", "Eigenvalues and eigenvectorsLAYour turn", "SpanLADue since 29 Oct"]);
		assert.deepEqual(text("[data-slot=calendar-day-head][data-today]"), ["Sun8Study 9:00 to 12:30"]);
		assert.ok(document.querySelector('[data-slot=calendar-entry][data-look=lesson] svg[aria-label="Lesson"]'), "the waiting lesson's icon names its look");
	});

	it("leads an exam day with the exam and how far off it is", async () => {
		await mount([linalg(TODAY)], []);
		const [first] = text("[data-slot=calendar-entry]");
		assert.equal(first, "Linear Algebra examLAExam, today");
	});

	it("gives an exam's panel the course's next step toward it, the one Home's line takes", async () => {
		const started: unknown[] = [];
		await mount([linalg("2026-11-12")], [], (...args) => started.push(args));
		await press(document.querySelector('[aria-label="Next week"]')!);
		await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
		const exam = document.querySelector("[data-slot=calendar-entry][data-look=exam]");
		assert.ok(exam, "the exam");
		await press(exam);
		const step = document.querySelector("[data-slot=calendar-entry-detail] [data-slot=exam-next]");
		assert.equal(step?.querySelector("[data-slot=exam-next-what]")?.textContent, "Span", "what comes next is a line of its own");
		const next = step?.querySelector("[data-slot=calendar-entry-start]");
		// Round 5: "Review Random variables and distributions, Binomial distribution" wrapped the filled button onto two lines.
		assert.equal(next?.textContent, "Review", "the button holds only the verb, so it never wraps");
		await press(next!);
		assert.deepEqual(started, [["Review Span", "/study/linalg", { topics: ["span"] }]]);
	});

	it("gives every panel one width: an exam's, a review's and a day's", async () => {
		const widthOf = (el: Element | null) => (el?.className ?? "").split(/\s+/).filter((c) => /^w-/.test(c));
		const remount = async (courses: CalendarCourse[], chats: ChatListItem[]) => {
			await act(async () => root?.unmount());
			host?.remove();
			await mount(courses, chats);
		};
		await mount([linalg(TODAY)], []);
		await press(document.querySelector("[data-slot=calendar-entry][data-look=overdue]")!);
		const review = widthOf(document.querySelector("[data-slot=calendar-entry-detail]"));
		assert.equal(review.length, 1, "a review's panel sets its width");
		await remount([linalg(TODAY)], []);
		await press(document.querySelector("[data-slot=calendar-entry][data-look=exam]")!);
		assert.deepEqual(widthOf(document.querySelector("[data-slot=calendar-entry-detail]")), review, "an exam's panel is as wide as a review's (round 5: 318 against 286)");
		await remount([linalg(null)], Array.from({ length: 8 }, (_, i) => ({ ...lesson, id: `chat_${i}`, title: `Lesson ${i}` })));
		await openDayPanel("2026-11-08");
		assert.deepEqual(widthOf(document.querySelector('[role=dialog][data-date="2026-11-08"]')), review, "a day's panel is as wide too");
	});

	it("heads a month day's panel with its date, not just the weekday", async () => {
		await mount([linalg(null)], Array.from({ length: 8 }, (_, i) => ({ ...lesson, id: `chat_${i}`, title: `Lesson ${i}` })));
		await openDayPanel("2026-11-08");
		const panel = document.querySelector('[role=dialog][data-date="2026-11-08"]');
		assert.ok(panel, "the day's panel opens");
		// Round 5: it read "Sun".
		assert.deepEqual(text("[data-slot=calendar-day-panel-head]"), ["Sunday 8 November"]);
	});

	it("opens an overdue review's panel, which starts the topic page's session or opens the topic", async () => {
		const started: unknown[] = [];
		await mount([linalg(null)], [], (...args) => started.push(args));
		const overdue = document.querySelector("[data-slot=calendar-entry][data-look=overdue]");
		assert.ok(overdue, "an overdue review");
		await press(overdue);
		const detail = document.querySelector("[data-slot=calendar-entry-detail]");
		assert.ok(detail, "its panel opens");
		// The engine dates a due review on today and counts its days overdue (round 4: it read today's date).
		assert.match(detail.textContent ?? "", /SpanDue since 29 OctWas due Thursday 29 October/);
		assert.equal(detail.querySelector("a")?.getAttribute("href"), "/unit/L3N0dWR5L2xpbmFsZw/span");
		await press(detail.querySelector("[data-slot=calendar-entry-start]")!);
		assert.deepEqual(started, [["Review Span", "/study/linalg", { topics: ["span"] }]]);
	});
});
