/**
 * Mistakes on Linear Algebra's course page, opened with the gap the tutor
 * wrote for Eigen in round 8 (66 words, inline maths): the popover opens
 * (round 8, 2 B1: the line dropped one word per render and React stopped it
 * at 50 nested updates, "Maximum update depth exceeded" in `MathLine`), the
 * topic's name shows whole (round 15, 2 n2: cut to ten letters), and the gap
 * wraps whole (round 9, 2 m2: cut at one line; round 15, 2 n2: at two;
 * round 16, m18: at three).
 */

import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
// Next's Link schedules its prefetch on `self`, which the test DOM lacks.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMapTopic, CourseStanding, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { mistakeRows } from "../components/course-page/standing/standing-model.ts";
import { MistakesHead, MistakesPress } from "../components/course-page/standing/mistakes-press.tsx";

/** A line's box as the popover lays it out: 240px wide, 7px a character. */
const BOX = 240;
const CHAR = 7;
const proto = dom.window.HTMLElement.prototype as object;
const truncated = (el: Element) => /\btruncate\b/.test(el.getAttribute("class") ?? "");
Object.defineProperty(proto, "clientWidth", { configurable: true, get(this: Element) { return truncated(this) ? BOX : 0; } });
Object.defineProperty(proto, "scrollWidth", { configurable: true, get(this: Element) { return truncated(this) ? Math.max(BOX, (this.textContent ?? "").length * CHAR) : 0; } });

const EIGEN_TITLE = "Eigenvalues and eigenvectors of a linear map on a finite-dimensional space";
const EIGEN_GAP =
	"You read a diagonal entry as a sign that the matching axis is an eigenvector, then repaired it: an axis stays on its line only when the rest of its column is zero. You also took a repeated eigenvalue as enough to rule out a diagonal form; what decides it is how many eigenlines that eigenvalue has, and $I$ has a repeated eigenvalue yet is diagonal.";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string): CourseMapTopic => ({ handle: h(handle), title, level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: { ...QUIET, mistake: true }, tasks: [] });
const course: StudyCourse = {
	map: {
		workspace: "/study/linear-algebra",
		title: "Linear Algebra",
		today: "2026-11-08",
		revision: 1,
		exam: { date: "2026-12-03", daysLeft: 25 },
		current: h("eigen"),
		focus: null,
		tasks: [],
		topics: [topic("eigen", EIGEN_TITLE), topic("rank", "Rank")],
		edges: [],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};
const standing: CourseStanding = {
	readiness: null,
	mistakes: [
		{ topic: h("eigen"), gap: EIGEN_GAP, latest: "2026-11-08", answers: [] },
		{ topic: h("rank"), gap: "You count nonzero entries instead of pivots", latest: "2026-11-06", answers: [] },
	],
};

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
});

describe("Mistakes with a long gap", () => {
	it("opens; the topic's name shows whole, and the gap runs whole to three lines", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
		await act(async () =>
			root!.render(
				<AppRouterContext.Provider value={router as never}>
					<MistakesHead>
						<div>
							<MistakesPress rows={mistakeRows(standing, course, [])} />
						</div>
					</MistakesHead>
				</AppRouterContext.Provider>,
			),
		);
		await act(async () => {
			document.querySelector("[data-slot=course-mistakes]")!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
		});
		const rows = [...document.querySelectorAll("[data-slot=mistake-row]")];
		assert.equal(rows.length, 2, "the list opens with both mistakes");
		const gap = rows[0]!.querySelector("[data-slot=mistake-words]")!;
		assert.doesNotMatch(gap.getAttribute("class") ?? "", /\b(truncate|line-clamp-\d)\b/, "the gap wraps whole (round 16, m18: Rank's ended in … at three lines)");
		assert.ok(gap.textContent!.startsWith("You read a diagonal entry") && gap.textContent!.endsWith("yet is diagonal."), "the whole gap");
		const name = rows[0]!.querySelector("[data-slot=mistake-topic]")!;
		assert.equal(name.textContent, EIGEN_TITLE, "the topic's whole name (round 15, 2 n2: cut to ten letters)");
		assert.doesNotMatch(name.getAttribute("class") ?? "", /\b(truncate|line-clamp-\d)\b/);
	});
});
