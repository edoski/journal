/**
 * The course page's three candidates (course-page/candidates/candidates.md):
 * each head says where he stands for the exam as one fact and never a pill
 * per arc, Agenda's and Road's heads take one line under the title, and
 * each left column keeps its own organisation: Overview's quiet arc lines,
 * Agenda's Now, Then and the arc the map shows, Road's arcs on a track with
 * the exam a stop on it. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRef } from "react";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle, CourseMapTopic, CourseReadiness, CourseStanding, ReadinessPart, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead, type CourseView } from "../components/course-page/course-model.ts";
import type { CourseColumns } from "../components/course-page/split/split-course.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { OverviewHead } from "../components/course-page/candidates/overview/overview-head.tsx";
import { OverviewArc } from "../components/course-page/candidates/overview/overview-arc.tsx";
import { AgendaHead } from "../components/course-page/candidates/agenda/agenda-head.tsx";
import { AgendaArc } from "../components/course-page/candidates/agenda/agenda-arc.tsx";
import { AgendaNext } from "../components/course-page/candidates/agenda/agenda-next.tsx";
import { RoadCourse } from "../components/course-page/candidates/road/road-course.tsx";
import { RoadArc } from "../components/course-page/candidates/road/road-arc.tsx";
import { ArcMap } from "../components/course-map/arc-map.tsx";
import { arcStarts, examStop } from "../components/course-page/candidates/road/road-model.ts";
import { ReadyFact } from "../components/course-page/candidates/shared/ready-fact.tsx";
import { SplitList } from "../components/course-page/split/split-list.tsx";
import { TopicTwinHead } from "../components/course-page/candidates/shared/topic-twin.tsx";
import type { TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { examReady } from "../components/course-page/standing/standing-model.ts";
import { ARC_EXAM_WORDS, READY_FACT_WORDS } from "../components/study-words.ts";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle[0]!.toUpperCase() + handle.slice(1), level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });

/** Linear Algebra in three arcs: Vector spaces ready for its check, Linear
 *  maps where he is, Eigenvalues not started, its first topic planned 20 Nov. */
function course(over: Partial<StudyCourse["map"]> = {}): StudyCourse {
	return {
		map: {
			workspace: "/study/linalg",
			title: "Linear Algebra",
			today: "2026-11-08",
			revision: 1,
			exam: { date: "2026-12-03", daysLeft: 25 },
			current: h("rank"),
			focus: null,
			tasks: [],
			topics: [
				topic("span", { level: "retained", arc: a("spaces") }),
				topic("basis", { level: "retained", arc: a("spaces") }),
				topic("rank", { arc: a("maps") }),
				topic("kernel", { level: "new", introduced: null, arc: a("maps"), starts: "2026-11-12" }),
				topic("eigen", { level: "new", introduced: null, arc: a("eigen"), starts: "2026-11-20" }),
				topic("diag", { level: "new", introduced: null, arc: a("eigen"), starts: "2026-11-24" }),
			],
			edges: [],
			arcs: [
				{ handle: a("spaces"), title: "Vector spaces", state: "ready", entry: [] },
				{ handle: a("maps"), title: "Linear maps", state: "learning", entry: [] },
				{ handle: a("eigen"), title: "Eigenvalues", state: "new", entry: [] },
			],
			...over,
		},
		unready: null,
		due: [],
		lastActiveDaysAgo: 0,
		newToday: [],
	};
}

function viewOf(c: StudyCourse): CourseView {
	const read = courseRead({ status: "ready", courses: [c], failed: [], open: [], chats: [] }, c.map.workspace);
	assert.equal(read.status, "ready");
	return (read as Extract<typeof read, { status: "ready" }>).view;
}

const part = (over: Partial<ReadinessPart>): ReadinessPart => ({ solid: [], notYet: [], toStart: [], wontFit: [], ...over });
const readiness = (...parts: ReadinessPart[]): CourseReadiness => ({ date: "2026-12-03", daysLeft: 25, parts });
/** Every arc not ready yet, as Linear Algebra's demo course stands. */
const NOT_READY: CourseStanding = {
	readiness: readiness(part({ arc: a("spaces"), notYet: [h("basis")] }), part({ arc: a("maps"), notYet: [h("rank")] }), part({ arc: a("eigen"), toStart: [h("eigen")] })),
	mistakes: [],
} as unknown as CourseStanding;
/** Some arcs not ready: Linear maps and Eigenvalues. */
const SOME_READY: CourseStanding = {
	readiness: readiness(part({ arc: a("spaces"), solid: [h("span"), h("basis")] }), part({ arc: a("maps"), notYet: [h("rank")] }), part({ arc: a("eigen"), toStart: [h("eigen")] })),
	mistakes: [],
} as unknown as CourseStanding;

const noop = () => {};
const columns = (view: CourseView, standing: CourseStanding | null = null): CourseColumns => ({
	view,
	standing,
	busy: false,
	onContinue: noop,
	groups: view.groups,
	shown: view.arcs?.find((s) => s.current) ?? null,
	showArc: noop,
	open: { maps: true },
	onOpenChange: noop,
	onCheck: noop,
	checking: null,
	marked: null,
	onPoint: noop,
	listRef: createRef(),
	onEnterMap: noop,
	onExitTop: noop,
});

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close: () => {} }) as never}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;
const text = (el: Element | null | undefined) => el?.textContent ?? "";

describe("the candidates' heads", () => {
	const view = viewOf(course());
	const heads = { overview: OverviewHead, agenda: AgendaHead } as const;

	it("say where he stands for the exam as one fact, never a pill per arc", () => {
		for (const [name, Head] of Object.entries(heads)) {
			for (const standing of [NOT_READY, SOME_READY]) {
				const head = render(<Head {...columns(view, standing)} />);
				assert.ok(head.querySelector('[data-slot="arc-pill"]') === null, `${name}: no arc pill in the head`);
				assert.equal(head.querySelectorAll('[data-slot="course-ready-fact"]').length, 1, `${name}: one readiness fact`);
				assert.equal(text(head.querySelector('[data-slot="course-ready-fact"]')), READY_FACT_WORDS.notYet);
			}
		}
	});

	it("give Agenda's head one line's room under the title, and Overview's the two its next step and facts fill", () => {
		const lines = (Head: (c: CourseColumns) => React.ReactNode) => render(<Head {...columns(view, NOT_READY)} />).querySelector('[data-slot="page-lines"]')!.className;
		assert.match(lines(AgendaHead), /\bmin-h-5\b/);
		assert.match(lines(OverviewHead), /\bmin-h-12\b/);
	});

	it("lead Overview's head with what the press takes up and why", () => {
		const head = render(<OverviewHead {...columns(view, NOT_READY)} />);
		const next = head.querySelector('[data-slot="page-lead"] [data-slot="course-next"]');
		assert.ok(next, "the next step under the title");
		assert.ok(head.querySelector('[data-slot="course-action"]'), "the press stays in the head");
	});

	it("leave Agenda's press to its Now row", () => {
		assert.ok(render(<AgendaHead {...columns(view, NOT_READY)} />).querySelector('[data-slot="course-action"]') === null);
		const now = render(<AgendaNext {...columns(view)} />).querySelector('[data-slot="agenda-now"]');
		assert.ok(now, "Now holds the press");
		assert.match(text(now), /Continue|Start|Review|Resume/);
	});
});

describe("the readiness fact", () => {
	it("says No exam for a course without one, Not all of it fits in the warning ink when the plan has no room", () => {
		const none = viewOf(course({ exam: null }));
		assert.equal(text(render(<ReadyFact view={none} ready={null} />).querySelector('[data-slot="course-ready-fact"]')), READY_FACT_WORDS.none);
		const view = viewOf(course());
		const short = examReady(readiness(part({ arc: a("eigen"), wontFit: [h("diag")] })), view.course.map, view.arcs, []);
		const fact = render(<ReadyFact view={view} ready={short} />).querySelector('[data-slot="course-ready-fact"]')!;
		assert.equal(text(fact), READY_FACT_WORDS.short);
		assert.match(fact.className, /text-warning/);
	});
});

describe("the candidates' left columns", () => {
	const view = viewOf(course());
	const list = (arcLine: typeof OverviewArc, arcs = view.arcs) =>
		render(<SplitList groups={[]} arcs={arcs} open={{ maps: true }} onOpenChange={noop} onCheck={noop} marked={null} onPoint={noop} onEnterMap={noop} arcLine={arcLine} />);

	it("Overview ends a line in words only when he has something to do there: Check it on a ready arc, Needs you where Today asks, nothing on the rest", () => {
		const document = list(OverviewArc);
		assert.ok(document.querySelector('[data-arc="spaces"] [data-slot="course-arc-check"]'), "Check it on the ready arc");
		for (const section of view.arcs!) {
			const state = document.querySelector(`[data-arc="${section.arc.handle}"] [data-slot="course-arc-state"]`);
			if (section.needsYou) assert.equal(state?.getAttribute("data-kind"), "needs-you");
			else assert.ok(state === null, `${section.arc.handle}: no status words`);
		}
		assert.ok(view.arcs!.some((s) => !s.needsYou && s.arc.state !== "ready"), "the fixture has a quiet line");
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-topic-row"]')].map((r) => r.getAttribute("data-topic")),
			["rank", "kernel"],
			"only the open arc's topics",
		);
	});

	it("Agenda shows only the arc the map shows, its name a quiet label over its topics", () => {
		const shown = view.arcs!.filter((s) => s.current);
		const document = list(AgendaArc, shown);
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-arc-title"]')].map(text),
			["Linear maps"],
		);
		assert.ok(document.querySelector('[data-slot="arc-pill"]') === null);
	});

	it("no candidate's list draws a pill per arc or per topic", () => {
		for (const line of [OverviewArc, AgendaArc]) assert.ok(list(line).querySelector('[data-slot="arc-pill"]') === null);
		assert.ok(render(<AgendaNext {...columns(view)} />).querySelector('[data-slot="arc-pill"]') === null);
	});
});

describe("the road", () => {
	it("puts the exam after the last arc it examines and the plan fits, the arcs past it after", () => {
		const view = viewOf(course());
		assert.deepEqual(examStop(view.course.map, view.arcs!), { stopBefore: null, past: new Set() }, "every arc before the exam: the stop closes the road");
		const left = viewOf(course({ exam: { date: "2026-12-03", daysLeft: 25, doesNotFit: [h("eigen"), h("diag")] } }));
		const stop = examStop(left.course.map, left.arcs!)!;
		assert.equal(stop.stopBefore, "eigen", "Eigenvalues has no room before the exam: the stop sits above it");
		assert.deepEqual([...stop.past], ["eigen"]);
		const off = viewOf(course({ exam: { date: "2026-12-03", daysLeft: 25, arcs: [a("spaces"), a("maps")] } }));
		assert.equal(off.arcs!.find((s) => s.arc.handle === "eigen")!.exam, ARC_EXAM_WORDS.none);
		assert.deepEqual([...examStop(off.course.map, off.arcs!)!.past], ["eigen"], "an arc the exam leaves out sits past it");
		assert.equal(examStop(viewOf(course({ exam: null })).course.map, view.arcs!), null, "no exam, no stop");
	});

	it("says when a not-started arc's first topic starts, and nothing for one under way", () => {
		const view = viewOf(course());
		assert.equal(arcStarts(view.arcs!.find((s) => s.arc.handle === "eigen")!, view.course.map.today), "Starts 20 Nov");
		assert.equal(arcStarts(view.arcs!.find((s) => s.arc.handle === "maps")!, view.course.map.today), null);
	});

	it("draws the course page's frame around it, as every candidate does", () => {
		assert.equal(typeof RoadCourse, "function");
	});

	it("is the course's one list of arcs, drawn as the map's arc list draws its rows, so the map beside it lists none", () => {
		const view = viewOf(course());
		const line = (props: React.ComponentProps<typeof OverviewArc>) => <RoadArc {...props} number={view.arcs!.indexOf(props.section) + 1} starts={null} shown={props.section.arc.handle === "maps"} />;
		const document = render(<SplitList groups={[]} arcs={view.arcs} open={{ maps: true }} onOpenChange={noop} onCheck={noop} marked={null} onPoint={noop} onEnterMap={noop} arcLine={line} />);
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-arc"] [data-slot="arc-number"]')].map((n) => n.textContent),
			view.arcs!.map((_, i) => String(i + 1)),
			"each arc numbered in study order, as the map's list numbers them",
		);
		assert.deepEqual([...document.querySelectorAll('[data-slot="road-bar"]')].map((b) => b.closest("[data-arc]")?.getAttribute("data-arc")), ["maps"], "the bar marks the arc the map shows");
		const map = render(
			<ArcMap arcs={view.arcs!.map((s) => s.arc)} value={a("maps")} here={a("maps")} index={false} onSelect={noop}>
				<div />
			</ArcMap>,
		);
		assert.ok(map.querySelector('[data-slot="arc-index"]') === null, "Road's map lists no arcs of its own");
	});
});

describe("the topic page's head beside the candidates", () => {
	const facts = {
		course: { workspace: "/study/linalg", title: "Linear Algebra" },
		arc: { handle: a("maps"), title: "Linear maps", share: 0.5 },
		topic: topic("rank"),
		today: "2026-11-08",
		standing: { fill: 0.5, words: "Partly right" },
		marks: [{ kind: "slip", words: "Mistake to fix", slip: "gap" }],
		studied: null,
		mistake: null,
	} as unknown as TopicFacts;

	it("puts the title first, level with the course page's, and links the course and the arc as words, never a pill", () => {
		for (const lines of ["one", "two"] as const) {
			const head = render(<TopicTwinHead facts={facts} lines={lines} />);
			assert.ok(head.querySelector('[data-slot="page-eyebrow"]') === null, "no line above the title");
			assert.ok(head.querySelector('[data-slot="arc-pill"]') === null);
			assert.equal(head.querySelector('[data-slot="topic-course-link"]')?.getAttribute("href"), "/unit/" + Buffer.from("/study/linalg").toString("base64url"));
			assert.match(head.querySelector('[data-slot="topic-arc-link"]')?.getAttribute("href") ?? "", /\?arc=maps$/);
			assert.equal(text(head.querySelector('[data-kind="standing"]')).replace(". ", ""), "Partly right");
		}
	});

	it("runs the place and the standing on one compact line for Agenda and Road, on two for Overview", () => {
		assert.match(render(<TopicTwinHead facts={facts} lines="one" />).querySelector('[data-slot="page-lines"]')!.className, /\bmin-h-5\b/);
		const two = render(<TopicTwinHead facts={facts} lines="two" />);
		assert.ok(two.querySelector('[data-slot="page-lead"] [data-slot="topic-place"]'), "the place on its own line");
		assert.ok(two.querySelector('[data-slot="page-standing"] [data-slot="topic-place"]') === null);
	});
});
