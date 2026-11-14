/**
 * The Inbox candidate "today" (components/unit-inbox/today/): the sidebar's
 * top is exactly Home's Today, one card per line, each drawn as the topic
 * its line leads with, and every other topic on exactly one shelf.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { nowFor, restShelves, sessionKey } from "../components/unit-inbox/now-inbox.ts";
import type { NowListProps } from "../components/unit-inbox/now-list-props.ts";
import { TodayList } from "../components/unit-inbox/today/today-list.tsx";
import { steadyTop, itemKey, todayTop, type NowItem } from "../components/unit-inbox/today/today-top.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import type { ChatListItem, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { CHATS, chat, COURSES, LINALG, map, PROB, TODAY, topic } from "./fixtures/now-demo.ts";

function topOf(courses: readonly StudyCourse[], chats = CHATS, scope: string | null = null) {
	const inbox = buildInbox(courses, chats, scope);
	const needs = nowFor(courses, chats, scope, TODAY);
	return { inbox, needs, top: todayTop(needs, inbox, chats) };
}

/** Linear Algebra on a quiet day: nothing due, its current topic not
 *  started yet. */
const QUIET_LA: StudyCourse = { ...LINALG, due: [], map: { ...LINALG.map, current: "diag" as TopicHandle } };
/** A course with nothing to take up: no review, no task, no current topic. */
const EMPTY: StudyCourse = { map: map({ workspace: "/s/empty", title: "Empty", topics: [topic("a", "A", "assisted")] }), unready: null, due: [], lastActiveDaysAgo: null, newToday: [] };

describe("todayTop", () => {
	it("is Today's lines in order, each with a lead topic or a waiting session", () => {
		const { needs, top } = topOf(COURSES);
		assert.deepEqual(
			top.map((i) => i.line.key),
			needs.lines.map((l) => l.key),
		);
		assert.deepEqual(
			top.map((i) => (i.kind === "topic" ? i.unit.topic.title : i.chat.title)),
			["Eigenvalues and eigenvectors", "Rank and the column space", "Random variables and distributions", "Linear independence"],
		);
		assert.ok(top.length <= 5);
	});

	it("lists a lead not started yet as its topic, resting on Learning", () => {
		const { inbox, top } = topOf([QUIET_LA], []);
		assert.equal(top.length, 1);
		const item = top[0];
		assert.ok(item?.kind === "topic");
		assert.deepEqual([item.unit.key, item.unit.shelf, item.line.slot], ["/s/linalg#diag", "learning", "Next up"]);
		assert.ok(![...inbox.active, ...inbox.known].some((u) => u.key === item.unit.key), "not on the inbox's own list");
	});

	it("skips a course line with nothing to take up", () => {
		const { needs, top } = topOf([EMPTY, PROB], []);
		assert.deepEqual(
			needs.lines.map((l) => l.key),
			["/s/prob", "/s/empty"],
		);
		assert.deepEqual(
			top.map((i) => i.line.key),
			["/s/prob"],
		);
	});

	it("draws a waiting session with no topic on its course's map as its own card", () => {
		const loose = chat("loose", { title: "A general question", pendingQuestion: true, updatedAt: "2026-11-08T07:00:00.000Z" });
		const { top } = topOf([PROB], [loose]);
		assert.deepEqual(
			top.map((i) => [i.kind, itemKey(i)]),
			[
				["session", sessionKey("loose")],
				["topic", "/s/prob#rv"],
			],
		);
	});

	it("keeps only the chosen course's lines under the course filter", () => {
		assert.deepEqual(
			topOf(COURSES, CHATS, "/s/linalg").top.map((i) => itemKey(i)),
			["/s/linalg#eigen", "/s/linalg#rank", "/s/linalg#independence"],
		);
		assert.deepEqual(
			topOf(COURSES, CHATS, "/s/calc").top.map((i) => itemKey(i)),
			["/s/calc#chain"],
		);
	});

	it("lists a topic two lines lead with once, at the first", () => {
		const twice = [chat("a", { course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["rank"], pendingQuestion: true, updatedAt: "2026-11-08T09:00:00.000Z" }), chat("b", { course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["rank"], pendingProblem: true, updatedAt: "2026-11-08T08:00:00.000Z" })];
		const { needs, top } = topOf([LINALG], twice);
		assert.equal(needs.lines.length, 3);
		assert.deepEqual(
			top.map((i) => [i.line.key, itemKey(i)]),
			[
				["a", "/s/linalg#rank"],
				["/s/linalg", "/s/linalg#independence"],
			],
		);
	});

	it("puts every listed topic and every session on the top or on exactly one shelf", () => {
		const { inbox, top } = topOf(COURSES);
		const shelves = restShelves(inbox, new Set(top.map(itemKey)));
		const units = [...top.flatMap((i) => (i.kind === "topic" ? [i.unit.key] : [])), ...[...shelves.learning, ...shelves.working, ...shelves.known].map((u) => u.key)];
		assert.equal(new Set(units).size, units.length, "no topic twice");
		for (const u of [...inbox.active, ...inbox.working, ...inbox.known]) assert.ok(units.includes(u.key), `${u.key} placed`);
		const shown = new Set([...top, ...[...shelves.learning, ...shelves.working, ...shelves.known].map((u) => ({ kind: "topic" as const, unit: u }))].flatMap((i) => (i.kind === "topic" ? i.unit.sessions.map((c) => c.id) : [i.chat.id])));
		for (const c of shelves.other) shown.add(c.id);
		for (const c of CHATS) assert.ok(shown.has(c.id), `${c.id} reachable`);
	});

	it("draws the engine-down list as the waiting sessions' own cards", () => {
		const { top } = topOf([], CHATS);
		assert.deepEqual(
			top.map((i) => [i.kind, i.line.slot]),
			[
				["session", "Your turn"],
				["session", "Your turn"],
			],
		);
	});
});

/** The sessions with one of them as the tutor writes in it, then as it
 *  waits on him again, answered at `at`. */
const writing = (chats: readonly ChatListItem[], id: string) => chats.map((c) => (c.id === id ? { ...c, pendingQuestion: false, pendingProblem: false, busy: true } : c));
const answered = (chats: readonly ChatListItem[], id: string, at: string) => chats.map((c) => (c.id === id ? { ...c, busy: false, pendingQuestion: true, updatedAt: at } : c));
const keysOf = (top: readonly NowItem[]) => top.map(itemKey);

describe("steadyTop", () => {
	/** The top as drawn across renders: each render holds the last one. */
	function turn(courses: readonly StudyCourse[], before: readonly NowItem[], chats: readonly ChatListItem[]) {
		const { inbox, top } = topOf(courses, chats);
		return steadyTop(before, top, inbox, chats);
	}

	it("keeps the lesson he is in at its place, as Working, while the tutor writes, so a turn changes neither order nor count", () => {
		const { top } = topOf(COURSES);
		for (const id of ["chat_eigen", "chat_rank"]) {
			const during = turn(COURSES, top, writing(CHATS, id));
			assert.deepEqual(keysOf(during), keysOf(top), `${id} while the tutor writes`);
			const card = during.find((i) => i.line.key === id);
			assert.ok(card?.kind === "topic" && card.unit.now === "working", "drawn as Working");
		}
		for (const id of ["chat_eigen", "chat_rank"]) {
			const during = turn(COURSES, top, writing(CHATS, id));
			const after = turn(COURSES, during, answered(CHATS, id, "2026-11-08T10:00:00.000Z"));
			assert.deepEqual(keysOf(after), keysOf(top), `${id} back on his turn, where it was`);
			assert.deepEqual(keysOf(turn(COURSES, after, answered(CHATS, id, "2026-11-08T10:00:00.000Z"))), keysOf(top), "and it stays there");
		}
	});

	it("brings a new waiting session in where Today puts it, and is Today's order on a fresh draw", () => {
		const { top } = topOf(COURSES);
		const woke = [...CHATS, chat("wake", { title: "Bayes check-in", course: { workspace: "/s/prob", title: "Probability" }, topics: ["bayes"], pendingQuestion: true, updatedAt: "2026-11-08T11:00:00.000Z" })];
		const next = turn(COURSES, top, woke);
		assert.deepEqual(keysOf(next), keysOf(topOf(COURSES, woke).top));
		const rankFirst = answered(CHATS, "chat_rank", "2026-11-08T10:00:00.000Z");
		assert.deepEqual(keysOf(turn(COURSES, [], rankFirst)).slice(0, 2), ["/s/linalg#rank", "/s/linalg#eigen"]);
	});

	it("keeps a course's due review on its own line beside a kept session on another topic, as Today does", () => {
		const alone = CHATS.filter((c) => c.id !== "chat_rank");
		const { top } = topOf(COURSES, alone);
		assert.equal(itemKey(top[0]!), "/s/linalg#eigen");
		assert.ok(top.some((i) => i.line.key === "/s/linalg"), "the eigen lesson does not hide Linear Algebra's review");
		const during = turn(COURSES, top, writing(alone, "chat_eigen"));
		assert.deepEqual(keysOf(during), keysOf(top));
	});

	it("keeps a running session card as itself, and lets a card go once its session stops", () => {
		const loose = chat("loose", { title: "A general question", pendingQuestion: true, updatedAt: "2026-11-08T07:00:00.000Z" });
		const { top } = topOf([PROB], [loose]);
		const during = turn([PROB], top, writing([loose], "loose"));
		assert.deepEqual(
			during.map((i) => [i.kind, itemKey(i)]),
			top.map((i) => [i.kind, itemKey(i)]),
		);
		assert.ok(during[0]?.kind === "session" && during[0].chat.busy);
		const done = turn([PROB], during, [{ ...loose, pendingQuestion: false }]);
		assert.deepEqual(keysOf(done), ["/s/prob#rv"]);
	});

	it("holds nothing on a first draw", () => {
		const { inbox, top } = topOf(COURSES, writing(CHATS, "chat_eigen"));
		assert.deepEqual(keysOf(steadyTop([], top, inbox, writing(CHATS, "chat_eigen"))), keysOf(top));
	});
});

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const FOLDED = { working: true, learning: true, known: true, other: true };

function renderList(over: Partial<NowListProps> = {}, courses: readonly StudyCourse[] = COURSES, chats = CHATS) {
	const props: NowListProps = {
		needs: needsYouNow(courses, chats, TODAY),
		inbox: buildInbox(courses, chats, null),
		courses,
		unreadable: [],
		chats,
		today: TODAY,
		unavailable: false,
		folded: FOLDED,
		fold() {},
		pathname: "/",
		s: {} as NowListProps["s"],
		...over,
	};
	const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, React.createElement(TodayList, props)));
	return parseHTML(`<html><body><ul>${html}</ul></body></html>`).document;
}

describe("TodayList", () => {
	it("draws the demo's four cards with Home's reasons in order, then the folded shelves", () => {
		const doc = renderList();
		const cards = [...doc.querySelectorAll('[data-slot="unit-card"]')];
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-testid="unit-row"] > span:last-child')?.textContent),
			["Eigenvalues and eigenvectors", "Rank and the column space", "Random variables and distributions", "Linear independence"],
		);
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-slot="why-mark"]')?.textContent?.replace(", ", "")),
			["Your turn", "Your turn", "3d overdue", "4d overdue"],
		);
		assert.deepEqual(
			[...doc.querySelectorAll('[data-slot="unit-section-header"]')].map((h) => h.textContent),
			["Learning, your turn", "On your own", "Other sessions"],
		);
		assert.ok(doc.querySelector('[data-slot="unit-shelf-attention"]'), "Learning's dot: a session from before yesterday waits");
		assert.equal(doc.querySelector('[data-slot="unit-slim"]'), null, "every shelf folded");
		assert.equal(doc.querySelector('[data-slot="sidebar-note"]'), null);
	});

	it("marks the open topic's card", () => {
		const doc = renderList({ pathname: "/chat/chat_rank" });
		const open = [...doc.querySelectorAll('[aria-current="page"]')].map((a) => a.getAttribute("data-sidebar-row"));
		assert.deepEqual(open, ["/s/linalg#rank"]);
	});

	it("says what it can when nothing needs him, there are no courses, or the engine is down", () => {
		const quiet = renderList({}, [EMPTY], []);
		assert.equal(quiet.querySelector('[data-slot="sidebar-note"]')?.textContent, "Nothing needs you today");
		const none = renderList({}, [], []);
		assert.equal(none.querySelector('[data-slot="sidebar-note"]')?.textContent, "No courses yet");
		const down = renderList({ unavailable: true }, [], CHATS);
		assert.equal(down.querySelectorAll('[data-slot="unit-card"]').length, 2);
		assert.equal(down.querySelector('[data-slot="sidebar-note"]')?.textContent, "Couldn’t read your courses");
		// A session waiting since before yesterday lights Other's dot.
		assert.match(down.querySelector('[data-slot="unit-section-header"]')?.textContent ?? "", /^Other sessions, your turn$/);
	});

	it("keeps a course whose record can't be read as a card under Today's, named, that opens its course page", () => {
		const broken = { workspace: "/s/analysis", title: "Real Analysis", problem: "damaged" as const };
		const doc = renderList({ unreadable: [broken] });
		const card = [...doc.querySelectorAll('[data-slot="unit-card"]')].at(-1)!;
		assert.equal(card.querySelector('[data-testid="unit-row"] > span:first-child')?.textContent, "RAReal Analysis");
		assert.equal(card.querySelector('[data-testid="unit-row"] > span:last-child')?.textContent, "Couldn't read this course's record");
		assert.match(card.querySelector("a")?.getAttribute("href") ?? "", /^\/unit\//);
		const alone = renderList({ unreadable: [broken] }, [], []);
		assert.equal(alone.querySelectorAll('[data-slot="unit-card"]').length, 1);
		assert.equal(alone.querySelector('[data-slot="sidebar-note"]'), null, "not No courses yet");
	});
});
