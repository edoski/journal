/**
 * One topic, one fact: every Linear Algebra topic of the seeded demo's
 * shape, as the sidebar says it, as the course page's list says it, and
 * as its map card says it, printed side by side and held equal. Same tsx
 * classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, StudyCourse } from "../src/core/index.ts";
import { courseGroups } from "../components/course-page/course-model.ts";
import { TopicMap } from "../components/course-map/topic-map/topic-map.tsx";
import { standingOf } from "../components/course-map/topic-map/topic-standing.ts";
import { buildInbox, type Unit } from "../components/unit-inbox/units.ts";
import { sidebarSays } from "../components/unit-inbox/sidebar-says.ts";
import { nowFor, plannedKeys, restShelves, shelfStatus } from "../components/unit-inbox/now-inbox.ts";
import { claimedKeys, todayTop } from "../components/unit-inbox/today/today-top.ts";
import { CHATS, COURSES, LINALG } from "./fixtures/now-demo.ts";

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;

/** What the sidebar shows for each listed topic: Today's card with its reason, else its shelf row's status. */
function sidebarWords(courses: readonly StudyCourse[], chats: readonly ChatListItem[]): Map<string, { words: string; when: boolean }> {
	const inbox = buildInbox(courses, chats, null);
	const top = todayTop(nowFor(courses, chats, null, courses[0]!.map.today), inbox, chats);
	const said = new Map<string, { words: string; when: boolean }>();
	for (const item of top) for (const key of claimedKeys(item)) if (!said.has(key) && item.line.slot) said.set(key, { words: item.line.slot, when: false });
	const shelves = restShelves(inbox, new Set(said.keys()));
	for (const u of [...shelves.working, ...shelves.learning, ...shelves.known]) {
		const status = shelfStatus(u as Unit, inbox.today, plannedKeys(courses));
		const words = status.kind === "your-turn" ? "Your turn" : status.kind === "working" ? "Tutor writing" : ("words" in status ? status.words : undefined) ?? "";
		said.set(u.key, { words, when: status.kind === "returns" || status.kind === "studied" });
	}
	return said;
}

/** The line under each map card's title, by topic. */
function cardLines(course: StudyCourse, chats: readonly ChatListItem[], courses: readonly StudyCourse[]): Map<string, string> {
	const document = render(<TopicMap map={course.map} said={sidebarSays(courses, chats, course.map.workspace)} />) as unknown as Document;
	return new Map(
		course.map.topics.map((t) => {
			const node = document.querySelector(`[data-testid="map-node-${t.handle}"]`)!;
			const line = node.querySelector('[data-slot="topic-need"], [data-slot="topic-standing"]')!;
			return [t.handle, line.textContent ?? ""];
		}),
	);
}

describe("every Linear Algebra topic says one thing on the sidebar, the course page and its map card", () => {
	const course = LINALG;
	const ws = course.map.workspace;
	const sidebar = sidebarWords(COURSES, CHATS);
	const page = new Map(courseGroups(course, CHATS, COURSES).flatMap((g) => g.topics.map((t) => [t.topic.handle, t.fact] as const)));
	const cards = cardLines(course, CHATS, COURSES);
	const rows = course.map.topics.map((t) => {
		const side = sidebar.get(`${ws}#${t.handle}`) ?? null;
		const fact = page.get(t.handle) ?? null;
		return { topic: t, sidebar: side?.words ?? "", page: fact?.kind === "here" ? "" : (fact?.words ?? ""), card: cards.get(t.handle) ?? "", when: side?.when ?? false };
	});
	console.log(["topic | sidebar | course page | map card", ...rows.map((r) => `${r.topic.title} | ${r.sidebar || "-"} | ${r.page || "-"} | ${r.card}`)].join("\n"));

	it("the course page's list says the sidebar's words", () => {
		for (const r of rows) assert.equal(r.page, r.sidebar, r.topic.title);
	});

	it("a card says the sidebar's words when they need him, else where he stands", () => {
		for (const r of rows) assert.equal(r.card, r.sidebar && !r.when ? r.sidebar : standingOf(r.topic).words, r.topic.title);
	});

	it("Rank, whose session waits on him, says Your turn everywhere", () => {
		const rank = rows.find((r) => r.topic.handle === "rank")!;
		assert.deepEqual([rank.sidebar, rank.page, rank.card], ["Your turn", "Your turn", "Your turn"]);
	});
});
