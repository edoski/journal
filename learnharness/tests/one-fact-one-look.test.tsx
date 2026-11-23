/**
 * One fact, one look (audit 17 Nov 2026, finding 3): a status is drawn by
 * one mark from one icon table (`StatusMark`, `FACT_ICON`), so the same
 * fact wears the same icon in the same ink on Home's row, the sidebar's
 * card, the course page's row, the map's card, the topic page and the
 * calendar. Before, seven components and five tables drew it: the tutor
 * writing was a pen on Home and a muted spinner on the topic page, an open
 * task a clipboard on the calendar, a new topic an open book on the
 * calendar and the topic page, and Your turn muted on a map card. Same
 * tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ArrowRightIcon, BookmarkIcon, MessageCircleQuestionIcon, type LucideIcon } from "lucide-react";
import type { CalendarCourse, ChatListItem, CourseMapTopic, TopicHandle } from "../src/core/index.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { NowCard } from "../components/unit-inbox/now-card.tsx";
import { topicUnit } from "../components/unit-inbox/now-inbox.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import { sidebarSays } from "../components/unit-inbox/sidebar-says.ts";
import { CourseTopicRow } from "../components/course-page/course-topic-row.tsx";
import { standingOf, cardLine } from "../components/course-map/topic-map/topic-standing.ts";
import { MapCard } from "./helpers/map-card.tsx";
import { topicFacts, type SessionEntry } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { SessionItem } from "../components/unit-inbox/topic-page/hybrid/history.tsx";
import { ScheduledEntry } from "../components/unit-inbox/topic-page/pickup/pickup-parts.tsx";
import { sessionState } from "../components/nav/session-state.ts";
import { HybridTopic } from "../components/unit-inbox/topic-page/hybrid/hybrid-topic.tsx";
import { calendarEntries } from "../components/calendar/calendar-facts.ts";
import { CalendarEntryView } from "../components/calendar/calendar-entry.tsx";
import { chat, map, TODAY, topic } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;

// One course where each fact holds on one topic: a lesson waits on him (Eigenvalues), the tutor writes in one (Rank), a
// task is open (Determinants), and today's plan starts a new topic (Diagonalization).
const la = { workspace: "/s/linalg", title: "Linear Algebra" };
const TASK = { key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: "2026-11-06" };
const TOPICS: CourseMapTopic[] = [
	topic("eigen", "Eigenvalues", "introduced"),
	topic("rank", "Rank", "attempted"),
	topic("det", "Determinants", "assisted", { tasks: [TASK.key] }),
	topic("diag", "Diagonalization", "new"),
];
const COURSE: CalendarCourse = {
	map: map({ ...la, current: "eigen" as TopicHandle, tasks: [TASK], topics: TOPICS }),
	unready: null,
	due: [],
	newToday: ["diag" as TopicHandle],
	lastActiveDaysAgo: 0,
	planned: [{ date: TODAY, reviews: [], new: ["diag" as TopicHandle] }],
	doesNotFit: [],
	finalReview: null,
};
const CHATS: ChatListItem[] = [
	chat("chat_eigen", { title: "Eigenvalues lesson", course: la, topics: ["eigen"], pendingQuestion: true, updatedAt: `${TODAY}T09:20:00.000Z` }),
	chat("chat_rank", { title: "Rank lesson", course: la, topics: ["rank"], busy: true, updatedAt: `${TODAY}T09:30:00.000Z` }),
];

/** What a mark looks like: its icon (a lucide icon by name, or the
 *  tutor's spinner) and the ink it wears, its own or the nearest above. */
function look(mark: Element | null | undefined): string {
	if (!mark) return "missing";
	const icon = mark.matches("svg") ? mark : mark.querySelector('svg[data-testid="braille-spinner"], svg[class*="lucide"]');
	if (!icon) return "no icon";
	const name = icon.getAttribute("data-testid") === "braille-spinner" ? "spinner" : (icon.getAttribute("class")!.match(/lucide-[a-z-]+/g)!.find((c) => c !== "lucide-icon") ?? "?");
	for (let el: Element | null = icon; el; el = el.parentElement) {
		const ink = (el.getAttribute("class") ?? "").split(/\s+/).find((c) => /^text-(link|muted-foreground|foreground)$/.test(c));
		if (ink) return `${name} ${ink}`;
	}
	return `${name}, no ink`;
}
const lucide = (Icon: LucideIcon) => look(render(<Icon className="text-muted-foreground" />).querySelector("svg")).split(" ")[0];

const { rows, lines } = needsYouNow([COURSE], CHATS, TODAY);
const homeRows = [...render(<HybridRows rows={rows} busy={false} onContinue={() => {}} />).querySelectorAll('[data-slot="today-line"]')];
const inbox = buildInbox([COURSE], CHATS, null);
const said = sidebarSays([COURSE], CHATS, la.workspace);
const byHandle = (handle: string) => TOPICS.find((t) => t.handle === handle)!;
const entries = calendarEntries({ courses: [COURSE], chats: CHATS, scope: null });

/** Each surface's mark for a fact: Home's row and the sidebar's card for a
 *  line of Today (by its title), the course page's row and the map's card
 *  for a topic, the topic page's Now, a session row and a Scheduled first
 *  lesson, and the calendar's entry. */
const surface = {
	home: (title: string) => homeRows.find((row) => row.textContent!.includes(title))?.querySelector('[data-slot="today-why"], [data-slot="today-standing"]'),
	sidebar(title: string) {
		const line = lines.find((l) => l.title.includes(title));
		if (!line) return null;
		const unit = line.lead ? topicUnit(inbox, COURSE, line.lead, CHATS) : null;
		return render(<NowCard line={line} unit={unit} active={false} chats={CHATS} />).querySelector('[data-slot="unit-status-slot"]');
	},
	course(handle: string) {
		const t = byHandle(handle);
		const row = { topic: t, group: "learning" as never, standing: standingOf(t), current: false, fact: said.get(t.handle)?.fact ?? null, factWords: null, href: "/" };
		return render(<CourseTopicRow row={row} />).querySelector('[data-slot="course-topic-fact"]');
	},
	map(handle: string) {
		const t = byHandle(handle);
		return render(<MapCard topic={t} standing={standingOf(t)} line={cardLine(said.get(t.handle))} />).querySelector('[data-slot="topic-need"]');
	},
	topicNow: (handle: string) =>
		render(<HybridTopic facts={topicFacts({ course: COURSE, topic: byHandle(handle), chats: CHATS, read: null })} busy={false} onAct={() => {}} onTask={() => {}} />).querySelector('[data-slot="pickup-now"] > :first-child'),
	topicScheduled: (day: string) => render(<ScheduledEntry kind="start" day={day} waits={null} />).querySelector('[data-slot="pickup-scheduled"]'),
	topicSession(id: string) {
		const c = CHATS.find((x) => x.id === id)!;
		const entry: SessionEntry = { chat: c, own: true, maps: true, state: sessionState(c), day: TODAY, when: "Today", plan: null };
		return render(<SessionItem entry={entry} shown={false} onShow={() => {}} ends={{ above: false, below: false }} />).querySelector('[data-slot="topic-why"]');
	},
	calendar(kind: "session" | "task" | "new") {
		const entry = entries.find((e) => e.kind === kind && (kind !== "session" || (e.kind === "session" && e.waits)));
		if (!entry) return null;
		const doc = render(<CalendarEntryView entry={entry} today={entry.day} onStart={() => {}} />);
		// A session that waits says Your turn beside its look: the mark is the words' own.
		return kind === "session" ? [...doc.querySelectorAll("span")].find((s) => s.textContent === "Your turn" && s.querySelector("svg")) : doc.querySelector('[data-slot="calendar-entry"]');
	},
};

describe("one fact, one look on every surface (finding 3)", () => {
	it("draws Your turn as the question bubble in the accent, on the map card of the topic it waits on too (round 20, m4)", () => {
		const want = `${lucide(MessageCircleQuestionIcon)} text-link`;
		assert.deepEqual(
			{ home: look(surface.home("Eigenvalues lesson")), sidebar: look(surface.sidebar("Eigenvalues lesson")), course: look(surface.course("eigen")), map: look(surface.map("eigen")), topicNow: look(surface.topicNow("eigen")), topicSession: look(surface.topicSession("chat_eigen")), calendar: look(surface.calendar("session")) },
			{ home: want, sidebar: want, course: want, map: want, topicNow: want, topicSession: want, calendar: want },
		);
	});

	it("draws the tutor writing as the braille spinner in its own ink, never Home's pen", () => {
		const want = "spinner text-foreground";
		assert.deepEqual(
			{ home: look(surface.home("Rank lesson")), sidebar: look(surface.sidebar("Rank lesson")), course: look(surface.course("rank")), map: look(surface.map("rank")), topicNow: look(surface.topicNow("rank")), topicSession: look(surface.topicSession("chat_rank")) },
			{ home: want, sidebar: want, course: want, map: want, topicNow: want, topicSession: want },
			"the card of the topic the tutor writes in says so, as its page's Now does (round 20, m4)",
		);
	});

	it("draws an open task as the bookmark, muted, the calendar's clipboard gone", () => {
		const want = `${lucide(BookmarkIcon)} text-muted-foreground`;
		assert.deepEqual(
			{ home: look(surface.home("Problem sheet 4")), sidebar: look(surface.sidebar("Problem sheet 4")), course: look(surface.course("det")), map: look(surface.map("det")), topicNow: look(surface.topicNow("det")), calendar: look(surface.calendar("task")) },
			{ home: want, sidebar: want, course: want, map: "missing", topicNow: want, calendar: want },
			"a map card shows its topic's standing, never Left off (round 15, m8)",
		);
	});

	it("draws a new topic as Home's arrow, muted, the calendar's and the topic page's open book gone", () => {
		const want = `${lucide(ArrowRightIcon)} text-muted-foreground`;
		assert.deepEqual(
			{ home: look(surface.home("Diagonalization")), sidebar: look(surface.sidebar("Diagonalization")), course: look(surface.course("diag")), map: look(surface.map("diag")), topicScheduled: look(surface.topicScheduled("Mon 9 Nov")), calendar: look(surface.calendar("new")) },
			{ home: want, sidebar: want, course: want, map: want, topicScheduled: want, calendar: want },
		);
	});
});
