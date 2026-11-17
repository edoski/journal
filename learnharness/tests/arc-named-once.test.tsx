/**
 * An arc is named one way (components/course-map/arc-label.md): its number
 * in study order and its whole name, muted, never a pill and no ring. The
 * same arc reads the same in the map's arc list, the course page's road,
 * the open mistakes, the readiness answer, the exam's run-up and the
 * lesson's roadmap (round 14's finding 5: the mistakes showed a pill with
 * a ring, the roadmap a ringless pill, the readiness answer a ring and a
 * title). Mounted on the real Radix layers, so the popovers open.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
// Next's Link schedules its prefetch on `self`, which the test DOM lacks.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { lessonPlaceOf, type ArcHandle, type CourseMapTopic, type CourseReadiness, type CourseStanding, type ReadinessPart, type StudyCourse, type TopicHandle } from "../src/core/index.ts";
import { courseRead, type CourseView } from "../components/course-page/course-model.ts";
import { ArcIndex } from "../components/course-map/arc-index.tsx";
import { SplitList } from "../components/course-page/split/split-list.tsx";
import { RoadArc, type ArcLineProps } from "../components/course-page/road/road-arc.tsx";
import { MistakeList } from "../components/course-page/standing/mistake-list.tsx";
import { examReady, mistakeRows } from "../components/course-page/standing/standing-model.ts";
import { ReadyFact } from "../components/course-page/course-head/ready-fact.tsx";
import { ExamFact } from "../components/course-page/course-head/head-parts.tsx";
import { LessonRoadmap } from "../components/lesson/lesson-roadmap.tsx";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle[0]!.toUpperCase() + handle.slice(1), level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });

/** Linear Algebra in three arcs; Rank, in Linear maps (the second), has a mistake open and is not yet solid. */
const COURSE: StudyCourse = {
	map: {
		workspace: "/study/linalg",
		title: "Linear Algebra",
		today: "2026-11-08",
		revision: 1,
		exam: { date: "2026-12-03", daysLeft: 25 },
		current: h("span"),
		focus: null,
		tasks: [],
		topics: [topic("span", { level: "retained", arc: a("spaces") }), topic("rank", { arc: a("maps") }), topic("eigen", { level: "new", introduced: null, arc: a("eigen") })],
		edges: [],
		arcs: [
			{ handle: a("spaces"), title: "Vector spaces", state: "learning", entry: [] },
			{ handle: a("maps"), title: "Linear maps", state: "learning", entry: [] },
			{ handle: a("eigen"), title: "Eigenvalues", state: "new", entry: [] },
		],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};
const READINESS: CourseReadiness = {
	date: "2026-12-03",
	daysLeft: 25,
	parts: ([["spaces", { solid: [h("span")] }], ["maps", { notYet: [h("rank")] }], ["eigen", { solid: [] }]] as const).map(([arc, over]): ReadinessPart => ({ arc: a(arc), solid: [], notYet: [], toStart: [], wontFit: [], ...over })),
};
const STANDING: CourseStanding = {
	readiness: READINESS,
	mistakes: [{ topic: h("rank"), gap: "You count the vectors, not the dimension of their span", latest: "2026-11-08", answers: [] }],
};

function viewOf(c: StudyCourse): CourseView {
	const read = courseRead({ status: "ready", courses: [c], failed: [], open: [], chats: [] }, c.map.workspace);
	assert.equal(read.status, "ready");
	return (read as Extract<typeof read, { status: "ready" }>).view;
}

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
});

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const noop = () => {};

async function mount(node: React.ReactNode, open?: string) {
	await act(async () => root?.unmount());
	document.body.innerHTML = "";
	const host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				{node}
			</AppRouterContext.Provider>,
		),
	);
	if (open) {
		await act(async () => {
			document.querySelector(open)!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
		});
	}
}

/** How the arc `handle` reads on the page now: its slot, number, name and classes, as strings. */
function reading(handle: string, where: string) {
	const labels = [...document.querySelectorAll(`[data-arc="${handle}"]`)].filter((n) => n.getAttribute("data-slot") !== "course-arc" && n.getAttribute("data-slot") !== "arc-index-row");
	assert.equal(labels.length, 1, `${where} names the arc once: ${labels.map((n) => n.getAttribute("data-slot")).join(", ")}`);
	const label = labels[0]!;
	return {
		slot: label.getAttribute("data-slot"),
		number: label.querySelector('[data-slot="arc-number"]')?.textContent ?? null,
		text: label.textContent,
		classes: (label.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
		inner: [...label.children].map((c) => c.getAttribute("class")),
		pill: document.querySelector('[data-slot="arc-pill"]') !== null,
		ring: document.querySelector('svg [data-part="outline"]') !== null,
	};
}

describe("an arc is named one way", () => {
	it("reads the same in the map's arc list, the road, the mistakes, the readiness answer, the exam's run-up and the lesson's roadmap", async () => {
		const view = viewOf(COURSE);
		const ready = examReady(READINESS, COURSE.map, view.arcs, STANDING.mistakes);
		assert.equal(ready.kind, "notYet");

		await mount(<ArcIndex arcs={COURSE.map.arcs!} value={a("spaces")} here={a("spaces")} onSelect={noop} />);
		const list = reading("maps", "the arc list");

		const line = (props: ArcLineProps) => <RoadArc {...props} number={view.arcs!.indexOf(props.section) + 1} starts={null} shown={props.section.arc.handle === "spaces"} />;
		await mount(<SplitList groups={[]} arcs={view.arcs!.filter((s) => s.arc.handle === "maps")} open={{}} onOpenChange={noop} onCheck={noop} marked={null} onPoint={noop} onEnterMap={noop} onWalkKey={noop} arcLine={line} />);
		const road = reading("maps", "the road");

		await mount(<MistakeList rows={mistakeRows(STANDING, COURSE, [], view.arcs)} />);
		const mistakes = reading("maps", "the mistakes");

		await mount(<ReadyFact view={view} ready={ready} />, '[data-slot="course-ready-fact"]');
		const answer = reading("maps", "the readiness answer");

		await mount(<ExamFact course={COURSE} runup={null} words="Exam in 25 days" ready={ready} />, '[data-slot="course-exam"]');
		const runup = reading("maps", "the run-up");

		const step = { id: "s", title: "Rank", status: "current" as const, done: false, next: false, taught: true };
		function Roadmap() {
			const [open, setOpen] = React.useState(false);
			return <LessonRoadmap steps={[step]} place={lessonPlaceOf(COURSE.map, ["rank"])} course={COURSE.map} open={open} onOpenChange={setOpen} onJump={noop} />;
		}
		await mount(<Roadmap />, '[data-testid="roadmap"]');
		assert.ok(document.querySelector('[data-testid="roadmap-panel"]'), "the roadmap opens");
		const roadmap = reading("maps", "the roadmap");

		assert.deepEqual({ slot: list.slot, number: list.number, text: list.text, pill: list.pill, ring: list.ring }, { slot: "arc-label", number: "2", text: "2Linear maps", pill: false, ring: false });
		for (const [where, seen] of Object.entries({ road, mistakes, answer, runup, roadmap })) {
			assert.deepEqual({ slot: seen.slot, number: seen.number, text: seen.text, inner: seen.inner, pill: seen.pill, ring: seen.ring }, { slot: list.slot, number: list.number, text: list.text, inner: list.inner, pill: false, ring: false }, `${where} names the arc as the arc list does`);
			assert.deepEqual(list.classes.filter((c) => !seen.classes.includes(c)), [], `${where} wears the label's own look`);
		}
	});
});
