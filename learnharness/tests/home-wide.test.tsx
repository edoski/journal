/**
 * A wider Home, to judge (Edo's notes, 15 Nov 2026, N1: "is there any
 * super useful info at all that we could cleanly fit into it"): Proposed
 * widens Home to the course page's frame and gives each Today row one
 * more fact he would act on, from what the engine already reads. Two
 * candidates on the polish switch: the course's exam day, once per course
 * (`exam`), or where he stands on the row's one topic (`standing`).
 * Current keeps the old width and draws neither.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { foldLines } from "../components/study-home/agenda-rows/row-facts.ts";
import { rowAsides } from "../components/study-home/agenda-rows/row-aside.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { lineTopics } from "../components/study-home/needs-you.ts";
import { HOME_WIDTH } from "../components/study-home/study-home.tsx";
import { standingOf } from "../components/course-map/topic-map/topic-standing.ts";
import { CHATS, COURSES, TODAY } from "./fixtures/now-demo.ts";

const { rows } = needsYouNow(COURSES, CHATS, TODAY);
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const draw = (aside?: "exam" | "standing") =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<HybridRows rows={rows} busy={false} onContinue={() => {}} aside={aside} />
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

describe("Home's width (N1)", () => {
	it("keeps Current at its width and widens both candidates to the course page's frame", () => {
		assert.equal(HOME_WIDTH.current, "max-w-[60rem]");
		assert.equal(HOME_WIDTH.exam, "max-w-[80rem]");
		assert.equal(HOME_WIDTH.standing, "max-w-[80rem]");
	});
});

describe("the exam candidate", () => {
	it("names a course's exam day on its first row only, never a count of days, and nothing for a course with no exam", () => {
		const asides = rowAsides(rows, "exam");
		const seen = new Set<string>();
		rows.forEach((row, i) => {
			const exam = row.course?.map.exam;
			const first = row.course !== null && !seen.has(row.course.map.workspace);
			if (row.course) seen.add(row.course.map.workspace);
			if (first && exam) assert.match(asides[i]!, /^Exam (today|tomorrow|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2})$/, `row ${i}`);
			else assert.equal(asides[i], null, `row ${i}`);
		});
		assert.ok(asides.some((a) => a !== null), "the demo day has a course with an exam");
	});
});

describe("the standing candidate", () => {
	it("says where he stands on a row's one topic in the map's words, and nothing on a row of several or none", () => {
		const asides = rowAsides(rows, "standing");
		rows.forEach((row, i) => {
			const topics = lineTopics(row);
			const topic = topics.length === 1 ? row.course?.map.topics.find((t) => t.handle === topics[0]) : undefined;
			assert.equal(asides[i], topic ? standingOf(topic).words : null, `row ${i}`);
		});
		assert.ok(asides.some((a) => a !== null));
	});
});

describe("the rows drawn", () => {
	it("draw the candidate's fact in its own column, and Current draws none", () => {
		assert.equal(draw().querySelectorAll('[data-slot="today-aside"]').length, 0);
		for (const kind of ["exam", "standing"] as const) {
			const words = [...draw(kind).querySelectorAll('[data-slot="today-aside"]')].map((el) => el.textContent);
			const shown = foldLines(rows).shown.length;
			assert.deepEqual(words, rowAsides(rows, kind).slice(0, shown).filter((a) => a !== null), kind);
			assert.ok(words.length > 0, kind);
		}
	});
});
