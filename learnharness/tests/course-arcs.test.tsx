/**
 * Arcs on the course page, its map and Home's map: the road leads with
 * the course's arcs (a folded line each, where he is open, "Needs you"
 * only for what Today takes up, Check it only on a ready arc), Now picks
 * up what Today puts first, Home's map lists every arc beside it and shows
 * the arc its follow names, a map draws one
 * arc with what it builds on faded and captioned in its top layer, and
 * its lit chain stays inside that arc. A course without arcs, or with
 * one, shows exactly as before. Same tsx classic-JSX shim as the other
 * render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle, CourseMapEdge, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { CHATS, LINALG, LINALG_ARCS, PROB, arc } from "./fixtures/now-demo.ts";
import { courseArcs, courseGroups, openingArc, pickUpLine, shownArcs } from "../components/course-page/course-model.ts";
import { CHECK_WORDS, RoadArc, type ArcLineProps } from "../components/course-page/road/road-arc.tsx";
import { SplitList } from "../components/course-page/split/split-list.tsx";
import { OPEN_AT_FIRST, shownGroups, walkStops } from "../components/course-page/split/split-tie.ts";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { TopicMap } from "../components/course-map/topic-map/topic-map.tsx";
import { arcView } from "../components/course-map/topic-map/arc-view.ts";
import { chainOf } from "../components/course-map/topic-map/topic-map-layout.ts";
import { drawingOf } from "../components/course-map/topic-map/map-drawing.ts";
import { HomeMap, litArc } from "../components/study-home/home-map.tsx";
import { ARC_EXAM_WORDS } from "../components/study-words.ts";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
/** A map card's link's card, which fades: the link sits in the card's surface, inside it. */
const cardOf = (link: Element) => link.parentElement!.parentElement!;
const needs = (pairs: Array<[string, string]>): CourseMapEdge[] => pairs.map(([p, t]) => ({ kind: "needs", prerequisite: h(p), topic: h(t) }));

/** Linear Algebra in three arcs, with its needs: Rank builds on Linear
 *  independence from Vector spaces, Eigenvalues on Rank and Determinants. */
const EDGES = needs([
	["vectors", "independence"],
	["independence", "rank"],
	["rank", "det"],
	["rank", "eigen"],
	["det", "eigen"],
	["eigen", "diag"],
]);
const ARCS: StudyCourse = { ...LINALG_ARCS, map: { ...LINALG_ARCS.map, edges: EDGES } };
const noArcs: StudyCourse = { ...LINALG, map: { ...LINALG.map, edges: EDGES } };
const oneArc: StudyCourse = { ...ARCS, map: { ...ARCS.map, arcs: [arc("spaces", "Vector spaces", "learning")] } };

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close: () => {} }) as never}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;
const noop = () => {};
const text = (el: Element | null | undefined) => el?.textContent ?? "";

describe("the course page's arcs", () => {
	it("leads only a course with two or more arcs: one without, or with one, keeps its four groups", () => {
		assert.equal(courseArcs(noArcs), null);
		assert.equal(courseArcs(oneArc), null);
		assert.equal(shownArcs(oneArc.map), null);
		assert.deepEqual(
			courseArcs(ARCS)!.map((s) => [s.arc.handle, s.topics.map((t) => t.topic.handle)]),
			[
				["spaces", ["vectors", "independence"]],
				["systems", ["rank", "det"]],
				["eigenvalues", ["eigen", "diag"]],
			],
		);
	});

	it("opens on the arc he is in, the arc of You are here", () => {
		const sections = courseArcs(ARCS)!;
		assert.deepEqual(
			sections.filter((s) => s.current).map((s) => s.arc.handle),
			["systems"],
		);
		assert.equal(openingArc(sections), "systems");
		const moved = courseArcs({ ...ARCS, map: { ...ARCS.map, current: h("eigen") } })!;
		assert.equal(openingArc(moved), "eigenvalues", "a lesson that moves You are here moves the open arc");
	});

	it("says Needs you only for an arc one of whose topics Today takes up", () => {
		const sections = courseArcs(ARCS)!;
		const needs = Object.fromEntries(sections.map((s) => [s.arc.handle, s.needsYou]));
		assert.equal(needs.spaces, true, "Linear independence's overdue review is Today's");
		assert.equal(needs.systems, false, "Rank slips, but Today does not take it up, so it stays a slip in Learning");
		assert.equal(sections.find((s) => s.arc.handle === "systems")!.topics.find((t) => t.topic.handle === "rank")!.group, "learning");
		assert.equal(needs.eigenvalues, false);
	});

	it("draws each arc's ring as the share of its topics he can do on his own", () => {
		assert.deepEqual(
			courseArcs(ARCS)!.map((s) => s.share),
			[1, 0, 0],
		);
	});

	it("says which arcs the exam leaves out only when it leaves some out", () => {
		assert.ok(courseArcs(ARCS)!.every((s) => s.exam === null), "an exam over the whole course says nothing");
		const scoped = (exam: object) => courseArcs({ ...ARCS, map: { ...ARCS.map, exam: { ...ARCS.map.exam!, ...exam } } })!.map((s) => s.exam);
		assert.deepEqual(scoped({ arcs: [a("spaces"), a("systems")] }), [null, null, ARC_EXAM_WORDS.none]);
		assert.deepEqual(scoped({ arcs: [a("spaces"), a("systems")], leavesOut: [h("det")] }), [null, ARC_EXAM_WORDS.part, ARC_EXAM_WORDS.none]);
	});
});

describe("the road's arc lines", () => {
	const sections = courseArcs(ARCS)!;
	const line = (props: ArcLineProps) => <RoadArc {...props} number={sections.indexOf(props.section) + 1} starts={null} />;
	const draw = (open: Record<string, boolean>, checks = true) =>
		render(<SplitList groups={[]} arcs={sections} open={open} onOpenChange={noop} onCheck={checks ? noop : undefined} marked={null} onPoint={noop} onEnterMap={noop} onWalkKey={noop} arcLine={line} />);

	it("folds every arc but the open one to its line, in study order, and draws only the open arc's topics", () => {
		const document = draw({ systems: true });
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-arc"]')].map((arc) => [arc.getAttribute("data-arc"), arc.querySelector('[data-slot="course-arc-header"]')!.getAttribute("aria-expanded")]),
			[
				["spaces", "false"],
				["systems", "true"],
				["eigenvalues", "false"],
			],
		);
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-topic-row"]')].map((r) => r.getAttribute("data-topic")),
			["rank", "det"],
		);
		assert.equal(document.querySelectorAll('[data-slot="course-group-header"]').length, 0, "no groups beside the arcs");
		assert.doesNotMatch(text(document.querySelector('[data-slot="course-arc-header"]')).replace(/^1/, ""), /\d/, "no counts on a line, only its number");
	});

	it("ends a line in Needs you, in the warning ink, where Today asks, and says nothing on an arc under way", () => {
		const document = draw({});
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-arc-state"]')].map((s) => [s.closest("[data-arc]")?.getAttribute("data-arc"), text(s), s.getAttribute("data-kind")]),
			[["spaces", "Needs you", "needs-you"]],
		);
		assert.match(document.querySelector('[data-slot="course-arc-state"][data-kind="needs-you"]')!.className, /text-warning/);
	});

	it("offers Check it on a ready arc only, folded or open", () => {
		for (const open of [{}, { spaces: true }] as Record<string, boolean>[]) {
			const checks = [...draw(open).querySelectorAll('[data-slot="course-arc-check"]')];
			assert.deepEqual(
				checks.map((c) => [c.closest('[data-slot="course-arc"]')?.getAttribute("data-arc"), text(c)]),
				[["spaces", CHECK_WORDS]],
			);
		}
		assert.equal(draw({}, false).querySelectorAll('[data-slot="course-arc-check"]').length, 0, "no Check it without a way to start it");
		const noneReady = courseArcs({ ...ARCS, map: { ...ARCS.map, arcs: ARCS.map.arcs!.map((x) => ({ ...x, state: "learning" as const })) } })!;
		const quiet = render(<SplitList groups={[]} arcs={noneReady} open={{}} onOpenChange={noop} onCheck={noop} marked={null} onPoint={noop} onEnterMap={noop} onWalkKey={noop} arcLine={line} />);
		assert.equal(quiet.querySelectorAll('[data-slot="course-arc-check"]').length, 0);
	});

	it("walks each line, then a ready arc's Check it, then the open arc's rows", () => {
		const stops = walkStops(
			sections.map((s) => ({ id: s.arc.handle, topics: s.topics, checkable: s.arc.state === "ready" })),
			{ systems: true },
		).map((s) => (s.kind === "row" ? s.handle : `${s.kind}:${s.id}`));
		assert.deepEqual(stops, ["group:spaces", "check:spaces", "group:systems", "rank", "det", "group:eigenvalues"]);
	});

	it("keeps the four groups for a course without arcs", () => {
		const document = render(<SplitList groups={shownGroups(courseGroups(noArcs))} open={OPEN_AT_FIRST} onOpenChange={noop} marked={null} onPoint={noop} onEnterMap={noop} onWalkKey={noop} arcLine={line} />);
		assert.equal(document.querySelectorAll('[data-slot="course-arc"]').length, 0);
		assert.ok(document.querySelectorAll('[data-slot="course-group-header"]').length > 0);
	});
});

describe("Now, under the course head", () => {
	it("picks up what Home's Today puts first for the course, even when that is a slip in another arc than where he is", () => {
		const line = pickUpLine(ARCS)!;
		assert.equal(line.title, "Review Linear independence");
		assert.equal(line.why?.short, "Due since 4 Nov");
		assert.equal((line.lead ?? line.topics[0])?.arc, "spaces", "You are here is in Linear systems");
		const waiting = pickUpLine(ARCS, CHATS)!;
		assert.equal(waiting.title, "Review Linear independence", "today's review comes before a session waiting on him, as on Today (round 10, 1 m2)");
	});

	it("says nothing for a course without arcs, which falls back to the course's next lesson", () => {
		assert.equal(pickUpLine(noArcs), null);
	});
});

describe("a map of one arc", () => {
	it("draws the arc's topics whole and its entry topics, the needs between them only", () => {
		const view = arcView(ARCS.map, a("eigenvalues"));
		assert.deepEqual(view.map.topics.map((t) => t.handle), ["rank", "eigen", "diag"]);
		assert.deepEqual([...view.entry], [["rank", "Linear systems"]]);
		assert.deepEqual(
			view.map.edges.map((e) => (e.kind === "needs" ? `${e.prerequisite}>${e.topic}` : "")),
			["rank>eigen", "eigen>diag"],
		);
		assert.equal(arcView(ARCS.map, undefined).map, ARCS.map, "no arc draws the whole course");
	});

	it("holds the entry topics in the top layer, and drops an entry's need a longer path in the drawing carries", () => {
		const map = { ...ARCS.map, arcs: [...ARCS.map.arcs!.slice(0, 2), arc("eigenvalues", "Eigenvalues", "learning", ["rank", "independence"])], edges: [...EDGES, ...needs([["independence", "diag"]])] };
		const view = arcView(map, a("eigenvalues"));
		const drawn = view.map.edges.map((e) => (e.kind === "needs" ? `${e.prerequisite}>${e.topic}` : ""));
		assert.ok(!drawn.includes("independence>rank"), "no need between two entry topics");
		assert.ok(drawn.includes("independence>diag"), "an entry need nothing else in the drawing carries stays");
		const carried = arcView({ ...map, edges: [...map.edges, ...needs([["rank", "diag"]])] }, a("eigenvalues")).map.edges;
		assert.ok(!carried.some((e) => e.kind === "needs" && e.prerequisite === "rank" && e.topic === "diag"), "Rank reaches Diagonalization through Eigenvalues");
		const { layout } = drawingOf(map, a("eigenvalues"));
		assert.deepEqual([...layout.layers[0]!].sort(), ["independence", "rank"]);
	});

	it("fades each entry topic's card and captions it with the arc it comes from; the arc's own cards say where he stands", () => {
		const document = render(<TopicMap map={ARCS.map} arc={a("eigenvalues")} said={new Map()} />);
		const nodes = [...document.querySelectorAll('[data-slot="course-map-node"]')];
		assert.deepEqual(nodes.map((n) => n.getAttribute("data-testid")).sort(), ["map-node-diag", "map-node-eigen", "map-node-rank"]);
		const rank = document.querySelector('[data-testid="map-node-rank"]')!;
		assert.equal(rank.getAttribute("data-entry"), "true");
		assert.equal(text(rank.querySelector('[data-slot="topic-from"]')), "From Linear systems");
		assert.match(cardOf(rank).getAttribute("style") ?? "", /opacity:\s*0?\.\d/);
		const eigen = document.querySelector('[data-testid="map-node-eigen"]')!;
		assert.equal(eigen.getAttribute("data-entry"), null);
		assert.ok(eigen.querySelector('[data-slot="topic-from"]') === null);
		assert.doesNotMatch(cardOf(eigen).getAttribute("style") ?? "", /opacity/);
	});

	it("lights a hovered topic's chain inside the shown arc only", () => {
		const view = arcView(ARCS.map, a("eigenvalues"));
		const drawn = new Set(view.map.topics.map((t) => t.handle));
		const lit = chainOf(h("diag"), view.map.edges);
		assert.deepEqual([...lit].sort(), ["diag", "eigen", "rank"]);
		assert.ok([...lit].every((t) => drawn.has(t)));
		assert.ok(chainOf(h("diag"), ARCS.map.edges).has(h("vectors")), "the whole course's chain reaches back further");
	});

	it("draws the whole course for a course without arcs, as before", () => {
		const document = render(<TopicMap map={noArcs.map} said={new Map()} />);
		assert.equal(document.querySelectorAll('[data-slot="course-map-node"]').length, noArcs.map.topics.length);
		assert.equal(document.querySelectorAll('[data-entry]').length, 0);
	});
});

describe("Home's map", () => {
	const home = (workspace: string, highlight: ReadonlySet<TopicHandle> | null = null, arc?: ArcHandle | null) =>
		render(<HomeMap courses={[ARCS, PROB]} chats={[]} workspace={workspace} onSelect={noop} highlight={highlight} arc={arc} enlarged={false} onEnlarge={noop} />);
	const on = (document: Document) => document.querySelector('[data-slot="arc-index-row"][data-shown]')?.getAttribute("data-arc");
	const shown = (document: Document) => document.querySelector('[data-slot="home-map-course"][data-shown]')!;

	it("draws the arc he is in, with every arc listed beside it", () => {
		const document = home(ARCS.map.workspace);
		assert.equal(on(document), "systems");
		assert.deepEqual([...document.querySelectorAll('[data-slot="arc-index-row"]')].map((r) => r.getAttribute("data-arc")), ["spaces", "systems", "eigenvalues"]);
		assert.deepEqual(
			[...shown(document).querySelectorAll('[data-slot="course-map-node"]')].map((n) => n.getAttribute("data-testid")).sort(),
			["map-node-det", "map-node-independence", "map-node-rank"],
		);
	});

	it("follows the Today row he points at to its topics' arc", () => {
		const document = home(ARCS.map.workspace, new Set([h("eigen")]));
		assert.equal(on(document), "eigenvalues");
		assert.equal(litArc(ARCS, new Set([h("eigen"), h("vectors")])), undefined, "a review across arcs names none");
		assert.equal(litArc(ARCS, null), undefined);
	});

	it("shows the arc Home's follow names, and the arc of You are here once it names none", () => {
		assert.equal(on(home(ARCS.map.workspace, null, a("eigenvalues"))), "eigenvalues");
		assert.equal(on(home(ARCS.map.workspace, new Set([h("eigen")]), null)), "systems", "the follow's null wins over the lit topics");
		assert.equal(on(home(ARCS.map.workspace, null, a("not-an-arc"))), "systems", "an arc the course lacks shows where he is");
		const course = home(ARCS.map.workspace, null, a("eigenvalues")).querySelector('[data-slot="home-map-course"][data-shown]')!;
		assert.ok(course.querySelector('[data-testid="map-node-diag"]'), "the map draws the followed arc");
	});

	it("shows a course without arcs whole, with no arc list", () => {
		const document = home(PROB.map.workspace);
		assert.ok(document.querySelector('[data-slot="arc-index"]') === null);
		assert.equal(shown(document).querySelectorAll('[data-slot="course-map-node"]').length, PROB.map.topics.length);
	});
});
