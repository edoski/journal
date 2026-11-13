/**
 * The Node switch's candidates (topic-map.md, "Node switch"): what each
 * says about a topic, from the same engine fields, and that each draws in
 * its own box. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { CourseMapTask, CourseMapTopic, TopicHandle, TopicSignals } from "../src/core/contracts/course-map.ts";
import { NODE_SIZES } from "../components/course-map/topic-map/node-size.ts";
import { layoutTopicMap } from "../components/course-map/topic-map/topic-map-layout.ts";
import { NodeBody } from "../components/course-map/topic-map/topic-node.tsx";
import { needOf, standingOf, statusOf } from "../components/course-map/topic-map/topic-standing.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET: TopicSignals = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });
const titleOf = (handle: TopicHandle) => ({ cramer: "Cramer's rule" })[handle as string] ?? handle;
const TASKS: CourseMapTask[] = [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" }];

function topic(over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h("t"), title: "Rank and the column space", level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

describe("a candidate node's status", () => {
	it("says a slip first, in Home's few words at a line's end", () => {
		const status = (signals: Partial<TopicSignals>) => statusOf(topic({ level: "attempted", weak: true, signals: { ...QUIET, ...signals } }), TASKS, titleOf);
		assert.deepEqual(status({ lapsed: true }), { kind: "slip", words: "Missed last time", short: "Missed" });
		assert.equal(status({ gap: "sign error" })!.short, "Mistake to fix");
		assert.deepEqual(status({ choiceErrors: { cramer: 2 } }), { kind: "slip", words: "Mixed up with Cramer's rule", short: "Mixed up" });
		assert.equal(status({ confidentErrors: 1 })!.short, "Sure, but wrong");
		assert.equal(status({})!.short, "Look again");
	});

	it("says a due review as Home does, only for a topic he can do on his own", () => {
		const review = (overdue: number) => statusOf(topic({ level: "independent", review: due(overdue) }), [], titleOf)!.short;
		assert.deepEqual([review(0), review(3), review(10), review(16)], ["Due today", "3d overdue", "1w overdue", "2w overdue"]);
		assert.equal(statusOf(topic({ level: "attempted", review: due(4) }), [], titleOf), null, "a topic still being learned is nearly always due");
	});

	it("says where an open task holding the topic was left, after a slip and a review", () => {
		assert.deepEqual(statusOf(topic({ level: "attempted", tasks: ["sheet-4"] }), TASKS, titleOf), { kind: "task", words: "At part (c)", short: "At part (c)" });
		assert.equal(statusOf(topic({ level: "attempted", tasks: ["sheet-4"] }), [{ ...TASKS[0]!, step: "Part (c): show dim ker A = 2" }], titleOf)!.short, "At part (c)", "the step up to its colon, as the sidebar says it");
		assert.equal(statusOf(topic({ level: "attempted", tasks: ["gone"] }), TASKS, titleOf)!.short, "Unfinished");
		assert.equal(statusOf(topic({ level: "independent", review: due(0), tasks: ["sheet-4"] }), TASKS, titleOf)!.kind, "review");
		assert.equal(statusOf(topic(), TASKS, titleOf), null);
	});
});

describe("the candidates' bodies", () => {
	type Candidate = "header" | "ring" | "edge";
	const render = (variant: Candidate, t: CourseMapTopic) =>
		parseHTML(
			`<html><body>${renderToStaticMarkup(<NodeBody variant={variant} topic={t} standing={standingOf(t)} need={needOf(t, titleOf)} status={statusOf(t, TASKS, titleOf)} />)}</body></html>`,
		).document;
	const weak = (level: CourseMapTopic["level"], signals: Partial<TopicSignals>) => topic({ level, weak: true, signals: { ...QUIET, ...signals } });
	/** Every state a node draws, and what each candidate says beyond the title: the header's standing and its
	 *  status in few words, the ring's one line (the status in full, else the standing), the edge's few words. */
	const STATES: { name: string; topic: CourseMapTopic; header: [string, string | null]; ring: string; edge: string | null }[] = [
		{ name: "not started", topic: topic(), header: ["Not started", null], ring: "Not started", edge: null },
		{ name: "learning", topic: topic({ level: "attempted" }), header: ["Learning", null], ring: "Learning", edge: null },
		{ name: "nearly on his own", topic: topic({ level: "assisted" }), header: ["Nearly on your own", null], ring: "Nearly on your own", edge: null },
		{ name: "on his own, resting", topic: topic({ level: "retained", review: { kind: "scheduled", date: "2026-11-20" } }), header: ["On your own", null], ring: "On your own", edge: null },
		{ name: "review due today", topic: topic({ level: "retained", review: due(0) }), header: ["On your own", "Due today"], ring: "Due today", edge: "Due today" },
		{ name: "review a week late", topic: topic({ level: "retained", review: due(9) }), header: ["On your own", "1w overdue"], ring: "1w overdue", edge: "1w overdue" },
		{ name: "missed after he had it", topic: weak("retained", { lapsed: true }), header: ["On your own", "Missed"], ring: "Missed last time", edge: "Missed" },
		{ name: "a mistake to fix", topic: weak("assisted", { gap: "sign error" }), header: ["Nearly on your own", "Mistake to fix"], ring: "A mistake to fix", edge: "Mistake to fix" },
		{ name: "mixed up with a method", topic: weak("attempted", { choiceErrors: { cramer: 1 } }), header: ["Learning", "Mixed up"], ring: "Mixed up with Cramer's rule", edge: "Mixed up" },
		{ name: "sure, but wrong", topic: weak("assisted", { confidentErrors: 2 }), header: ["Nearly on your own", "Sure, but wrong"], ring: "Sure, but wrong", edge: "Sure, but wrong" },
		{ name: "weak, no signal", topic: weak("independent", {}), header: ["On your own", "Look again"], ring: "Worth another look", edge: "Look again" },
		{ name: "an open task", topic: topic({ level: "attempted", tasks: ["sheet-4"] }), header: ["Learning", "At part (c)"], ring: "At part (c)", edge: "At part (c)" },
	];
	const need = (doc: Document) => doc.querySelector('[data-slot="topic-need"]')?.textContent ?? null;

	for (const state of STATES) {
		it(`says it for ${state.name}`, () => {
			const header = render("header", state.topic);
			assert.deepEqual([header.querySelector('[data-slot="topic-standing"]')!.textContent, need(header)], state.header, "header");
			const ring = render("ring", state.topic);
			assert.equal(need(ring) ?? ring.querySelector('[data-slot="topic-standing"]')!.textContent, state.ring, "ring");
			assert.equal(need(render("edge", state.topic)), state.edge, "edge");
			for (const variant of ["header", "ring", "edge"] as const) assert.ok(render(variant, state.topic).body.textContent!.includes(state.topic.title), `${variant} shows the title`);
		});
	}

	it("header: a 12px pie leads the standing, as full as the topic, in the warning ink on a slip", () => {
		const pie = render("header", weak("assisted", { gap: "x" })).querySelector('[data-slot="topic-standing"] [data-slot="topic-glyph"]')!;
		assert.equal(pie.getAttribute("data-fill"), "0.75");
		assert.match(pie.getAttribute("class")!, /size-3/);
		assert.match(pie.getAttribute("class")!, /text-warning/);
	});

	it("ring: the arc as far as the pie would fill, closed around a check once he can do it on his own, dashed before he starts", () => {
		const ring = (t: CourseMapTopic) => render("ring", t).querySelector('[data-slot="topic-ring"]')!;
		assert.equal(ring(topic({ level: "attempted" })).getAttribute("data-fill"), "0.5");
		assert.ok(ring(topic({ level: "retained" })).querySelector("path"), "a check in a closed ring");
		assert.equal(ring(topic({ level: "assisted" })).querySelector("path"), null);
		assert.ok(ring(topic()).querySelector("circle[stroke-dasharray]"));
		assert.match(ring(weak("attempted", { lapsed: true })).getAttribute("class")!, /text-warning/);
		assert.equal(render("ring", topic()).querySelector('[data-slot="topic-glyph"]'), null, "no pie");
	});

	it("edge: the card's bottom edge filled as far as the pie would fill, in the warning ink on a slip, empty before he starts", () => {
		const bar = (t: CourseMapTopic) => render("edge", t).querySelector('[data-slot="topic-edge"] > span')!;
		assert.match(bar(topic({ level: "introduced" })).getAttribute("style")!, /width:\s*25%/);
		assert.match(bar(topic({ level: "transferred" })).getAttribute("style")!, /width:\s*100%/);
		assert.match(bar(topic()).getAttribute("style")!, /width:\s*0%/);
		assert.match(bar(weak("attempted", { lapsed: true })).getAttribute("class")!, /bg-warning/);
		assert.equal(render("edge", topic()).querySelector('[data-slot="topic-glyph"], [data-slot="topic-standing"]'), null, "no pie and no standing words");
	});

	it("each lays the map out in its own box", () => {
		const topics = [topic({ handle: h("a") }), topic({ handle: h("b") })];
		const edges = [{ kind: "needs" as const, prerequisite: h("a"), topic: h("b") }];
		for (const size of Object.values(NODE_SIZES)) {
			const layout = layoutTopicMap(topics, edges, size);
			assert.deepEqual(layout.node, size);
			assert.equal(layout.width, size.width);
			assert.ok(layout.topics.get(h("b"))!.y - layout.topics.get(h("a"))!.y >= size.height);
		}
	});
});
