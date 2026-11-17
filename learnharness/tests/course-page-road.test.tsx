/**
 * The course page as a road to its exam (course-page/road/road.md): the
 * head says where he stands for the exam as one fact and never a pill per
 * arc, with one line under the title and Now under it holding the press;
 * the road lists the arcs in study order on a track with the exam a stop on
 * it; the topic page's head is the course head's twin. Same tsx classic-JSX
 * shim as the other render tests.
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
import { CourseHead } from "../components/course-page/course-head/course-head.tsx";
import { CourseNow } from "../components/course-page/course-head/course-now.tsx";
import { RoadArc, type ArcLineProps } from "../components/course-page/road/road-arc.tsx";
import { ArcMap } from "../components/course-map/arc-map.tsx";
import { courseComposerPlaceholder } from "../components/course-page/course-composer.tsx";
import { arcStarts, examStop } from "../components/course-page/road/road-model.ts";
import { ReadyFact } from "../components/course-page/course-head/ready-fact.tsx";
import { SplitList } from "../components/course-page/split/split-list.tsx";
import { TopicHead } from "../components/unit-inbox/topic-page/topic-head.tsx";
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

describe("the course head", () => {
	const view = viewOf(course());

	it("says where he stands for the exam as one fact, never a pill per arc", () => {
		for (const standing of [NOT_READY, SOME_READY]) {
			const head = render(<CourseHead {...columns(view, standing)} />);
			assert.ok(head.querySelector('[data-slot="arc-pill"]') === null, "no arc pill in the head");
			assert.equal(head.querySelectorAll('[data-slot="course-ready-fact"]').length, 1, "one readiness fact");
			assert.equal(text(head.querySelector('[data-slot="course-ready-fact"]')), READY_FACT_WORDS.notYet);
		}
	});

	it("takes one line's room under the title", () => {
		assert.match(render(<CourseHead {...columns(view, NOT_READY)} />).querySelector('[data-slot="page-lines"]')!.className, /\bmin-h-5\b/);
	});

	it("leaves the press to Now, under the head", () => {
		const head = render(
			<>
				<CourseHead {...columns(view, NOT_READY)} />
				<CourseNow {...columns(view, NOT_READY)} />
			</>,
		);
		assert.ok(head.querySelector('[data-slot="page-head"] [data-slot="course-action"]') === null, "no press in the head");
		const now = head.querySelector('[data-slot="course-now"] [data-slot="course-action"]');
		assert.ok(now, "Now holds the press");
		assert.match(text(now), /Continue|Start|Review|Resume/);
		assert.ok(head.querySelector('[data-slot="course-now"] [data-slot="arc-pill"]') === null, "no pill in Now");
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

	it("is the course's one list of arcs, drawn as the map's arc list draws its rows, so the map beside it lists none", () => {
		const view = viewOf(course());
		const line = (props: ArcLineProps) => <RoadArc {...props} number={view.arcs!.indexOf(props.section) + 1} starts={null} shown={props.section.arc.handle === "maps"} />;
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

	it("opens on Now alone across the page, and closes on New lesson's composer with this course chosen", () => {
		const view = viewOf(course());
		const now = render(<CourseNow {...columns(view)} />);
		assert.equal(now.querySelectorAll('[data-slot="course-now"] [data-slot="course-action"]').length, 1, "Now, the step to take up with its press, alone");
		assert.equal(courseComposerPlaceholder("Linear Algebra"), "Name a topic, ask a question or paste a problem in Linear Algebra");
	});
});

describe("the topic page's head, the course head's twin", () => {
	const facts = {
		course: { workspace: "/study/linalg", title: "Linear Algebra" },
		arc: { handle: a("maps"), title: "Linear maps", share: 0.5 },
		topic: topic("rank"),
		today: "2026-11-08",
		standing: { fill: 0.5, words: "Partly right" },
		marks: [{ kind: "slip", words: "Mistake to fix", slip: "gap" }],
		mistake: null,
	} as unknown as TopicFacts;

	it("puts the title first, level with the course page's, and links the course and the arc as words, never a pill", () => {
		const head = render(<TopicHead facts={facts} />);
		assert.ok(head.querySelector('[data-slot="page-eyebrow"]') === null, "no line above the title");
		assert.ok(head.querySelector('[data-slot="arc-pill"]') === null);
		assert.equal(head.querySelector('[data-slot="topic-course-link"]')?.getAttribute("href"), "/unit/" + Buffer.from("/study/linalg").toString("base64url"));
		assert.match(head.querySelector('[data-slot="topic-arc-link"]')?.getAttribute("href") ?? "", /\?arc=maps$/);
		assert.equal(text(head.querySelector('[data-kind="standing"]')).replace(". ", ""), "Partly right");
	});

	it("runs the place and the standing on one compact line", () => {
		const head = render(<TopicHead facts={facts} />);
		assert.match(head.querySelector('[data-slot="page-lines"]')!.className, /\bmin-h-5\b/);
		assert.ok(head.querySelector('[data-slot="page-standing"] [data-slot="topic-place"]'), "the place on the standing's line");
	});
});
