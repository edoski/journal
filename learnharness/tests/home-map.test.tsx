/**
 * Home's map header (home-map.md): the course tabs, the way into the
 * chosen course's page, and the enlarge control. Same tsx classic-JSX shim
 * as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { StudyCourse } from "../src/core/index.ts";
import { HomeMap } from "../components/study-home/home-map.tsx";
import { courseHref } from "../components/unit-inbox/unit-href.ts";

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

	it("opens the chosen tab's course page, between the tabs and the enlarge control", () => {
		const doc = render("/s/calc");
		const link = doc.querySelector('[data-slot="home-map-course-page"]')!;
		assert.equal(link.tagName, "A");
		assert.equal(link.getAttribute("href"), courseHref("/s/calc"));
		assert.equal(link.textContent, "Course page");
		const header = link.closest("section")!.firstElementChild!;
		const order = [...header.querySelectorAll('[data-slot="home-map-tabs"], [data-slot="home-map-course-page"], [data-slot="home-map-enlarge"]')].map((el) => el.getAttribute("data-slot"));
		assert.deepEqual(order, ["home-map-tabs", "home-map-course-page", "home-map-enlarge"]);
	});

	it("follows the tabs: an unknown course falls back to the first tab's page", () => {
		assert.equal(render("/s/gone").querySelector('[data-slot="home-map-course-page"]')!.getAttribute("href"), courseHref("/s/linalg"));
	});
});
