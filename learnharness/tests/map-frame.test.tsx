/**
 * Home's map and the course page's are one frame (`MapFrame`; Edo, 17 Nov
 * 2026: "Whole course and the edge fade match between Home and the course
 * page, from one shared value"): Whole course shows only while the map is
 * enlarged, in the head row just before Enlarge, and the edges fade the
 * same on both. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { currentArc } from "../src/core/index.ts";
import { HomeMap } from "../components/study-home/home-map.tsx";
import { SplitMap } from "../components/course-page/split/split-map.tsx";
import { LINALG_ARCS } from "./fixtures/now-demo.ts";

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const noop = () => {};
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;

const home = (enlarged: boolean) => render(<HomeMap courses={[LINALG_ARCS]} chats={[]} workspace={LINALG_ARCS.map.workspace} onSelect={noop} arc={null} enlarged={enlarged} onEnlarge={noop} />);
const coursePage = (enlarged: boolean) =>
	render(
		<SplitMap
			map={LINALG_ARCS.map}
			arc={currentArc(LINALG_ARCS.map) ?? undefined}
			arcs={LINALG_ARCS.map.arcs!}
			said={new Map()}
			lit={null}
			aim={null}
			reveal={null}
			onPoint={noop}
			onLeave={noop}
			enlarged={enlarged}
			onEnlarge={noop}
		/>,
	);
const PAGES = [
	{ name: "Home", draw: home, enlarge: "home-map-enlarge" },
	{ name: "the course page", draw: coursePage, enlarge: "course-map-enlarge" },
];

/** Where Whole course sits: its parent's classes and what follows it. */
function wholePlace(document: Document, enlarge: string) {
	const whole = document.querySelector('[data-slot="course-map-whole"]');
	if (!whole) return null;
	return { row: whole.parentElement!.className, next: whole.nextElementSibling?.getAttribute("data-slot") === enlarge ? "enlarge" : "other", faded: whole.closest('[style*="mask-image"]') !== null };
}

/** The mask over the map's drawing. */
const fadeOf = (document: Document) => document.querySelector('[data-slot="course-map-graph"]')!.closest('[style*="mask-image"]')!.getAttribute("style");

describe("Home's map frame and the course page's are one", () => {
	it("shows Whole course on a course with arcs only once the map is enlarged, on both", () => {
		for (const { name, draw } of PAGES) {
			assert.ok(draw(false).querySelector('[data-slot="course-map-whole"]') === null, `${name}: no Whole course before the map is enlarged`);
			assert.ok(draw(true).querySelector('[data-slot="course-map-whole"]') !== null, `${name}: Whole course once enlarged`);
		}
	});

	it("puts Whole course in the same place on both: the head row, just before Enlarge, clear of the fade", () => {
		const [onHome, onCourse] = PAGES.map(({ draw, enlarge }) => wholePlace(draw(true), enlarge));
		assert.deepEqual(onHome, { row: onHome!.row, next: "enlarge", faded: false });
		assert.deepEqual(onCourse, onHome);
	});

	it("fades the map's edges by the same amount on both", () => {
		const [onHome, onCourse] = PAGES.map(({ draw }) => fadeOf(draw(false)));
		assert.match(onHome!, /mask-image/);
		assert.equal(onCourse, onHome);
	});
});
