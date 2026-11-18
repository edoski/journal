/**
 * The Inbox candidate "today" (components/unit-inbox/today/): the sidebar's
 * top is exactly Home's Today, one card per line, a session's line as the
 * session under its one title and a course's line as the topic it leads
 * with, every other topic in exactly one group, and every session not on
 * top as its own card under Sessions.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { lessonTitle } from "../components/study-home/agenda-rows/row-facts.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { nowFor, restSessions, restTopics, sessionKey } from "../components/unit-inbox/now-inbox.ts";
import type { NowListProps } from "../components/unit-inbox/now-list-props.ts";
import { TodayList } from "../components/unit-inbox/today/today-list.tsx";
import { claimedKeys, steadyTop, itemKey, todayTop, type NowItem } from "../components/unit-inbox/today/today-top.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import { sessionState } from "../components/nav/session-state.ts";
import type { ChatListItem, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { CHATS, chat, COURSES, LINALG, map, PROB, TODAY, topic } from "./fixtures/now-demo.ts";

function topOf(courses: readonly StudyCourse[], chats = CHATS, scope: string | null = null) {
	const inbox = buildInbox(courses, chats, scope);
	const needs = nowFor(courses, chats, scope, TODAY);
	return { inbox, needs, top: todayTop(needs, inbox, chats) };
}

/** Linear Algebra on a quiet day: nothing due, today's plan starting its
 *  current topic, not started yet. */
const QUIET_LA: StudyCourse = { ...LINALG, due: [], newToday: ["diag" as TopicHandle], map: { ...LINALG.map, current: "diag" as TopicHandle } };
/** A course with nothing to take up: no review, no task, no current topic. */
const EMPTY: StudyCourse = { map: map({ workspace: "/s/empty", title: "Empty", topics: [topic("a", "A", "assisted")] }), unready: null, due: [], lastActiveDaysAgo: null, newToday: [] };

describe("todayTop", () => {
	it("is Today's lines in order, each session under its own title and each course line as its lead topic", () => {
		const { needs, top } = topOf(COURSES);
		assert.deepEqual(
			top.map((i) => i.line.key),
			needs.lines.map((l) => l.key),
		);
		assert.deepEqual(
			top.map((i) => (i.kind === "topic" ? i.unit.topic.title : i.line.title)),
			["Random variables and distributions", "Linear independence", "Convergent sequences", "Chain rule", "Continue Eigenvalues lesson"],
			"each course's review first, then the lesson he is in today, the other sessions waiting on him folded after it (round 10, 1 m2; round 11, 3 n5)",
		);
		assert.ok(top.length <= 5);
	});

	it("draws a course line with no topic to lead with (a task that holds none) as its course's card", () => {
		const sheet: StudyCourse = {
			map: map({ workspace: "/s/exam", title: "Exam prep", tasks: [{ key: "paper", title: "Past paper 2024", step: "Question 3", updated: TODAY }], focus: "paper" }),
			unready: null,
			due: [],
			lastActiveDaysAgo: 0,
			newToday: [],
		};
		const { needs, top } = topOf([sheet, PROB], []);
		assert.deepEqual(
			top.map((i) => i.line.key),
			needs.lines.map((l) => l.key),
			"every line Home draws has its card",
		);
		assert.deepEqual(
			top.map((i) => [i.kind, itemKey(i)]),
			[
				["topic", "/s/prob#rv"],
				["course", "course:/s/exam"],
			],
		);
	});

	it("lists a lead not started yet as its topic, resting on Learning", () => {
		const { inbox, top } = topOf([QUIET_LA], []);
		assert.equal(top.length, 1);
		const item = top[0];
		assert.ok(item?.kind === "topic");
		assert.deepEqual([item.unit.key, item.unit.shelf, item.line.slot], ["/s/linalg#diag", "learning", "Planned today"]);
		assert.ok(![...inbox.active, ...inbox.known].some((u) => u.key === item.unit.key), "not on the inbox's own list");
	});

	it("leaves a course with nothing to take up off Today and the top alike", () => {
		const { needs, top } = topOf([EMPTY, PROB], []);
		assert.deepEqual(
			needs.lines.map((l) => l.key),
			["/s/prob#review:rv,total,bayes"],
		);
		assert.deepEqual(
			top.map((i) => i.line.key),
			["/s/prob#review:rv,total,bayes"],
		);
	});

	it("draws a waiting session with no topic on its course's map as its own card", () => {
		const loose = chat("loose", { title: "A general question", pendingQuestion: true, updatedAt: "2026-11-08T07:00:00.000Z" });
		const { top } = topOf([PROB], [loose]);
		assert.deepEqual(
			top.map((i) => [i.kind, itemKey(i)]),
			[
				["topic", "/s/prob#rv"],
				["session", sessionKey("loose")],
			],
		);
	});

	it("keeps only the chosen course's lines under the course filter", () => {
		assert.deepEqual(
			topOf(COURSES, CHATS, "/s/linalg").top.map((i) => itemKey(i)),
			["/s/linalg#independence", sessionKey("chat_eigen"), sessionKey("chat_rank")],
		);
		assert.deepEqual(
			topOf(COURSES, CHATS, "/s/calc").top.map((i) => itemKey(i)),
			["/s/calc#chain"],
		);
	});

	it("draws two sessions on one topic as two cards, one per session", () => {
		const twice = [chat("a", { course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["rank"], pendingQuestion: true, updatedAt: "2026-11-08T09:00:00.000Z" }), chat("b", { course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["rank"], pendingProblem: true, updatedAt: "2026-11-08T08:00:00.000Z" })];
		const { needs, top } = topOf([LINALG], twice);
		assert.equal(needs.lines.length, 3);
		assert.deepEqual(
			top.map((i) => [i.line.key, itemKey(i)]),
			[
				["/s/linalg#review:independence", "/s/linalg#independence"],
				["a", sessionKey("a")],
				["b", sessionKey("b")],
			],
		);
	});

	it("puts every listed topic on the top or in exactly one group, and every session once: its own card or a Sessions row", () => {
		const { inbox, top } = topOf(COURSES);
		const onTop = new Set(top.flatMap(claimedKeys));
		const rest = restTopics(inbox, onTop);
		const units = [...top.flatMap((i) => claimedKeys(i).filter((k) => k !== sessionKey(i.line.key))), ...[...rest.learning, ...rest.working, ...rest.known].map((u) => u.key)];
		assert.equal(new Set(units).size, units.length, "no topic twice");
		for (const u of [...inbox.active, ...inbox.working, ...inbox.known]) assert.ok(units.includes(u.key), `${u.key} placed`);
		const sessions = [...top.flatMap((i) => (i.kind === "session" ? [i.chat.id] : [])), ...restSessions(CHATS, null, onTop).map((c) => c.id)];
		assert.deepEqual([...sessions].sort(), CHATS.map((c) => c.id).sort(), "every session once");
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

describe("one lesson, one card", () => {
	const la = { workspace: "/s/linalg", title: "Linear Algebra" };
	/** The eigen lesson after its turns took it through prerequisite checks:
	 *  its transcript touched rank, independence, vectors and diag (never
	 *  attempted), and it waits on him. */
	const touring = (touched: readonly string[]) => [chat("tour", { title: "Eigenvalues lesson", course: la, topics: ["eigen", ...touched], ownTopics: ["eigen"], pendingQuestion: true, updatedAt: "2026-11-08T09:30:00.000Z" })];

	it("draws a lesson that touched five topics as one card, under the title Home gives it, at every turn", () => {
		for (const touched of [[], ["rank"], ["rank", "independence"], ["rank", "independence", "vectors", "diag"]]) {
			const chats = touring(touched);
			const { needs, top } = topOf([LINALG], chats);
			const cards = top.filter((i) => i.kind === "session" || i.line.row.kind === "session");
			assert.deepEqual(
				cards.map((i) => [itemKey(i), i.kind === "session" ? i.chat.title : null]),
				[[sessionKey("tour"), "Eigenvalues lesson"]],
				`after touching ${touched.join(", ") || "nothing else"}`,
			);
			assert.equal(needs.lines.find((l) => l.key === "tour")?.lead?.handle, "eigen", "its topic is the one it belongs to, never the step it is on");
		}
	});

	it("says Your turn only on the lesson's own topic, never on a topic it touched or never attempted", () => {
		const chats = touring(["rank", "independence", "diag"]);
		const inbox = buildInbox([LINALG], chats, null);
		const now = Object.fromEntries([...inbox.active, ...inbox.working, ...inbox.known].map((u) => [u.topic.handle, u.now]));
		assert.equal(now.eigen, "your-turn");
		assert.equal(now.rank, null);
		assert.equal(now.independence, null);
		assert.equal("diag" in now ? now.diag : null, null);
		const { top } = topOf([LINALG], chats);
		const shelves = restTopics(inbox, new Set(top.flatMap(claimedKeys)));
		assert.ok(!shelves.learning.some((u) => u.topic.handle === "eigen"), "the lesson's own topic is not a second row");
	});
});

describe("one review, one row", () => {
	it("a review of two topics is its card alone, while the tutor writes and on his turn: neither topic is a second row", () => {
		const review = chat("rev", { title: "Review Rank, Linear independence", course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["rank", "independence"], ownTopics: ["rank", "independence"], pendingProblem: true, updatedAt: "2026-11-08T09:30:00.000Z" });
		for (const chats of [[review], [{ ...review, pendingProblem: false, busy: true }]]) {
			const { inbox, top } = topOf([LINALG], chats);
			const drawn = steadyTop(topOf([LINALG], [review]).top, top, inbox, chats);
			const shelves = restTopics(inbox, new Set(drawn.flatMap(claimedKeys)));
			const rows = [...shelves.learning, ...shelves.working, ...shelves.known].map((u) => u.topic.handle);
			assert.ok(!rows.includes("rank" as TopicHandle) && !rows.includes("independence" as TopicHandle), `no second row (${chats[0]!.busy ? "writing" : "his turn"})`);
		}
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
		const { top } = topOf([LINALG]);
		for (const id of ["chat_eigen", "chat_rank"]) {
			const during = turn([LINALG], top, writing(CHATS, id));
			assert.deepEqual(keysOf(during), keysOf(top), `${id} while the tutor writes`);
			const card = during.find((i) => i.line.key === id);
			assert.ok(card?.kind === "session" && sessionState(card.chat) === "working", "drawn as Working");
		}
		for (const id of ["chat_eigen", "chat_rank"]) {
			const during = turn([LINALG], top, writing(CHATS, id));
			const after = turn([LINALG], during, answered(CHATS, id, "2026-11-08T10:00:00.000Z"));
			assert.deepEqual(keysOf(after), keysOf(top), `${id} back on his turn, where it was`);
			assert.deepEqual(keysOf(turn([LINALG], after, answered(CHATS, id, "2026-11-08T10:00:00.000Z"))), keysOf(top), "and it stays there");
		}
	});

	it("brings a new waiting session in where Today puts it, and is Today's order on a fresh draw", () => {
		const { top } = topOf(COURSES);
		const woke = [...CHATS, chat("wake", { title: "Bayes check-in", course: { workspace: "/s/prob", title: "Probability" }, topics: ["bayes"], pendingQuestion: true, updatedAt: "2026-11-08T11:00:00.000Z" })];
		const next = turn(COURSES, top, woke);
		assert.deepEqual(keysOf(next), keysOf(topOf(COURSES, woke).top));
		const rankFirst = answered(CHATS, "chat_rank", "2026-11-08T10:00:00.000Z");
		const sessions = (top: readonly NowItem[]) => keysOf(top).filter((k) => k.startsWith("chat:"));
		assert.deepEqual(sessions(turn([LINALG], [], rankFirst)), [sessionKey("chat_rank"), sessionKey("chat_eigen")]);
	});

	it("keeps a course's due review on its own line beside a kept session on another topic, as Today does", () => {
		const alone = CHATS.filter((c) => c.id !== "chat_rank");
		const { top } = topOf([LINALG], alone);
		assert.deepEqual(keysOf(top).slice(0, 2), ["/s/linalg#independence", sessionKey("chat_eigen")]);
		assert.ok(top.some((i) => i.line.key.startsWith("/s/linalg#review")), "the eigen lesson does not hide Linear Algebra's review");
		const during = turn([LINALG], top, writing(alone, "chat_eigen"));
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
		const card = during.find((i) => i.kind === "session");
		assert.ok(card?.kind === "session" && card.chat.busy);
		const done = turn([PROB], during, [{ ...loose, pendingQuestion: false }]);
		assert.deepEqual(keysOf(done), ["/s/prob#rv"]);
	});

	it("holds nothing on a first draw", () => {
		const { inbox, top } = topOf(COURSES, writing(CHATS, "chat_eigen"));
		assert.deepEqual(keysOf(steadyTop([], top, inbox, writing(CHATS, "chat_eigen"))), keysOf(top));
	});
});

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const FOLDED = { sessions: true };

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
	it("draws the demo's cards with Home's reasons in order, then the folded Sessions list", () => {
		const doc = renderList();
		const cards = [...doc.querySelectorAll('[data-slot="unit-card"]')];
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-testid="unit-row"] > span:last-child')?.textContent),
			["Review Random variables and distributions, Law of total probability, Bayes' rule", "Review Linear independence", "Review Convergent sequences, Cauchy sequences", "Review Chain rule, Riemann sums, Improper integrals", "Continue Eigenvalues lesson"],
		);
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-testid="unit-row"] > span:last-child')?.textContent),
			needsYouNow(COURSES, CHATS, TODAY).lines.map((l) => lessonTitle(l.row)),
			"each card under the name Home's line gives it",
		);
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-slot="why-mark"]')?.textContent?.replace(", ", "")),
			["Due since 5 Nov", "Due since 4 Nov", "Due since 1 Nov", "Not right last time", "Your turn"],
		);
		assert.deepEqual(
			[...doc.querySelectorAll('[data-slot="unit-section-header"]')].map((h) => h.textContent),
			["Sessions, your turn"],
		);
		assert.ok(doc.querySelector('[data-slot="unit-shelf-attention"]'), "the dot: a session from before yesterday waits");
		assert.ok(doc.querySelector('[data-testid="session-row"]') === null, "Sessions folded");
		assert.ok(doc.querySelector('[data-slot="sidebar-note"]') === null);
	});

	it("never marks a course card open on its course page, which it does not open; the session holding its task does (round 10, 2: the selected row stayed on sheet 4 there, 43a)", () => {
		const exam: StudyCourse = {
			map: map({ workspace: "/s/exam", title: "Exam prep", tasks: [{ key: "paper", title: "Past paper 2024", step: "Question 3", updated: TODAY }], focus: "paper" }),
			unready: null,
			due: [],
			lastActiveDaysAgo: 0,
			newToday: [],
		};
		const open = (pathname: string, chats: readonly ChatListItem[] = []) => [...renderList({ pathname }, [exam], chats).querySelectorAll('[aria-current="page"]')].map((a) => a.getAttribute("data-sidebar-row"));
		assert.deepEqual(open(courseHref("/s/exam")), [], "the course page is not the card's");
		const paper = chat("paper", { title: "Past paper 2024", course: { workspace: "/s/exam", title: "Exam prep" }, tasks: ["paper"], ended: "closed", updatedAt: "2026-11-07T09:00:00.000Z" });
		assert.deepEqual(open("/chat/paper", [paper]), ["course:/s/exam"], "the session that holds its task is");
	});

	it("marks the open session's card", () => {
		const doc = renderList({ pathname: "/chat/chat_rank" }, [LINALG]);
		const open = [...doc.querySelectorAll('[aria-current="page"]')].map((a) => a.getAttribute("data-sidebar-row"));
		assert.deepEqual(open, [sessionKey("chat_rank")]);
	});

	it("says what it can when nothing needs him, there are no courses, or the engine is down", () => {
		const quiet = renderList({}, [EMPTY], []);
		assert.equal(quiet.querySelector('[data-slot="sidebar-note"]')?.textContent, "Nothing needs you today");
		const none = renderList({}, [], []);
		assert.equal(none.querySelector('[data-slot="sidebar-note"]')?.textContent, "No courses yet");
		const down = renderList({ unavailable: true }, [], CHATS);
		assert.equal(down.querySelectorAll('[data-slot="unit-card"]').length, 2);
		assert.equal(down.querySelector('[data-slot="sidebar-note"]')?.textContent, "Couldn’t read your courses");
		// A session waiting since before yesterday lights the dot.
		assert.match(down.querySelector('[data-slot="unit-section-header"]')?.textContent ?? "", /^Sessions, your turn$/);
	});

	it("says a course whose record can't be read as a quiet note under Today's cards, never a card that reads as a session (round 14, 4 free)", () => {
		const broken = { workspace: "/s/analysis", title: "Real Analysis", problem: "damaged" as const };
		const doc = renderList({ unreadable: [broken] });
		const cards = [...doc.querySelectorAll('[data-slot="unit-card"]')];
		assert.equal(cards.some((card) => /record/.test(card.textContent ?? "")), false, "no card for it among the sessions");
		const note = doc.querySelector('[data-slot="unreadable-note"]');
		assert.equal(note?.textContent, "Couldn’t read Real Analysis’s record");
		assert.match(note?.getAttribute("href") ?? "", /^\/unit\//, "it opens its course page, which says why");
		const alone = renderList({ unreadable: [broken] }, [], []);
		assert.equal(alone.querySelectorAll('[data-slot="unit-card"]').length, 0);
		assert.equal([...alone.querySelectorAll('[data-slot="sidebar-note"]')].map((n) => n.textContent).join(" | "), "Couldn’t read Real Analysis’s record", "not No courses yet");
	});
});
