/**
 * The course page's "map" candidate: the legend that counts the page's
 * groups and what it lights (Esc and a second press let go), how the
 * course's map is laid into the window so titles stay at the 11px floor
 * (whole, a long path wrapped into columns joined by links, an area that
 * scrolls), scrolling topics into view, and the keyboard's walk across
 * columns.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { CourseMap, CourseMapEdge, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseFacts, courseGroups } from "../components/course-page/course-model.ts";
import { layoutTopicMap } from "../components/course-map/topic-map/topic-map-layout.ts";
import { acrossColumns, columnMap, isPath, legendFacts, legendLight, litFact, mapPlan, NOTHING_LIT, pathLinks, REVEAL_ROOM, scrollToShow, TEXT_FLOOR_ZOOM, topicBoxes, WRAP_ROOM, type LegendEvent, type MapPlan } from "../components/course-page/map/map-plan.ts";
import { isNoteFact } from "../components/course-page/map/topic-note.tsx";
import { CourseLegend } from "../components/course-page/map/course-legend.tsx";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });
const later = (date: string) => ({ kind: "scheduled" as const, date });

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}
const needs = (prerequisite: string, t: string): CourseMapEdge => ({ kind: "needs", prerequisite: h(prerequisite), topic: h(t) });

function course(topics: CourseMapTopic[], edges: CourseMapEdge[], current: string | null = null): StudyCourse {
	return {
		map: { workspace: "/study/c", title: "Course", today: "2026-11-08", revision: 1, exam: null, current: current ? h(current) : null, focus: null, tasks: [], topics, edges },
		unready: null,
		due: [],
		lastActiveDaysAgo: 2,
		newToday: [],
	};
}

/** A path of `n` topics, each needing the one before. */
function path(n: number): { topics: CourseMapTopic[]; edges: CourseMapEdge[] } {
	const topics = Array.from({ length: n }, (_, i) => topic(`t${i + 1}`, { level: "retained", review: later("2026-12-01") }));
	return { topics, edges: topics.slice(1).map((t, i) => needs(`t${i + 1}`, t.handle)) };
}

/** Three topics needing one, and a fifth needing all three: wider than a path. */
const FAN = [topic("a"), topic("b"), topic("c"), topic("d"), topic("e")];
const FAN_EDGES = [needs("a", "b"), needs("a", "c"), needs("a", "d"), needs("b", "e"), needs("c", "e"), needs("d", "e")];

describe("the legend counts the page's groups", () => {
	const c = course(
		[
			topic("vectors", { level: "transferred", review: later("2026-11-13") }),
			topic("span", { level: "retained", review: due(10) }),
			topic("independence", { level: "assisted", weak: true, review: due(16), signals: { ...QUIET, gap: "a mistake" } }),
			topic("rank", { level: "introduced", review: due(2) }),
			topic("eigen"),
			topic("diagonal"),
		],
		[needs("vectors", "span"), needs("span", "independence")],
	);
	const facts = legendFacts(courseGroups(c));
	const byId = Object.fromEntries(facts.map((f) => [f.id, f]));

	it("draws the groups in the page's order, each a count and a few words", () => {
		assert.deepEqual(
			facts.map((f) => f.words),
			["2 need you", "1 learning", "2 not started", "1 on your own"],
		);
	});

	it("counts every topic once, so the counts add up to the course", () => {
		assert.equal(
			facts.reduce((n, f) => n + f.count, 0),
			c.map.topics.length,
		);
		const all = facts.flatMap((f) => [...f.topics]);
		assert.equal(new Set(all).size, all.length, "no topic is in two facts");
	});

	it("lights the same topics as the page's groups: a due review needs him, not on your own", () => {
		assert.deepEqual([...byId["needs-you"]!.topics], ["independence", "span"], "the slip first, as the group sorts them");
		assert.deepEqual([...byId["on-your-own"]!.topics], ["vectors"]);
	});

	it("shows the mark each fact explains: the need line's icon of the most pressing topic, else the pie", () => {
		assert.deepEqual(byId["needs-you"]!.mark, { kind: "need", need: "slip" }, "a slip outranks a due review");
		const reviews = legendFacts(courseGroups(course([topic("a", { level: "retained", review: due(3) })], [])));
		assert.deepEqual(reviews[0]!.mark, { kind: "need", need: "review" });
		assert.deepEqual(byId.learning!.mark, { kind: "pie", fill: 0.5 });
		assert.deepEqual(byId["not-started"]!.mark, { kind: "pie", fill: 0 });
		assert.deepEqual(byId["on-your-own"]!.mark, { kind: "pie", fill: 1 });
	});

	it("leaves out a group with no topics", () => {
		const learned = legendFacts(courseGroups(course([topic("a", { level: "retained", review: later("2026-12-01") }), topic("b", { level: "retained", review: later("2026-12-02") })], [])));
		assert.deepEqual(
			learned.map((f) => f.words),
			["2 on your own"],
		);
	});

	it("says one topic in the singular", () => {
		const one = legendFacts(courseGroups(course([topic("a", { weak: true, level: "attempted", signals: { ...QUIET, lapsed: true } })], [])));
		assert.equal(one[0]!.words, "1 needs you");
	});
});

describe("what the legend lights", () => {
	const run = (...events: LegendEvent[]) => events.reduce(legendLight, NOTHING_LIT);

	it("lights the fact under the pointer, and nothing once it leaves", () => {
		assert.equal(litFact(run({ type: "point", id: "learning" })), "learning");
		assert.equal(litFact(run({ type: "point", id: "learning" }, { type: "point", id: null })), null);
	});

	it("keeps a pressed fact lit after the pointer leaves", () => {
		assert.equal(litFact(run({ type: "point", id: "needs-you" }, { type: "press", id: "needs-you" }, { type: "focus", id: null }, { type: "point", id: null })), "needs-you");
	});

	it("lets go on Esc, with focus still on the fact", () => {
		const kept = run({ type: "focus", id: "needs-you" }, { type: "press", id: "needs-you" }, { type: "point", id: null });
		assert.equal(litFact(kept), "needs-you");
		assert.deepEqual(legendLight(kept, { type: "escape" }), NOTHING_LIT);
	});

	it("lets go when the kept fact is pressed again, even reached by keyboard", () => {
		const again = run({ type: "focus", id: "not-started" }, { type: "press", id: "not-started" }, { type: "press", id: null });
		assert.equal(litFact(again), null);
	});

	it("lights a fact keyboard focus reaches, the pointer winning while it points", () => {
		const focused = run({ type: "press", id: "needs-you" }, { type: "focus", id: "learning" });
		assert.equal(litFact(focused), "learning");
		assert.equal(litFact(legendLight(focused, { type: "point", id: "on-your-own" })), "on-your-own");
		assert.equal(litFact(legendLight(focused, { type: "focus", id: null })), "needs-you", "focus leaving shows the kept fact again");
	});
});

describe("the legend line", () => {
	const facts = legendFacts(
		courseGroups(course([topic("a", { level: "retained", review: later("2026-12-01") }), topic("b"), topic("c", { level: "attempted", weak: true, signals: { ...QUIET, lapsed: true } })], [])),
	);
	const render = (pinned: Parameters<typeof CourseLegend>[0]["pinned"]) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<CourseLegend facts={facts} pinned={pinned} onPin={() => {}} onPoint={() => {}} onFocusFact={() => {}} onLeave={() => {}} />)}</body></html>`).document;

	it("offers each counted group as a toggle, led by the mark it explains", () => {
		const items = [...render(null).querySelectorAll('[data-slot="course-legend-fact"]')];
		assert.deepEqual(
			items.map((i) => i.textContent),
			["1 needs you", "1 not started", "1 on your own"],
		);
		assert.deepEqual(
			items.map((i) => i.querySelector('[data-slot="topic-glyph"]')?.getAttribute("data-fill") ?? "icon"),
			["icon", "0", "1"],
		);
		assert.ok(items.every((i) => !i.hasAttribute("disabled")));
	});

	it("shows the fact it keeps lit as pressed", () => {
		const on = [...render("on-your-own").querySelectorAll('[data-slot="course-legend-fact"][data-state="on"]')];
		assert.deepEqual(
			on.map((i) => i.getAttribute("data-group")),
			["on-your-own"],
		);
	});
});

describe("the notes under lit topics", () => {
	it("say only what the node does not: the day it comes back, an open task's place, a turn that waits", () => {
		assert.equal(isNoteFact({ kind: "back", words: "Back Fri 13 Nov" }), true);
		assert.equal(isNoteFact({ kind: "task", words: "At part (c)" }), true);
		assert.equal(isNoteFact({ kind: "your-turn", words: "Your turn" }), true);
		assert.equal(isNoteFact({ kind: "slip", words: "Missed last time" }), false, "the node's own need line says it");
		assert.equal(isNoteFact({ kind: "here", words: "You are here" }), false, "the node's tag says it");
		assert.equal(isNoteFact(null), false);
	});
});

/** The plan, which must show every topic: whole or scrolling. */
function shows(plan: MapPlan | null, mode: MapPlan["mode"]): MapPlan {
	assert.ok(plan);
	assert.equal(plan.mode, mode);
	return plan;
}

describe("laying the map into the window", () => {
	const window1440 = { width: 1184, height: 700 };
	const window1100 = { width: 844, height: 500 };

	it("knows a path from a map that branches", () => {
		const p = path(5);
		assert.equal(isPath(layoutTopicMap(p.topics, p.edges)), true);
		assert.equal(isPath(layoutTopicMap(FAN, FAN_EDGES)), false);
		// A course with no prerequisites at all is drawn as one column, so it can wrap too.
		assert.equal(isPath(layoutTopicMap(p.topics, [])), true);
	});

	it("shows a map that fits whole, at full size at most", () => {
		const plan = shows(mapPlan(layoutTopicMap(FAN, FAN_EDGES), window1440), "whole");
		assert.equal(plan.zoom, 1);
		assert.equal(plan.columns.length, 1);
	});

	it("wraps a long path into columns so every topic shows and titles stay at 11px or more", () => {
		const p = path(24);
		const plan = shows(mapPlan(layoutTopicMap(p.topics, p.edges), window1440), "whole");
		assert.deepEqual(
			plan.columns.map((c) => c.length),
			[6, 6, 6, 6],
		);
		assert.deepEqual(plan.columns.flat(), p.topics.map((t) => t.handle), "read top to bottom, then left to right, in path order");
		assert.ok(plan.zoom >= TEXT_FLOOR_ZOOM);
		assert.ok(plan.frames.reduce((n, f) => n + f.width, 0) <= window1440.width);
		assert.ok(Math.max(...plan.frames.map((f) => f.height)) + WRAP_ROOM.above + WRAP_ROOM.below <= window1440.height, "with room above and below for the links");
	});

	it("keeps a short path in one column when it fits", () => {
		const p = path(5);
		assert.equal(shows(mapPlan(layoutTopicMap(p.topics, p.edges), window1440), "whole").columns.length, 1);
	});

	it("lets the area scroll down when only its width fits, as little as it can", () => {
		const p = path(24);
		const plan = shows(mapPlan(layoutTopicMap(p.topics, p.edges), window1100), "scroll");
		assert.ok(plan.zoom >= TEXT_FLOOR_ZOOM);
		assert.ok(plan.frames.reduce((n, f) => n + f.width, 0) <= window1100.width);
		assert.equal(plan.columns.length, 3);
	});

	it("draws a map too wide for the window at the floor, scrolling both ways, never smaller", () => {
		const wide = Array.from({ length: 6 }, (_, i) => topic(`w${i}`));
		const plan = shows(
			mapPlan(
				layoutTopicMap([topic("root"), ...wide], wide.map((w) => needs("root", w.handle))),
				window1100,
			),
			"scroll",
		);
		assert.equal(plan.zoom, TEXT_FLOOR_ZOOM);
		assert.ok(plan.frames[0]!.width > window1100.width);
	});

	it("keeps inside the page's column when the whole course fits there, and runs into its sides only to show it whole", () => {
		const fan = layoutTopicMap(FAN, FAN_EDGES);
		const narrow = { width: Math.ceil((fan.width + 32) * TEXT_FLOOR_ZOOM) + 20, height: 700 };
		assert.equal(mapPlan(fan, narrow, 32)?.mode, "whole", "whole with the sides");
		assert.equal(mapPlan(fan, { ...narrow, width: narrow.width - 64 })?.mode, "scroll", "not whole without them");
		const roomy = shows(mapPlan(fan, window1440, 32), "whole");
		assert.ok(roomy.frames[0]!.width <= window1440.width - 64, "inside the column when it fits there");
	});

	it("has no plan with nothing to lay out or no room yet", () => {
		assert.equal(mapPlan(layoutTopicMap([], []), window1440), null);
		assert.equal(mapPlan(layoutTopicMap(FAN, FAN_EDGES), { width: 0, height: 0 }), null);
	});
});

describe("where the cards sit, and the links between columns", () => {
	const p = path(12);
	const plan = shows(mapPlan(layoutTopicMap(p.topics, p.edges), { width: 1184, height: 700 }), "whole");
	const layouts = plan.columns.map((column) => layoutTopicMap(p.topics.filter((t) => column.includes(t.handle)), p.edges.filter((e) => e.kind === "needs" && column.includes(e.prerequisite) && column.includes(e.topic))));
	const boxes = topicBoxes(plan, layouts);

	it("places every topic, each column beside the one before, below the room for the links", () => {
		assert.ok(plan.columns.length > 1);
		assert.equal(boxes.size, 12);
		const [a, b] = [boxes.get(plan.columns[0]![0]!)!, boxes.get(plan.columns[1]![0]!)!];
		assert.ok(b.x > a.x + a.width, "the second column to the right of the first");
		assert.ok(Math.abs(a.y - b.y) < 1, "the columns' heads level");
		assert.ok(a.y >= WRAP_ROOM.above);
	});

	it("runs one link from a column's foot to the next column's head, through the gap between them", () => {
		const links = pathLinks(plan, boxes);
		assert.deepEqual(
			links.map((l) => [l.from, l.to]),
			plan.columns.slice(1).map((column, i) => [plan.columns[i]!.at(-1), column[0]]),
		);
		const foot = boxes.get(links[0]!.from)!;
		const head = boxes.get(links[0]!.to)!;
		const d = links[0]!.d;
		assert.ok(d.startsWith(`M${foot.x + foot.width / 2},${foot.y + foot.height}`), "from the foot's bottom middle");
		assert.ok(d.endsWith(`V${head.y}`), "into the head's top");
		assert.ok(d.includes(`H${plan.frames[0]!.width - 6}`), "across to the gap between the columns");
	});

	it("draws no link for a map in one column", () => {
		const one = shows(mapPlan(layoutTopicMap(FAN, FAN_EDGES), { width: 1184, height: 700 }), "whole");
		assert.deepEqual(pathLinks(one, topicBoxes(one, [layoutTopicMap(FAN, FAN_EDGES)])), []);
	});
});

describe("scrolling topics into view", () => {
	const view = { width: 400, height: 300 };
	const content = { width: 1000, height: 900 };
	const box = (x: number, y: number) => ({ x, y, width: 100, height: 50 });

	it("moves nothing when every topic shows", () => {
		assert.equal(scrollToShow([box(50, 50), box(200, 100)], { left: 0, top: 0 }, view, content), null);
	});

	it("centres topics that fit together", () => {
		assert.deepEqual(scrollToShow([box(500, 400), box(600, 450)], { left: 0, top: 0 }, view, content), { left: 400, top: 300 });
	});

	it("brings the first, most pressing topic to the start when they do not fit together", () => {
		assert.deepEqual(scrollToShow([box(600, 500), box(50, 50)], { left: 0, top: 0 }, view, content), { left: 600 - REVEAL_ROOM, top: 500 - REVEAL_ROOM });
	});

	it("never scrolls past the content's ends", () => {
		assert.deepEqual(scrollToShow([box(900, 850)], { left: 0, top: 0 }, view, content), { left: 600, top: 600 });
	});
});

describe("a column's run of the map", () => {
	const p = path(6);
	const map: CourseMap = { ...course(p.topics, p.edges, "t5").map, edges: [...p.edges, { kind: "contrasts", pair: [h("t1"), h("t5")] }] };

	it("holds its topics, the needs between them and the current topic if it is there", () => {
		const run = columnMap(map, [h("t4"), h("t5"), h("t6")], 3, 2);
		assert.deepEqual(
			run.topics.map((t) => t.handle),
			["t4", "t5", "t6"],
		);
		assert.deepEqual(
			run.edges.map((e) => (e.kind === "needs" ? `${e.prerequisite}>${e.topic}` : e.kind)),
			["t4>t5", "t5>t6"],
		);
		assert.equal(run.current, "t5");
		assert.equal(run.title, "Course, topics 4 to 6");
		assert.equal(columnMap(map, [h("t1"), h("t2"), h("t3")], 0, 2).current, null);
	});

	it("is the whole map when there is one column", () => {
		assert.equal(columnMap(map, p.topics.map((t) => t.handle), 0, 1), map);
	});
});

describe("the arrows across wrapped columns", () => {
	const columns = [[h("a"), h("b"), h("c")], [h("d"), h("e"), h("f")], [h("g")]];

	it("goes on from a column's foot to the next column's head, and back", () => {
		assert.equal(acrossColumns(columns, h("c"), "ArrowDown"), "d");
		assert.equal(acrossColumns(columns, h("d"), "ArrowUp"), "c");
		assert.equal(acrossColumns(columns, h("b"), "ArrowDown"), null, "inside a column the map walks itself");
	});

	it("steps sideways to the topic beside it, or the shorter column's last", () => {
		assert.equal(acrossColumns(columns, h("b"), "ArrowRight"), "e");
		assert.equal(acrossColumns(columns, h("f"), "ArrowRight"), "g");
		assert.equal(acrossColumns(columns, h("g"), "ArrowLeft"), "d");
	});

	it("stops at the path's ends", () => {
		assert.equal(acrossColumns(columns, h("a"), "ArrowUp"), null);
		assert.equal(acrossColumns(columns, h("g"), "ArrowDown"), null);
		assert.equal(acrossColumns(columns, h("a"), "ArrowLeft"), null);
	});
});
