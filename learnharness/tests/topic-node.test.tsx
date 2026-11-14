/**
 * The topic map's card (topic-map.md, Node): what it says about a topic,
 * from the engine's fields, and that it draws Home's own pie. Same tsx
 * classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { CourseMapTask, CourseMapTopic, TopicHandle, TopicSignals } from "../src/core/contracts/course-map.ts";
import { NodeBody } from "../components/course-map/topic-map/topic-node.tsx";
import { Pie } from "../components/ui/pie.tsx";
import { standingOf, statusOf } from "../components/course-map/topic-map/topic-standing.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET: TopicSignals = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });
const titleOf = (handle: TopicHandle) => ({ cramer: "Cramer's rule" })[handle as string] ?? handle;
const TODAY = "2026-11-08";
const TASKS: CourseMapTask[] = [{ key: "sheet-4", title: "Problem sheet 4", step: "Pending question, not yet answered: part (c). Then pose the owed retest", updated: "2026-11-05" }];

function topic(over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h("t"), title: "Rank and the column space", level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

describe("a card's status", () => {
	it("says a slip first, in the app's one wording", () => {
		const status = (signals: Partial<TopicSignals>) => statusOf(topic({ level: "attempted", weak: true, signals: { ...QUIET, ...signals } }), TASKS, titleOf, TODAY);
		assert.deepEqual(status({ lapsed: true }), { kind: "slip", words: "Not right last time", slip: "lapsed" });
		assert.equal(status({ gap: "sign error" })!.words, "Mistake to fix");
		assert.deepEqual(status({ choiceErrors: { cramer: 2 } }), { kind: "slip", words: "Mixed up with Cramer's rule", slip: "mixed" });
		assert.equal(status({ confidentErrors: 1 })!.words, "Sure, but wrong");
		assert.equal(status({})!.words, "Look again");
	});

	it("says a due review as Home does, only for a topic he can do on his own", () => {
		const review = (overdue: number) => statusOf(topic({ level: "independent", review: due(overdue) }), [], titleOf, TODAY)!.words;
		assert.deepEqual([review(0), review(3), review(10), review(16)], ["Due today", "3d overdue", "1w overdue", "2w overdue"]);
		assert.equal(statusOf(topic({ level: "attempted", review: due(4) }), [], titleOf, TODAY), null, "a topic still being learned is nearly always due");
	});

	it("says when an open task holding the topic was left, never the tutor's step, after a slip and a review", () => {
		assert.deepEqual(statusOf(topic({ level: "attempted", tasks: ["sheet-4"] }), TASKS, titleOf, TODAY), { kind: "task", words: "Left off 3d ago" });
		assert.equal(statusOf(topic({ level: "attempted", tasks: ["sheet-4"] }), [{ ...TASKS[0]!, updated: TODAY }], titleOf, TODAY)!.words, "Left off today");
		assert.equal(statusOf(topic({ level: "attempted", tasks: ["gone"] }), TASKS, titleOf, TODAY)!.words, "Unfinished");
		assert.equal(statusOf(topic({ level: "independent", review: due(0), tasks: ["sheet-4"] }), TASKS, titleOf, TODAY)!.kind, "review");
		assert.equal(statusOf(topic(), TASKS, titleOf, TODAY), null);
	});
});

describe("the card", () => {
	const render = (t: CourseMapTopic) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<NodeBody topic={t} standing={standingOf(t)} status={statusOf(t, TASKS, titleOf, TODAY)} />)}</body></html>`).document;
	const weak = (level: CourseMapTopic["level"], signals: Partial<TopicSignals>) => topic({ level, weak: true, signals: { ...QUIET, ...signals } });
	/** Every state a card draws, and its line under the title: the status, else the standing in words. */
	const STATES: { name: string; topic: CourseMapTopic; line: string }[] = [
		{ name: "not started", topic: topic(), line: "Not started" },
		{ name: "learning", topic: topic({ level: "attempted" }), line: "Tried, not right yet" },
		{ name: "on his own, resting", topic: topic({ level: "retained", review: { kind: "scheduled", date: "2026-11-20" } }), line: "On your own" },
		{ name: "review a week late", topic: topic({ level: "retained", review: due(9) }), line: "1w overdue" },
		{ name: "missed after he had it", topic: weak("retained", { lapsed: true }), line: "Not right last time" },
		{ name: "mixed up with a method", topic: weak("attempted", { choiceErrors: { cramer: 1 } }), line: "Mixed up with Cramer's rule" },
		{ name: "an open task", topic: topic({ level: "attempted", tasks: ["sheet-4"] }), line: "Left off 3d ago" },
	];
	const line = (doc: Document) => (doc.querySelector('[data-slot="topic-need"]') ?? doc.querySelector('[data-slot="topic-standing"]'))!.textContent;

	for (const state of STATES) {
		it(`says it for ${state.name}`, () => {
			const card = render(state.topic);
			assert.equal(line(card), state.line);
			assert.ok(card.body.textContent!.includes(state.topic.title), "the title");
		});
	}

	it("draws Home's pie, the shared one: as full as the topic, dashed and empty before he starts, the warning ink on a slip", () => {
		const pie = (t: CourseMapTopic) => render(t).querySelector('[data-slot="topic-glyph"]')!;
		const home = renderToStaticMarkup(<Pie share={0.5} />);
		assert.equal(pie(topic({ level: "attempted" })).getAttribute("data-fill"), "0.5");
		assert.equal(pie(topic({ level: "attempted" })).querySelector("path")!.getAttribute("d"), parseHTML(home).document.querySelector("path")!.getAttribute("d"), "the wedge Home's rows draw");
		assert.match(pie(topic({ level: "attempted" })).getAttribute("class")!, /size-4/);
		assert.ok(pie(topic({ level: "retained" })).querySelector("circle[r='5']"), "full once he can do it on his own");
		assert.ok(pie(topic()).querySelector("circle[stroke-dasharray]"));
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
