/**
 * Arcs on the course page, its map and Home's map: the page leads with
 * the course's arcs (a folded line each, where he is open, "Needs you"
 * only for what Today takes up, Check it only on a ready arc), the head
 * names the arc he is in, the arc strip names every arc as pills, Home's
 * map shows the arc its follow names, a map draws one
 * arc with what it builds on faded and captioned in its top layer, and
 * its lit chain stays inside that arc. A course without arcs, or with
 * one, shows exactly as before. Same tsx classic-JSX shim as the other
 * render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle, CourseMapEdge, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { CHATS, LINALG, LINALG_ARCS, PROB, arc } from "./fixtures/now-demo.ts";
import { courseArcs, courseGroups, courseRead, openingArc, shownArcs, whatNext } from "../components/course-page/course-model.ts";
import { PICK_UP_WORDS, THEN_WORDS, WhatNextRows } from "../components/course-page/what-next.tsx";
import { arcLineWords, CHECK_WORDS } from "../components/course-page/course-arc.tsx";
import { SplitList } from "../components/course-page/split/split-list.tsx";
import { OPEN_AT_FIRST, shownGroups, walkStops } from "../components/course-page/split/split-tie.ts";
import { CourseHead } from "../components/course-page/course-head/course-head.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { ArcPill, ArcStrip } from "../components/course-map/arc-strip.tsx";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import { TopicMap } from "../components/course-map/topic-map/topic-map.tsx";
import { arcView } from "../components/course-map/topic-map/arc-view.ts";
import { chainOf, layoutTopicMap, TOPIC_NODE_SIZE } from "../components/course-map/topic-map/topic-map-layout.ts";
import { HomeMap, litArc } from "../components/study-home/home-map.tsx";
import { ARC_EXAM_WORDS, ARC_STATE_WORDS } from "../components/study-words.ts";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
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

	it("says Needs you only for an arc one of whose topics Today takes up, else where the arc stands", () => {
		const sections = courseArcs(ARCS)!;
		const words = Object.fromEntries(sections.map((s) => [s.arc.handle, arcLineWords(s).words]));
		assert.equal(words.spaces, "Needs you", "Linear independence's overdue review is Today's");
		assert.equal(words.systems, ARC_STATE_WORDS.learning, "Rank slips, but Today does not take it up, so it stays a slip in Learning");
		assert.equal(sections.find((s) => s.arc.handle === "systems")!.topics.find((t) => t.topic.handle === "rank")!.group, "learning");
		assert.equal(words.eigenvalues, ARC_STATE_WORDS.learning);
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

describe("the list's arc lines", () => {
	const sections = courseArcs(ARCS)!;
	const draw = (open: Record<string, boolean>, checks = true) =>
		render(<SplitList groups={[]} arcs={sections} open={open} onOpenChange={noop} onCheck={checks ? noop : undefined} marked={null} onPoint={noop} onEnterMap={noop} />);

	it("folds every arc but the open one to its line, in study order, and draws only the open arc's topics", () => {
		const document = draw({ systems: true });
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-arc-header"]')].map((b) => [text(b.querySelector('[data-slot="course-arc-title"]')), b.getAttribute("aria-expanded")]),
			[
				["Vector spaces", "false"],
				["Linear systems", "true"],
				["Eigenvalues", "false"],
			],
		);
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-topic-row"]')].map((r) => r.getAttribute("data-topic")),
			["rank", "det"],
		);
		assert.equal(document.querySelectorAll('[data-slot="course-group-header"]').length, 0, "no groups beside the arcs");
		assert.doesNotMatch(text(document.querySelector('[data-slot="course-arc-header"]')), /\d/, "no counts on a line");
	});

	it("ends each line in Needs you, in the slip's ink, or where the arc stands", () => {
		const document = draw({});
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-arc-state"]')].map((s) => [text(s), s.getAttribute("data-kind")]),
			[
				["Needs you", "needs-you"],
				[ARC_STATE_WORDS.learning, "learning"],
				[ARC_STATE_WORDS.learning, "learning"],
			],
		);
		assert.match(document.querySelector('[data-slot="course-arc-state"][data-kind="needs-you"]')!.className, /text-warning/);
	});

	it("ends every line's status on one right edge: the status is the line's last item, and Check it sits over it, out of the flow", () => {
		const document = draw({});
		for (const header of document.querySelectorAll('[data-slot="course-arc-header"]')) {
			const status = header.querySelector('[data-slot="course-arc-state"]')!;
			assert.equal(header.lastElementChild, status, "nothing follows the status in its line");
			assert.match(header.className, /flex-1/, "the line reaches the column's right edge");
			assert.match(status.className, /shrink-0/);
		}
		const check = document.querySelector('[data-slot="course-arc-check"]')!;
		assert.equal(check.closest('[data-slot="course-arc-header"]'), null, "Check it is not in the line's flow");
		assert.match(check.className, /\babsolute\b/);
		assert.match(check.className, /opacity-0/, "folded, it shows only on hover or keyboard focus");
		assert.match(check.className, /group-hover\/sidebar-row:opacity-100/);
		assert.match(document.querySelector('[data-arc="spaces"] [data-slot="course-arc-state"]')!.className, /group-hover\/sidebar-row:opacity-0/, "the status gives way to it in place");
		const open = draw({ spaces: true });
		assert.match(open.querySelector('[data-slot="course-arc-check"]')!.className, /pointer-events-auto opacity-100/, "open, the arc's head holds Check it");
		assert.match(open.querySelector('[data-arc="spaces"] [data-slot="course-arc-state"]')!.className, /opacity-0/);
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
		const quiet = render(<SplitList groups={[]} arcs={noneReady} open={{}} onOpenChange={noop} onCheck={noop} marked={null} onPoint={noop} onEnterMap={noop} />);
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
		const document = render(<SplitList groups={shownGroups(courseGroups(noArcs))} open={OPEN_AT_FIRST} onOpenChange={noop} marked={null} onPoint={noop} onEnterMap={noop} />);
		assert.equal(document.querySelectorAll('[data-slot="course-arc"]').length, 0);
		assert.ok(document.querySelectorAll('[data-slot="course-group-header"]').length > 0);
	});
});

describe("the course head", () => {
	const viewOf = (c: StudyCourse) => {
		const read = courseRead({ status: "ready", courses: [c], failed: [], open: [], chats: [] }, c.map.workspace);
		assert.equal(read.status, "ready");
		return (read as Extract<typeof read, { status: "ready" }>).view;
	};

	it("names the arc he is in first on its quiet row, and nothing for a course the page shows without arcs", () => {
		const head = render(<CourseHead view={viewOf(ARCS)} standing={null} busy={false} onContinue={noop} />);
		const standing = head.querySelector('[data-slot="page-standing"]')!;
		assert.equal(text(standing.firstElementChild), "Linear systems");
		assert.equal(standing.firstElementChild?.getAttribute("data-slot"), "course-arc-here");
		const pill = standing.firstElementChild!.querySelector('[data-slot="arc-pill"]')!;
		assert.ok(pill, "the arc is a pill, never text beside the facts");
		assert.equal(pill.getAttribute("href"), `${courseHref(ARCS.map.workspace)}?arc=systems`, "it shows that arc on the page");
		for (const c of [noArcs, oneArc]) assert.equal(render(<CourseHead view={viewOf(c)} standing={null} busy={false} onContinue={noop} />).querySelector('[data-slot="course-arc-here"]'), null);
	});
});

describe("the arc strip", () => {
	it("names every arc in study order as pills, the shown one on, each with its ring and no count", () => {
		const document = render(
			<ArcStrip
				arcs={courseArcs(ARCS)!.map((s) => ({ handle: s.arc.handle, title: s.arc.title, share: s.share }))}
				value={a("systems")}
				onSelect={noop}
			/>,
		);
		const tabs = [...document.querySelectorAll('[data-slot="arc-strip"] [data-slot="toggle-group-item"]')];
		assert.deepEqual(
			tabs.map((t) => [text(t), t.getAttribute("data-state")]),
			[
				["Vector spaces", "off"],
				["Linear systems", "on"],
				["Eigenvalues", "off"],
			],
		);
		assert.equal(document.querySelector('[data-slot="arc-strip"]')?.getAttribute("data-variant"), "pill", "bubbles, never the course tabs' underline");
		assert.ok(tabs.every((t) => /rounded-full/.test(t.className)));
		assert.ok(tabs.every((t) => t.querySelector("svg")), "each arc wears its ring");
		assert.doesNotMatch(text(document.body), /\d/);
	});

	it("keeps each name whole by wrapping onto another row, never by squeezing or clipping the pills (round 6: Sam…, De…)", () => {
		const long = ["Sampling distributions", "Point estimation and confidence intervals", "Efficiency, sufficiency and the method of moments", "Hypothesis testing"];
		const document = render(<ArcStrip arcs={long.map((title, i) => ({ handle: a(`arc${i}`), title, share: null }))} value={a("arc0")} onSelect={noop} />);
		const strip = document.querySelector('[data-slot="arc-strip"]')!;
		assert.match(strip.className, /\bflex-wrap\b/);
		assert.doesNotMatch(strip.className, /overflow-(hidden|x-auto|scroll)/, "no clip and no scrollbar");
		const tabs = [...strip.querySelectorAll('[data-slot="toggle-group-item"]')];
		assert.ok(tabs.every((t) => /\bshrink-0\b/.test(t.className) && !/\bshrink\b(?!-)/.test(t.className)), "a pill never shrinks below its name");
		assert.deepEqual(tabs.map((t) => t.querySelector('[data-slot="arc-name"]')?.textContent), long, "each name whole in the markup");
	});
});

describe("the arc pill", () => {
	it("is the strip's pill: the pill variant with the arc's ring, a link when it goes somewhere", () => {
		const document = render(
			<>
				<ArcPill arc={{ handle: a("spaces"), title: "Vector spaces", share: 0.5 }} href="/x" />
				<ArcPill arc={{ handle: a("systems"), title: "Linear systems", share: null }} />
			</>,
		);
		const [linked, plain] = [...document.querySelectorAll('[data-slot="arc-pill"]')];
		assert.equal(linked!.tagName, "A");
		assert.equal(linked!.getAttribute("href"), "/x");
		assert.match(linked!.className, /rounded-full/);
		assert.ok(linked!.querySelector("svg"), "its ring");
		assert.equal(plain!.tagName, "SPAN");
		assert.equal(plain!.querySelector("svg"), null, "no ring for an arc with no topic live");
	});
});

describe("what next, above the arcs", () => {
	const planned: StudyCourse = {
		...ARCS,
		map: { ...ARCS.map, topics: ARCS.map.topics.map((t) => (t.handle === "diag" ? { ...t, starts: "2026-11-10", startsWhy: { kind: "after" as const, arc: a("eigenvalues"), needs: [h("eigen")], partners: [] } } : t)) },
	};

	it("picks up what Home's Today puts first for the course, naming its arc, even when that is a slip in another arc than where he is", () => {
		const next = whatNext(ARCS)!;
		assert.equal(next.pickUp?.line.title, "Review Linear independence");
		assert.equal(next.pickUp?.line.why?.short, "Due since 4 Nov");
		assert.equal(next.pickUp?.arc?.handle, "spaces", "You are here is in Linear systems");
		const waiting = whatNext(ARCS, CHATS)!;
		assert.equal(waiting.pickUp?.line.why?.short, "Your turn", "a session waiting on him comes first, as on Today");
		assert.equal(waiting.pickUp?.arc?.handle, "eigenvalues");
	});

	it("then names the next new topic the plan starts, with why then as Today's rows say it", () => {
		const next = whatNext(planned)!;
		assert.equal(next.then?.topic.handle, "diag");
		assert.equal(next.then?.why, "After Eigenvalues and eigenvectors", "as Today's rows say it");
		assert.equal(next.then?.arc?.handle, "eigenvalues");
	});

	it("draws at most two rows, Today's row style, each arc as its pill, and no counts", () => {
		const document = render(<WhatNextRows next={whatNext(planned)} course={planned} busy={false} onContinue={noop} />);
		const rows = [...document.querySelectorAll('[data-slot="what-next"] > li')];
		assert.equal(rows.length, 2);
		assert.match(text(rows[0]), new RegExp(`^${PICK_UP_WORDS}`));
		assert.match(text(rows[1]), new RegExp(`^${THEN_WORDS}`));
		assert.deepEqual(
			rows.map((r) => r.querySelector('[data-slot="arc-pill"]')?.getAttribute("data-arc") ?? null),
			["spaces", "eigenvalues"],
		);
		assert.equal(document.querySelectorAll('[data-slot="today-why"]').length, 2, "each row ends in its reason's icon and words");
		assert.equal(document.querySelector('[data-slot="what-next-then"]')?.getAttribute("href"), "/unit/" + courseHref(planned.map.workspace).split("/unit/")[1] + "/diag");
		assert.doesNotMatch(text(document.body), /·/, "an arc is never named as text");
	});

	it("leaves out the arc's pill when the reason already names it", () => {
		const named: StudyCourse = { ...planned, map: { ...planned.map, topics: planned.map.topics.map((t) => (t.handle === "diag" ? { ...t, startsWhy: { kind: "next" as const, arc: a("eigenvalues") } } : t)) } };
		const document = render(<WhatNextRows next={whatNext(named)} course={named} busy={false} onContinue={noop} />);
		const then = document.querySelector('[data-slot="what-next-then"]')!;
		assert.match(text(then), /Next in Eigenvalues/);
		assert.equal(then.querySelector('[data-slot="arc-pill"]'), null);
	});

	it("says Then goes back to an earlier arc once a lesson moved You are here past it, so the head's arc and Then never disagree (round 6)", () => {
		const ahead: StudyCourse = {
			...ARCS,
			map: {
				...ARCS.map,
				current: h("eigen"),
				topics: ARCS.map.topics.map((t) => (t.handle === "det" ? { ...t, introduced: null, level: "new" as const, review: null, starts: "2026-11-09", startsWhy: { kind: "next" as const, arc: a("systems") } } : t)),
			},
		};
		assert.equal(courseArcs(ahead)!.find((s) => s.current)?.arc.handle, "eigenvalues", "the head names Eigenvalues");
		const next = whatNext(ahead)!;
		assert.equal(next.then?.topic.handle, "det");
		assert.equal(next.then?.why, "Back to Linear systems");
		const then = render(<WhatNextRows next={next} course={ahead} busy={false} onContinue={noop} />).querySelector('[data-slot="what-next-then"]')!;
		assert.doesNotMatch(text(then), /Next in/);
		assert.equal(then.querySelector('[data-slot="arc-pill"]'), null, "the words name the arc");
	});

	it("says nothing for a course without arcs, or with nothing to pick up and nothing planned", () => {
		assert.equal(whatNext(noArcs), null);
		const quiet: StudyCourse = { ...ARCS, map: { ...ARCS.map, topics: ARCS.map.topics.map((t) => ({ ...t, review: null, weak: false, tasks: [] })), tasks: [], focus: null }, due: [], unready: [] };
		const next = whatNext(quiet);
		assert.ok(next === null || next.then === null, "no planned start, no Then row");
		assert.equal(render(<WhatNextRows next={null} course={ARCS} busy={false} onContinue={noop} />).querySelector('[data-slot="what-next"]'), null);
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
		const layout = layoutTopicMap(view.map.topics, view.map.edges, TOPIC_NODE_SIZE, new Set(view.entry.keys()));
		assert.deepEqual([...layout.layers[0]!].sort(), ["independence", "rank"]);
	});

	it("fades each entry topic's card and captions it with the arc it comes from; the arc's own cards say where he stands", () => {
		const document = render(<TopicMap map={ARCS.map} arc={a("eigenvalues")} said={new Map()} />);
		const nodes = [...document.querySelectorAll('[data-slot="course-map-node"]')];
		assert.deepEqual(nodes.map((n) => n.getAttribute("data-testid")).sort(), ["map-node-diag", "map-node-eigen", "map-node-rank"]);
		const rank = document.querySelector('[data-testid="map-node-rank"]')!;
		assert.equal(rank.getAttribute("data-entry"), "true");
		assert.equal(text(rank.querySelector('[data-slot="topic-from"]')), "From Linear systems");
		assert.match(rank.parentElement!.getAttribute("style") ?? "", /opacity:\s*0?\.\d/);
		const eigen = document.querySelector('[data-testid="map-node-eigen"]')!;
		assert.equal(eigen.getAttribute("data-entry"), null);
		assert.equal(eigen.querySelector('[data-slot="topic-from"]'), null);
		assert.doesNotMatch(eigen.parentElement!.getAttribute("style") ?? "", /opacity/);
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
	const on = (document: Document) => document.querySelector('[data-slot="arc-strip"] [data-state="on"]')?.getAttribute("data-arc");
	const shown = (document: Document) => document.querySelector('[data-slot="home-map-course"][data-shown]')!;

	it("draws the arc he is in, with the arc strip under the course tabs", () => {
		const document = home(ARCS.map.workspace);
		assert.equal(document.querySelector('[data-slot="arc-strip"] [data-state="on"]')?.getAttribute("data-arc"), "systems");
		assert.deepEqual(
			[...shown(document).querySelectorAll('[data-slot="course-map-node"]')].map((n) => n.getAttribute("data-testid")).sort(),
			["map-node-det", "map-node-independence", "map-node-rank"],
		);
	});

	it("follows the Today row he points at to its topics' arc", () => {
		const document = home(ARCS.map.workspace, new Set([h("eigen")]));
		assert.equal(document.querySelector('[data-slot="arc-strip"] [data-state="on"]')?.getAttribute("data-arc"), "eigenvalues");
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

	it("shows a course without arcs whole, with no strip", () => {
		const document = home(PROB.map.workspace);
		assert.equal(document.querySelector('[data-slot="arc-strip"]'), null);
		assert.equal(shown(document).querySelectorAll('[data-slot="course-map-node"]').length, PROB.map.topics.length);
	});
});
