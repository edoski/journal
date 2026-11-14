/**
 * The topic map's card (topic-map.md, Node): its line, the sidebar's fact
 * when it needs him, else where he stands, and Home's own pie. Same tsx
 * classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { CourseMapTopic, TopicHandle, TopicSignals } from "../src/core/contracts/course-map.ts";
import { NodeBody } from "../components/course-map/topic-map/topic-node.tsx";
import { Pie } from "../components/ui/pie.tsx";
import { cardLine, standingOf, type CardFact } from "../components/course-map/topic-map/topic-standing.ts";
import type { TopicFact } from "../components/unit-inbox/sidebar-says.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET: TopicSignals = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });

function topic(over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h("t"), title: "Rank and the column space", level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

describe("a card's line", () => {
	const said = (fact: TopicFact | null) => ({ place: "learning" as const, fact });

	it("says the sidebar's fact when it needs him: a waiting turn, the tutor writing, a slip, a due review, an open task, Today's plan", () => {
		const needs: TopicFact[] = [
			{ kind: "your-turn", words: "Your turn" },
			{ kind: "working", words: "Working" },
			{ kind: "stopped", words: "Stopped" },
			{ kind: "slip", words: "Mistake to fix" },
			{ kind: "review", words: "3d overdue" },
			{ kind: "task", words: "Left off 3d ago" },
			{ kind: "next", words: "Planned today" },
		];
		for (const fact of needs) assert.deepEqual(cardLine(said(fact)), fact, fact.kind);
	});

	it("leaves the line to where he stands when the sidebar says only when it comes back or when he last studied it, or has no row for it", () => {
		assert.equal(cardLine(said({ kind: "back", words: "Back in 5d" })), null);
		assert.equal(cardLine(said({ kind: "studied", words: "3d ago" })), null);
		assert.equal(cardLine(said(null)), null);
		assert.equal(cardLine(undefined), null);
	});
});

describe("the card", () => {
	const render = (t: CourseMapTopic, line: CardFact | null = null) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<NodeBody topic={t} standing={standingOf(t)} line={line} />)}</body></html>`).document;
	const weak = (level: CourseMapTopic["level"], signals: Partial<TopicSignals>) => topic({ level, weak: true, signals: { ...QUIET, ...signals } });
	/** Every state a card draws, and its line under the title: the sidebar's fact, else the standing in words. */
	const STATES: { name: string; topic: CourseMapTopic; fact?: CardFact; line: string }[] = [
		{ name: "not started", topic: topic(), line: "Not started" },
		{ name: "learning", topic: topic({ level: "attempted" }), line: "Tried, not right yet" },
		{ name: "on his own, resting", topic: topic({ level: "retained", review: { kind: "scheduled", date: "2026-11-20" } }), line: "On your own" },
		{ name: "a turn that waits on him", topic: weak("assisted", { gap: "sign error" }), fact: { kind: "your-turn", words: "Your turn" }, line: "Your turn" },
		{ name: "the tutor writing", topic: topic({ level: "attempted" }), fact: { kind: "working", words: "Working" }, line: "Working" },
		{ name: "review a week late", topic: topic({ level: "retained", review: due(9) }), fact: { kind: "review", words: "9d overdue" }, line: "9d overdue" },
		{ name: "mixed up with a method", topic: weak("attempted", { choiceErrors: { cramer: 1 } }), fact: { kind: "slip", words: "Mixed up with Cramer's rule" }, line: "Mixed up with Cramer's rule" },
		{ name: "an open task", topic: topic({ level: "attempted", tasks: ["sheet-4"] }), fact: { kind: "task", words: "Left off 3d ago" }, line: "Left off 3d ago" },
	];
	const line = (doc: Document) => (doc.querySelector('[data-slot="topic-need"]') ?? doc.querySelector('[data-slot="topic-standing"]'))!.textContent;

	for (const state of STATES) {
		it(`says it for ${state.name}`, () => {
			const card = render(state.topic, state.fact ?? null);
			assert.equal(line(card), state.line);
			assert.ok(card.body.textContent!.includes(state.topic.title), "the title");
		});
	}

	it("draws Home's pie, the shared one: as full as the topic, the outline alone before he starts, the warning ink on a slip", () => {
		const pie = (t: CourseMapTopic) => render(t).querySelector('[data-slot="topic-glyph"]')!;
		const home = renderToStaticMarkup(<Pie share={0.5} />);
		assert.equal(pie(topic({ level: "attempted" })).getAttribute("data-fill"), "0.5");
		assert.equal(pie(topic({ level: "attempted" })).querySelector("path")!.getAttribute("d"), parseHTML(home).document.querySelector("path")!.getAttribute("d"), "the wedge Home's rows draw");
		assert.match(pie(topic({ level: "attempted" })).getAttribute("class")!, /size-4/);
		assert.ok(pie(topic({ level: "retained" })).querySelector("circle[r='5']"), "full once he can do it on his own");
		assert.ok(pie(topic()).querySelector('[data-part="outline"]:not([stroke-dasharray])'), "a solid outline, never a dashed spinner");
		assert.equal(pie(topic()).querySelector("path, circle[r='5']"), null, "empty before he starts");
		assert.match(pie(weak("attempted", { lapsed: true })).getAttribute("class")!, /text-warning/);
	});

	it("centres the pie beside the two lines, as Home's row does", () => {
		const body = render(topic({ level: "attempted" })).body.firstElementChild!;
		assert.match(body.getAttribute("class")!, /items-center/);
		assert.equal(body.children[0]!.getAttribute("data-slot"), "topic-glyph");
		assert.equal(body.children[1]!.children.length, 2, "the title over one line");
	});
});
