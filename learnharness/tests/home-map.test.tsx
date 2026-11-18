/**
 * Home's map header (home-map.md): the course tabs, the chosen one also
 * the way into its course page, and the enlarge control. Same tsx classic-JSX shim
 * as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { StudyCourse } from "../src/core/index.ts";
import { HomeMap } from "../components/study-home/home-map.tsx";

const course = (workspace: string, title: string) =>
	({ map: { workspace, title, today: "2026-11-08", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [], edges: [] }, unready: null, due: [], lastActiveDaysAgo: null, newToday: [] }) as StudyCourse;
const COURSES = [course("/s/linalg", "Linear Algebra"), course("/s/calc", "Calculus I")];

describe("Home's map header", () => {
	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const render = (workspace: string) =>
		parseHTML(
			`<html><body>${renderToStaticMarkup(
				<AppRouterContext.Provider value={router as never}>
					<HomeMap courses={COURSES} chats={[]} workspace={workspace} onSelect={() => {}} enlarged={false} onEnlarge={() => {}} />
				</AppRouterContext.Provider>,
			)}</body></html>`,
		).document;

	it("holds the tabs, then the enlarge control, and no Course page link (Edo's notes, N4)", () => {
		const doc = render("/s/calc");
		const header = doc.querySelector('[data-slot="home-map"]')!.firstElementChild!;
		const order = [...header.querySelectorAll("[data-slot]")].map((el) => el.getAttribute("data-slot")).filter((slot) => slot === "home-map-tabs" || slot === "home-map-enlarge" || slot === "home-map-course-page");
		assert.deepEqual(order, ["home-map-tabs", "home-map-enlarge"]);
	});

	it("chooses the given course's tab, an unknown course falling back to the first", () => {
		assert.match(render("/s/calc").querySelector('[data-slot="tabs-trigger"][data-state="active"]')!.textContent!, /Calculus I/);
		assert.match(render("/s/gone").querySelector('[data-slot="tabs-trigger"][data-state="active"]')!.textContent!, /Linear Algebra/);
	});
});
