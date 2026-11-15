/**
 * Mistakes on Linear Algebra's course page, opened with the gap the tutor
 * wrote for Eigen in round 8 (66 words, inline maths): the popover opens
 * and each line runs to its box's edge, where the box's ellipsis cuts the
 * word that does not fit when a letter of it fits (round 8, 2 B1: the line dropped one word per
 * render and React stopped it at 50 nested updates, "Maximum update depth
 * exceeded" in `MathLine`).
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
import { MistakesPress } from "../components/course-page/standing/mistakes-press.tsx";

/** A line's box as the popover lays it out: 240px wide, 7px a character. */
const BOX = 240;
const CHAR = 7;
const proto = dom.window.HTMLElement.prototype as object;
const truncated = (el: Element) => /\btruncate\b/.test(el.getAttribute("class") ?? "");
Object.defineProperty(proto, "clientWidth", { configurable: true, get(this: Element) { return truncated(this) ? BOX : 0; } });
Object.defineProperty(proto, "scrollWidth", { configurable: true, get(this: Element) { return truncated(this) ? Math.max(BOX, (this.textContent ?? "").length * CHAR) : 0; } });

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
		topics: [topic("eigen", "Eigenvalues and eigenvectors"), topic("rank", "Rank")],
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
	it("opens, and each line draws the words that fit its box and the word its ellipsis cuts", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
		await act(async () =>
			root!.render(
				<AppRouterContext.Provider value={router as never}>
					<MistakesPress rows={mistakeRows(standing, course, [], null)} />
				</AppRouterContext.Provider>,
			),
		);
		await act(async () => {
			document.querySelector("[data-slot=course-mistakes]")!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
		});
		const rows = [...document.querySelectorAll("[data-slot=mistake-row]")];
		assert.equal(rows.length, 2, "the list opens with both mistakes");
		const line = rows[0]!.querySelectorAll(".truncate")[1]!;
		const words = EIGEN_GAP.split(" ");
		let fits = 1;
		while (`${words.slice(0, fits + 1).join(" ")}…`.length * CHAR <= BOX) fits++;
		const letterFits = `${words.slice(0, fits).join(" ")} ${words[fits]![0]}…`.length * CHAR <= BOX;
		assert.equal(line.textContent, `${words.slice(0, letterFits ? fits + 1 : fits).join(" ")}…`);
	});
});
