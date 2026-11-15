/**
 * One legend for where he stands (Edo, 15 Nov 2026: "a standard icon set"):
 * each standing, from not started through on his own, slipping and every
 * slip, draws the same pie in the same ink and says the same words on
 * Home's Today row, the topic map's card, the course page's row and the
 * topic page's head; a slip wears the same icon there and on the sidebar,
 * and a review due the same History icon. Same tsx classic-JSX shim as
 * the other render tests. A pie in the warning ink says Slipping, the one
 * word for that state, with the slip beside it (Edo, 15 Nov 2026); on
 * Home's row, where one status fits, the slip takes the words beside the
 * same pie (round 10, 1 m4).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMap, CourseMapTopic, StudyCourse, TopicHandle, TopicSignals } from "../src/core/index.ts";
import { slipBeside, standingOf } from "../components/course-map/topic-map/topic-standing.ts";
import { NodeBody } from "../components/course-map/topic-map/topic-node.tsx";
import { CourseTopicRow } from "../components/course-page/course-topic-row.tsx";
import { TopicHead } from "../components/unit-inbox/topic-page/topic-head.tsx";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { StandingFact } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { WHY_ICON } from "../components/study-home/agenda-rows/why-mark.tsx";
import { FACT_ICON, factIcon } from "../components/unit-inbox/fact-icon.ts";
import { SLIP_ICON } from "../components/slip-icons.ts";
import type { SlipKey } from "../components/study-words.ts";

const QUIET: TopicSignals = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic>): CourseMapTopic => ({ handle: handle as TopicHandle, title: handle, level: "new", introduced: "2026-10-30", review: null, weak: false, signals: QUIET, tasks: [], ...over });

/** Every pie step, the warning ink, and every slip the engine's signals give. */
const TOPICS = [
	topic("not-started", { level: "new", introduced: null }),
	topic("taught", { level: "introduced" }),
	topic("tried", { level: "attempted" }),
	topic("helped", { level: "assisted", right: "helped" }),
	topic("partly", { level: "assisted", right: "partial" }),
	topic("own", { level: "independent" }),
	topic("kept", { level: "retained", review: { kind: "due", date: "2026-11-05", overdue: 3 } }),
	topic("repaired", { level: "independent", weak: true, signals: { ...QUIET, repaired: true } }),
	topic("check", { level: "assisted", right: "helped", weak: true, signals: { ...QUIET, gap: "Pivots" } }),
	topic("lapsed", { level: "retained", weak: true, signals: { ...QUIET, lapsed: true, mistake: true } }),
	topic("gap", { level: "assisted", weak: true, signals: { ...QUIET, gap: "Counts entries, not pivots", mistake: true } }),
	topic("mixed", { level: "independent", weak: true, signals: { ...QUIET, choiceErrors: { "not-started": 2 }, mistake: true } }),
	topic("confident", { level: "independent", weak: true, signals: { ...QUIET, confidentErrors: 1, mistake: true } }),
];
const MAP: CourseMap = { workspace: "/study/linalg", title: "Linear Algebra", today: "2026-11-08", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: TOPICS, edges: [] };
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };
const titleOf = (h: TopicHandle) => MAP.topics.find((t) => t.handle === h)?.title ?? h;

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;

/** A pie as drawn, its size and placement classes aside: its fill, its ink and its shape. */
const pie = (root: ParentNode) =>
	root.querySelector('[data-slot="topic-glyph"]')!.outerHTML.replace(/class="([^"]*)"/, (_, names: string) => `class="${names.split(/\s+/).filter((n) => n && !/^(size-[\d.]+|mt-px)$/.test(n)).join(" ")}"`);
/** A lucide icon's name, from the class lucide gives every icon. */
const icon = (root: ParentNode | null) => root?.querySelector("svg")?.getAttribute("class")?.match(/lucide-[a-z-]+/g)?.find((c) => c !== "lucide-icon") ?? null;
const lucideName = (Icon: (typeof SLIP_ICON)[SlipKey]) => icon(render(<Icon />));

/** What each surface draws for a topic's standing: its pie and its words, and its slip's icon and words. */
function drawn(t: CourseMapTopic) {
	const standing = standingOf(t);
	const slip = slipBeside(t, titleOf);
	const home = render(<StandingFact facts={{ standing, slip }} />);
	const card = render(<NodeBody topic={t} standing={standing} line={null} />);
	const row = render(<ul><CourseTopicRow row={{ topic: t, group: "learning" as never, standing, current: false, fact: null, factWords: null, href: "/" }} /></ul>);
	const head = render(<TopicHead facts={topicFacts({ course: COURSE, topic: t, chats: [], read: null })} />);
	const headStanding = head.querySelector('[data-slot="page-fact"][data-kind="standing"]');
	const headSlip = head.querySelector('[data-slot="page-fact"][data-kind="slip"]');
	return {
		pies: { home: pie(home), card: pie(card), row: pie(row), head: headStanding ? pie(headStanding) : null },
		words: {
			home: home.querySelector('[data-slot="today-standing"]')!.textContent,
			card: card.querySelector('[data-slot="topic-standing"]')!.textContent,
			row: row.querySelector(".sr-only")!.textContent!.replace(/^, /, ""),
			head: headStanding?.textContent ?? null,
		},
		slips: {
			home: slip && { key: home.querySelector('[data-slot="today-standing"]')!.getAttribute("data-slip"), words: home.querySelector('[data-slot="today-standing"]')!.textContent },
			head: headSlip && { icon: icon(headSlip), words: headSlip.textContent!.replace(/^\. /, "") },
			standing: standing.words,
		},
		head,
	};
}

describe("one standing legend on every surface", () => {
	const table = TOPICS.map((t) => ({ t, ...drawn(t) }));
	console.log(["topic | words | slip", ...table.map((r) => `${r.t.handle} | ${r.words.home} | ${r.slips.home ? `${r.slips.home.key} ${r.slips.home.words}` : "-"}`)].join("\n"));

	it("draws each standing with one pie, in one ink, on Home, the map, the course page and the topic page", () => {
		for (const { t, pies } of table) {
			assert.equal(pies.card, pies.home, `${t.handle}: map card`);
			assert.equal(pies.row, pies.home, `${t.handle}: course page`);
			assert.equal(pies.head, pies.home, `${t.handle}: topic page`);
		}
		assert.equal(new Set(table.map((r) => r.pies.home)).size >= 6, true, "the states draw apart: each pie step, and the warning ink");
	});

	it("says each standing in the same words on every surface, Home's row saying the slip in their place", () => {
		for (const { t, words, slips } of table) {
			assert.deepEqual([words.card, words.row, words.head], [slips.standing, slips.standing, slips.standing], t.handle);
			assert.equal(words.home, slips.home?.words ?? slips.standing, `${t.handle}: one status on Home's row`);
		}
	});

	it("says Slipping beside every pie in the warning ink, and only there, on every surface", () => {
		for (const { t, words } of table) {
			assert.equal(words.card === "Slipping", t.weak, `${t.handle}: Slipping exactly when the engine calls it weak`);
			assert.deepEqual([words.row, words.head], [words.card, words.card], t.handle);
			assert.notEqual(words.home, "Slipping", `${t.handle}: Home's row says why it slips instead`);
		}
		assert.ok(table.some((r) => r.t.weak && r.t.level === "independent") && table.some((r) => r.t.weak && r.t.level === "assisted"), "Slipping on a pie short of full and on one he could do on his own");
	});

	it("says a slip in the same words on Home and the topic page, the head with the sidebar's and the map's icon", () => {
		for (const { t, slips } of table) {
			assert.equal(slips.home?.words ?? null, slips.head?.words ?? null, t.handle);
			const slip = slipBeside(t, titleOf);
			if (slip) assert.equal(slips.home?.key, slip.key, t.handle);
			if (slip) assert.equal(slips.head?.icon, lucideName(factIcon({ kind: "slip", words: slip.words, slip: slip.key })!), `${t.handle}: the sidebar's and the map's icon`);
		}
		const keys = new Set(table.flatMap((r) => (r.slips.home ? [slipBeside(r.t, titleOf)!.key] : [])));
		assert.deepEqual([...keys].sort(), ["check", "confident", "gap", "lapsed", "mixed", "repaired"], "every slip, beside Slipping");
	});

	it("marks a review due with one icon: Home's reason, the map, the sidebar and the topic page", () => {
		assert.equal(FACT_ICON.review, WHY_ICON.review);
		const kept = table.find((r) => r.t.handle === "kept")!;
		assert.equal(icon(kept.head.querySelector('[data-slot="page-fact"][data-kind="review"]')), lucideName(WHY_ICON.review));
	});
});
