/**
 * A Mistakes row's words keep the row's line (round 10, 2 m6): the Eigen
 * row drew "F = (5 2; 2 2)" as a full matrix inside its two lines, which
 * took both. The words go through LineText, as the topic page's Earlier
 * rows do, so a matrix is set small on the line (line-text.md).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMapTopic, TopicHandle } from "../src/core/index.ts";
import { MistakeLine } from "../components/course-page/standing/mistake-list.tsx";
import type { MistakeRow } from "../components/course-page/standing/standing-model.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const eigen: CourseMapTopic = { handle: "eigen" as TopicHandle, title: "Eigenvalues and eigenvectors", level: "assisted", introduced: "2026-11-08", review: null, weak: true, signals: QUIET, tasks: [] };

const row: MistakeRow = {
	topic: eigen,
	slip: "gap",
	words: "Stopped at $\\lambda = 6$ and $\\lambda = 1$ without the kernels of $F = \\begin{pmatrix} 5 & 2 \\\\ 2 & 2 \\end{pmatrix}$",
	when: "Today",
	helped: false,
	hint: null,
	arc: null,
	resume: null,
	workspace: "/study/linalg",
	creation: { title: eigen.title, course: { workspace: "/study/linalg" }, topics: ["eigen"] },
	href: "/unit/x/eigen",
};

describe("a Mistakes row's words", () => {
	it("set a matrix small on the line, never as a display-size matrix", () => {
		const html = renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ul>
					<MistakeLine row={row} start={() => {}} starting={null} />
				</ul>
			</AppRouterContext.Provider>,
		);
		const words = parseHTML(`<html><body>${html}</body></html>`).document.querySelector("[data-slot=mistake-words]")!;
		const tex = [...words.querySelectorAll("annotation")].map((a) => a.textContent ?? "").join(" ");
		assert.match(tex, /smallmatrix/, "the matrix is set small");
		assert.doesNotMatch(tex, /\\begin\{pmatrix\}/);
	});
});
