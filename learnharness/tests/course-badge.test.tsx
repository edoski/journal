/**
 * A course's progress is one mark (Edo replaced the lone ring with the
 * course's badge, 15 Nov 2026): the course page's Now draws the badge when
 * its step leads with no topic, as Today's rows do, and the badge is the
 * sidebar's course mark at 40px, its tint and weight the mark's. Same tsx
 * classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead } from "../components/course-page/course-model.ts";
import { CourseNow } from "../components/course-page/course-head/course-now.tsx";
import { CourseBadge } from "../components/study-home/agenda-rows/course-badge.tsx";
import { CourseMark } from "../components/unit-inbox/unit-row.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { columnsOf } from "./helpers/course-columns.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });

/** A course without arcs: the page has no line of Today's to pick up, so Now leads with no topic. */
const COURSE: StudyCourse = {
	map: {
		workspace: "/study/probability",
		title: "Probability",
		today: "2026-11-08",
		revision: 1,
		exam: null,
		current: h("bayes"),
		focus: null,
		tasks: [],
		topics: [topic("bayes", { level: "independent", introduced: "2026-11-01" }), topic("binomial", { level: "attempted", introduced: "2026-11-03" }), topic("poisson")],
		edges: [],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 2,
	newToday: [],
};

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close: () => {} }) as never}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

/** A tile's tint, ink and weight: its fill, its letters' ink and any weight, on it and its letters. */
const look = (tile: Element) =>
	[tile, ...tile.querySelectorAll("*")]
		.flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/))
		.filter((token) => /^bg-|^text-foreground|^font-(?!sans)|^rounded/.test(token))
		.sort();

describe("a course's progress", () => {
	it("leads the course page's Now with the course's badge when its step leads with no topic, never a lone ring", () => {
		const read = courseRead({ status: "ready", courses: [COURSE], failed: [], open: [], chats: [] }, COURSE.map.workspace);
		assert.equal(read.status, "ready");
		const view = (read as Extract<typeof read, { status: "ready" }>).view;
		assert.equal(view.pickUp, null, "the page has no line to pick up: Now leads with no topic");
		const now = render(<CourseNow {...columnsOf(view)} />).querySelector('[data-slot="course-now"]')!;
		assert.ok(now.querySelector('[data-slot="course-badge"]'), "the course's badge leads the row");
		assert.ok(now.querySelector('[data-slot="topic-glyph"]') === null);
		const progress = [...now.querySelectorAll('[data-slot="today-progress"]')];
		assert.ok(progress.length > 0 && progress.every((p) => p.closest('[data-slot="course-badge"]')), "the progress runs round the badge, never a ring of its own");
	});

	it("draws the badge as the sidebar's course mark at its size, the tint and weight one value", () => {
		const badge = render(<CourseBadge course={COURSE} />).querySelector('[data-slot="course-badge"]')!;
		const tile = badge.querySelector('[data-slot="course-mark"]');
		assert.ok(tile, "the badge's tile is the course mark");
		const mark = render(<CourseMark title={COURSE.map.title} />).querySelector('[data-slot="course-mark"]')!;
		assert.deepEqual(look(tile), look(mark));
		assert.equal(tile.textContent, mark.textContent);
	});
});
