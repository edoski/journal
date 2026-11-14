/**
 * Arcs carried through the rest of the app: Home's rows name the arc a
 * lesson sits in and why a new topic starts now, the sidebar's cards name
 * the arc on their course line, the topic page's head links its course and
 * its arc and says why a topic not started comes when it does, and search
 * finds arcs by name. A course without arcs reads as it did. Linear Algebra
 * cut into three arcs (`LINALG_ARCS`), engine day 2026-11-08.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle, CourseMapTopic, StartsWhy, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { arcPlace, lessonOf } from "../components/study-home/lesson-facts.ts";
import { nextStepOf, todayRows, type TodayRow } from "../components/study-home/study-facts.ts";
import { placeOf, whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { chat, LINALG, LINALG_ARCS, TODAY } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;

const h = (...handles: string[]) => handles as TopicHandle[];
const arc = (handle: string) => handle as ArcHandle;

/** The course with Diagonalization planned today, for the reason it starts. */
function planned(course: StudyCourse, startsWhy: StartsWhy): StudyCourse {
	const topics = course.map.topics.map((t): CourseMapTopic => (t.handle === "diag" ? { ...t, starts: TODAY, startsWhy } : t));
	return { ...course, due: [], newToday: h("diag"), map: { ...course.map, topics } };
}

const row = (course: StudyCourse): TodayRow => ({ kind: "course", course, step: nextStepOf(course) });

describe("Home's rows", () => {
	it("name the arc when every topic of the lesson lies in it, and none when the lesson spans arcs", () => {
		assert.equal(arcPlace(LINALG_ARCS.map, h("rank", "det")), "Linear systems");
		assert.equal(arcPlace(LINALG_ARCS.map, h("independence", "rank")), null, "a review that mixes arcs names none");
		assert.equal(arcPlace(LINALG_ARCS.map, h("gone")), null);
		assert.equal(arcPlace(LINALG_ARCS.map, []), null);
		assert.equal(arcPlace(LINALG.map, h("rank", "det")), null, "a course without arcs has no place");
	});

	it("put the arc on the course line, for a course's step and for a waiting session", () => {
		const [review] = todayRows([LINALG_ARCS], [], TODAY);
		assert.deepEqual(lessonOf(review!).topics, ["independence"]);
		assert.equal(placeOf(review!), "Linear Algebra · Vector spaces");
		const waiting = chat("q", { pendingQuestion: true, updatedAt: `${TODAY}T09:00:00.000Z`, course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["eigen", "charpoly"] });
		const [session] = todayRows([LINALG_ARCS], [waiting], TODAY);
		assert.equal(placeOf(session!), "Linear Algebra · Eigenvalues");
		assert.equal(placeOf(todayRows([LINALG], [], TODAY)[0]!), "Linear Algebra", "the course alone without arcs");
		const doc = render(<HybridRows rows={[review!, session!]} busy={false} onContinue={() => {}} />);
		assert.deepEqual(
			[...doc.querySelectorAll('[data-slot="today-course"]')].map((line) => line.textContent),
			["Linear Algebra · Vector spaces", "Linear Algebra · Eigenvalues"],
		);
	});

	it("give a planned new topic its reason with its own icon, cut to fit the row", () => {
		const after = planned(LINALG_ARCS, { kind: "after", arc: arc("eigenvalues"), needs: h("eigen"), partners: [] });
		assert.deepEqual(whyOf(row(after)), { kind: "next", starts: "after", short: "After Eigenvalues and eigenvectors" });
		const next = planned(LINALG_ARCS, { kind: "next", arc: arc("eigenvalues") });
		assert.equal(whyOf(row(next))?.short, "Next in Eigenvalues");
		const early = planned(LINALG_ARCS, { kind: "early", arc: arc("eigenvalues"), waitingOn: h("rank"), exam: false });
		assert.deepEqual([whyOf(row(early))?.starts, whyOf(row(early))?.short], ["early", "Early, from Eigenvalues"], "the waiting clause stays on the topic page");
		const doc = render(<HybridRows rows={[row(after)]} busy={false} onContinue={() => {}} />);
		const why = doc.querySelector('[data-slot="today-why"]')!;
		assert.equal(why.getAttribute("data-starts"), "after");
		assert.equal(why.textContent, "After Eigenvalues and eigenvectors");
	});

	it("keep today's words for a planned topic in a course without arcs", () => {
		const plain = planned(LINALG, { kind: "next" });
		assert.deepEqual(whyOf(row(plain)), { kind: "next", short: "Planned today" });
	});
});
