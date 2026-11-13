/**
 * The Inbox candidate "topics" (components/unit-inbox/topics/): Home's
 * Today at topic grain. Each line's lead is a card; a course line's other
 * topics follow it as quiet companion rows, each with its own reason as an
 * icon and its words in a tooltip, at most two and then a tail, and every topic sits on the top or on one shelf.
 * Same classic-JSX shim as the other render tests, with createElement so
 * the file stays .ts.
 */
import React, { createElement } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import { needsYouNow, type NeedsYou } from "../components/study-home/needs-you.ts";
import { restShelves, sessionKey } from "../components/unit-inbox/now-inbox.ts";
import type { NowListProps } from "../components/unit-inbox/now-list-props.ts";
import { TopicsList } from "../components/unit-inbox/topics/topics-list.tsx";
import { companionSays, topicsTop, topicWords, topKeys, type Companion, type NowItem } from "../components/unit-inbox/topics/topics-top.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { ANALYSIS, CALCULUS, CHATS, chat, due, LINALG, map, PROB, TODAY, topic } from "./fixtures/now-demo.ts";

const h = (...handles: string[]) => handles as TopicHandle[];
const lapsed = { gap: null, lapsed: true, stale: false, choiceErrors: {}, confidentErrors: 0 };

/** The demo's Probability: Law of total probability weak on a diagnosed
 *  mistake, as the seeded world has it. */
const DEMO_PROB: StudyCourse = {
	...PROB,
	map: { ...PROB.map, topics: PROB.map.topics.map((t) => (t.handle === "total" ? { ...t, signals: { ...t.signals, gap: "Forgets to weight each case" } } : t)) },
};
/** The demo's Calculus I: four planned reviews, Riemann sums missed last
 *  time too (after Chain rule on the map, as in the seeded world), so
 *  three companions follow Chain rule. */
const byHandle = new Map(CALCULUS.map.topics.map((t) => [t.handle as string, t]));
const DEMO_CALC: StudyCourse = {
	...CALCULUS,
	map: {
		...CALCULUS.map,
		topics: [
			byHandle.get("limits")!,
			byHandle.get("chain")!,
			{ ...byHandle.get("riemann")!, weak: true, signals: lapsed },
			byHandle.get("improper")!,
			topic("area", "Area between curves", "assisted", { review: due(1) }),
		],
	},
	due: h("chain", "riemann", "improper", "area"),
};
const DEMO: readonly StudyCourse[] = [LINALG, DEMO_PROB, ANALYSIS, DEMO_CALC];

/** A course whose plan takes up five topics: the lead and four more. */
const FIVE: StudyCourse = {
	map: map({
		workspace: "/s/five",
		title: "Five",
		topics: ["a", "b", "c", "d", "e"].map((x, i) => topic(x, `Topic ${x.toUpperCase()}`, "independent", { review: due(5 - i) })),
	}),
	unready: null,
	due: h("a", "b", "c", "d", "e"),
	lastActiveDaysAgo: 1,
};

function topOf(courses: readonly StudyCourse[], chats: readonly ChatListItem[] = CHATS) {
	const inbox = buildInbox(courses, chats, null);
	const needs = needsYouNow(courses, chats, TODAY);
	return { inbox, needs, items: topicsTop(needs, inbox, chats) };
}

/** An item as one line: its kind, its title, and its words. */
function said(item: NowItem): string {
	switch (item.kind) {
		case "topic":
			return `card ${item.unit.topic.title}: ${item.line.slot}`;
		case "session":
			return `session ${item.chat.title}: ${item.line.slot}`;
		case "companion":
			return `  ${item.unit.topic.title}: ${companionSays(item.words)}`;
		case "more":
			return `  Show ${item.rest.length} more`;
	}
}

const companionsOf = (items: readonly NowItem[]) => items.filter((i): i is Companion => i.kind === "companion");

describe("topicsTop", () => {
	it("follows each lead with the line's other topics in the plan's order", () => {
		const { items } = topOf([DEMO_PROB], []);
		assert.deepEqual(items.map(said), ["card Random variables and distributions: 3d overdue", "  Law of total probability: A mistake to fix", "  Bayes' rule: Overdue by a day"]);
		assert.ok(companionsOf(items).every((c) => c.parent === "/s/prob#rv"));
	});

	it("shows at most two companions, then a tail with the rest", () => {
		const { items } = topOf([FIVE], []);
		assert.deepEqual(items.map(said), ["card Topic A: 5d overdue", "  Topic B: Overdue by 4 days", "  Topic C: Overdue by 3 days", "  Show 2 more"]);
		const tail = items[3]!;
		assert.equal(tail.kind, "more");
		if (tail.kind !== "more") return;
		assert.deepEqual(
			tail.rest.map((c) => c.unit.topic.title),
			["Topic D", "Topic E"],
		);
		assert.equal(tail.parent, "/s/five#a");
	});

	it("never hides exactly one: three companions all show", () => {
		const { items } = topOf([DEMO_CALC], []);
		assert.deepEqual(items.map(said), ["card Chain rule: Missed last time", "  Riemann sums: Missed last time", "  Improper integrals: Overdue by 3 days", "  Area between curves: Overdue by a day"]);
	});

	it("gives a waiting session's line no companions", () => {
		const both = chat("both", { title: "Rank and det", course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["rank", "det"], pendingQuestion: true, updatedAt: "2026-11-08T09:00:00.000Z" });
		const { needs, items } = topOf([LINALG], [both]);
		assert.equal(needs.lines[0]!.topics.length, 2, "the session takes up two topics");
		assert.deepEqual(items.map(said), ["card Rank and the column space: Your turn"]);
	});

	it("lists each topic once, the first occurrence winning", () => {
		const la = { workspace: "/s/linalg", title: "Linear Algebra" };
		const onRank = chat("on-rank", { title: "Rank practice", course: la, topics: ["rank"], pendingProblem: true, updatedAt: "2026-11-08T09:00:00.000Z" });
		const review: StudyCourse = { ...LINALG, due: h("independence", "rank", "det") };
		// A session line on Rank, then (as Home would draw it for another
		// day) Linear Algebra's review taking Rank up again.
		const first = needsYouNow([LINALG], [onRank], TODAY).lines;
		const second = needsYouNow([review], [], TODAY).lines;
		const needs: NeedsYou = { rows: [], lines: [...first, ...second], also: [] };
		const items = topicsTop(needs, buildInbox([review], [onRank], null), [onRank]);
		// Determinants is planned but neither due nor weak: no reason of its
		// own, so it stays on its shelf rather than borrow the line's.
		assert.deepEqual(items.map(said), ["card Rank and the column space: Your turn", "card Linear independence: 4d overdue"]);
		const keys = items.flatMap((i) => (i.kind === "topic" || i.kind === "companion" ? [i.unit.key] : []));
		assert.equal(new Set(keys).size, keys.length, "no topic twice");
		assert.equal(keys.filter((k) => k === "/s/linalg#rank").length, 1);
	});

	it("puts every listed topic and every session on the top or on exactly one shelf", () => {
		for (const courses of [DEMO, [FIVE, ...DEMO]]) {
			const { inbox, items } = topOf(courses);
			const onTop = topKeys(items);
			const shelves = restShelves(inbox, onTop);
			const topUnits = items.flatMap((i) => (i.kind === "more" ? i.rest.map((c) => c.unit.key) : i.kind === "session" ? [] : [i.unit.key]));
			const placed = [...topUnits, ...[...shelves.learning, ...shelves.working, ...shelves.known].map((u) => u.key)];
			assert.equal(new Set(placed).size, placed.length, "no topic twice");
			for (const u of [...inbox.active, ...inbox.working, ...inbox.known]) assert.ok(placed.includes(u.key), `${u.key} placed`);
			for (const c of shelves.other) assert.ok(!onTop.has(sessionKey(c.id)));
		}
	});

	it("gives a task line's companions the task's step when they have no reason of their own", () => {
		const held = (x: string, title: string) => topic(x, title, "attempted", { tasks: ["sheet"] });
		const course: StudyCourse = {
			map: map({ workspace: "/s/t", title: "Tasks", focus: "sheet", tasks: [{ key: "sheet", title: "Problem sheet 4", step: "Part (c): show dim ker A = 2" }], topics: [held("x", "Kernel"), held("y", "Rank")] }),
			unready: null,
			due: [],
			lastActiveDaysAgo: 1,
		};
		const { items } = topOf([course], []);
		assert.deepEqual(items.map(said), ["card Kernel: At part (c)", "  Rank: At part (c)"]);
		const companion = companionsOf(items)[0]!;
		assert.equal(companion.words.kind, "task");
	});
});

describe("topicWords", () => {
	const titleOf = (handle: TopicHandle) => ({ cramer: "Cramer's rule" })[handle as string] ?? handle;
	const t = (over: Partial<CourseMapTopic>) => topic("x", "X", "independent", over);
	const short = (w: ReturnType<typeof topicWords>) => (w === null ? null : w.kind === "working" ? "Working" : `${w.kind} ${w.short}`);

	it("puts a waiting turn first, then the tutor writing, then a slip, then how overdue", () => {
		const weakDue = t({ weak: true, review: due(3), signals: lapsed });
		assert.equal(short(topicWords(weakDue, "your-turn", titleOf)), "reply Your turn");
		assert.equal(short(topicWords(weakDue, "working", titleOf)), "Working");
		assert.equal(short(topicWords(weakDue, null, titleOf)), "missed Missed");
		assert.equal(short(topicWords(t({ review: due(3) }), null, titleOf)), "review 3d overdue");
		assert.equal(short(topicWords(t({}), null, titleOf)), null);
	});

	it("says each slip in the map's words", () => {
		const says = (signals: Partial<CourseMapTopic["signals"]>) => {
			const w = topicWords(t({ weak: true, signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, ...signals } }), null, titleOf);
			return w === null ? null : companionSays(w);
		};
		assert.equal(says({ lapsed: true }), "Missed last time");
		assert.equal(says({ gap: "Counts entries" }), "A mistake to fix");
		assert.equal(says({ choiceErrors: { cramer: 1 } }), "Mixed up with Cramer's rule");
		assert.equal(says({ confidentErrors: 2 }), "Sure, but wrong");
		assert.equal(companionSays({ kind: "working" }), "Working");
	});

	it("keeps the map's few words as the short form", () => {
		const slip = (signals: Partial<CourseMapTopic["signals"]>) => short(topicWords(t({ weak: true, signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, ...signals } }), null, titleOf));
		assert.equal(slip({ lapsed: true }), "missed Missed");
		assert.equal(slip({ gap: "Counts entries" }), "missed Mistake to fix");
		assert.equal(slip({ choiceErrors: { cramer: 1 } }), "missed Mixed up");
		assert.equal(slip({ confidentErrors: 2 }), "missed Sure, but wrong");
	});

	it("says a review in Home's words, whatever the level", () => {
		for (const overdue of [0, 1, 3, 7, 15]) {
			for (const level of ["assisted", "independent"] as const) {
				const x = topic("x", "X", level, { review: due(overdue) });
				const course: StudyCourse = { map: map({ topics: [x] }), unready: null, due: h("x"), lastActiveDaysAgo: 1 };
				const home = whyOf({ kind: "course", course, step: { kind: "review", titles: ["X"], topics: h("x"), then: null } }, TODAY);
				const words = topicWords(x, null, titleOf);
				assert.ok(words && words.kind === "review");
				assert.equal(words.short, home?.short);
			}
		}
	});
});

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };

function renderList(courses: readonly StudyCourse[], chats: readonly ChatListItem[] = CHATS, unavailable = false) {
	const props: NowListProps = {
		needs: needsYouNow(courses, chats, TODAY),
		inbox: buildInbox(courses, chats, null),
		courses,
		chats,
		today: TODAY,
		unavailable,
		folded: { working: true, learning: true, known: true, other: true },
		fold() {},
		pathname: "/",
		s: {} as NowListProps["s"],
	};
	const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router as never }, createElement(TopicsList, props)));
	return parseHTML(`<html><body><ul>${html}</ul></body></html>`).document;
}

describe("TopicsList", () => {
	it("draws the demo's five cards and six companions with their titles and reasons, in order", () => {
		const doc = renderList(DEMO);
		const rows = [...doc.querySelectorAll('[data-slot="unit-card"], [data-slot="companion"]')].map((row) => {
			if (row.getAttribute("data-slot") === "unit-card") {
				const title = row.querySelector('[data-testid="unit-row"] > span:last-child')?.textContent;
				return `card ${title}: ${row.querySelector('[data-slot="why-mark"]')?.textContent?.replace(", ", "")}`;
			}
			const why = row.querySelector('[data-slot="companion-why"]')!;
			return `  ${row.querySelector('[data-slot="companion-title"]')?.textContent} (${why.querySelector("svg")?.getAttribute("data-kind")}): ${why.textContent?.replace(", ", "")}`;
		});
		assert.deepEqual(rows, [
			"card Eigenvalues and eigenvectors: Your turn",
			"card Rank and the column space: Your turn",
			"card Random variables and distributions: 3d overdue",
			"  Law of total probability (missed): A mistake to fix",
			"  Bayes' rule (review): Overdue by a day",
			"card Convergent sequences: 1w overdue",
			"  Cauchy sequences (review): Overdue by a week",
			"card Chain rule: Missed last time",
			"  Riemann sums (missed): Missed last time",
			"  Improper integrals (review): Overdue by 3 days",
			"  Area between curves (review): Overdue by a day",
		]);
	});

	it("draws a companion as a link to its topic's page with its card as the way back, no course mark and no action", () => {
		const doc = renderList([DEMO_PROB], []);
		const bayes = [...doc.querySelectorAll('[data-slot="companion"]')].find((r) => r.textContent?.includes("Bayes"))!;
		const link = bayes.querySelector('[data-testid="unit-row"]')!;
		assert.equal(link.getAttribute("href")?.startsWith("/unit/"), true, "a click opens the topic's page");
		assert.equal(link.getAttribute("data-sidebar-parent"), "/s/prob#rv");
		assert.equal(bayes.querySelector('[data-slot="course-mark"]'), null, "the card above names the course");
		assert.equal(bayes.querySelector('[data-slot="row-action"]'), null, "the card's action is the one way in");
		assert.equal(doc.querySelectorAll('[data-slot="row-action"]').length, 1, "only the card has an action");
	});

	it("ends a long line in a tail that names how many more, and keeps those off the shelves", () => {
		const doc = renderList([FIVE], []);
		const tail = doc.querySelector('[data-slot="companion-more"] button')!;
		assert.equal(tail.textContent, "Show 2 more");
		assert.equal(tail.getAttribute("aria-expanded"), "false");
		assert.equal(tail.getAttribute("data-sidebar-parent"), "/s/five#a");
		assert.equal(doc.querySelectorAll('[data-slot="companion"]').length, 2);
		assert.equal(doc.querySelector('[data-slot="unit-shelf"]'), null, "D and E are on top, behind the tail, not on a shelf");
	});

	it("says when nothing needs him, when there are no courses, and when they could not be read", () => {
		const quiet: StudyCourse = { map: map({ workspace: "/s/q", title: "Quiet", topics: [topic("a", "A", "independent")] }), unready: null, due: [], lastActiveDaysAgo: 1 };
		assert.equal(renderList([quiet], []).querySelector('[data-slot="sidebar-note"]')?.textContent, "Nothing needs you today");
		assert.equal(renderList([], []).querySelector('[data-slot="sidebar-note"]')?.textContent, "No courses yet");
		const down = renderList([], CHATS, true);
		assert.equal(down.querySelector('[data-slot="sidebar-note"]')?.textContent, "Couldn’t read your courses");
		assert.equal(down.querySelectorAll('[data-slot="unit-card"]').length, 2, "the two waiting sessions, as their own cards");
	});
});
