/**
 * One status word per Today row (round 10, 1 m4, shots 40, 48, 70, 20):
 * rows read "Mistake to fix · Slipping", "Check on your own · Slipping"
 * and "Fixed, check again later · Slipping", the slip on the course line
 * and Slipping on the lesson line; and on 8 Nov the sidebar said "Mistake
 * to fix" while the topic's head said only "Partly right".
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { todayRows } from "../components/study-home/study-facts.ts";
import { headMarks } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { slipOf } from "../components/unit-inbox/units.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-09";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const draw = (course: StudyCourse, chats = [] as ReturnType<typeof chat>[]) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<HybridRows rows={todayRows([course], chats, TODAY)} busy={false} onContinue={() => {}} />
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

/** Rank practice on a topic the engine calls weak, with its slip. */
const rankCourse = (signals: object): StudyCourse => ({
	map: map({ current: "rank" as TopicHandle, topics: [topic("rank", "Rank and the column space", { level: "independent", weak: true, signals: { ...QUIET, ...signals } })] }),
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
});
const practice = chat({ id: "rank", title: "Rank practice", kind: "practice", pendingProblem: true, topics: ["rank"], ownTopics: ["rank"], updatedAt: "2026-11-09T09:00:00.000Z" });

describe("one status word per row (round 10, 1 m4)", () => {
	for (const [signals, words] of [
		// A gap with no mistake open slips no more (round 11, 3 N1): its
		// standing says what is left, and no slip sits beside it.
		[{ gap: "Pivots" }, "Right on your own, check another day"],
		[{ gap: "Counts entries, not pivots", mistake: true }, "Mistake to fix"],
	] as const) {
		it(`says "${words}" alone beside the pie, never with Slipping`, () => {
			const line = draw(rankCourse(signals), [practice]).querySelector('[data-slot="today-line"]')!;
			const text = line.textContent ?? "";
			assert.equal(text.split(words).length - 1, 1, `"${words}" once: ${text}`);
			assert.doesNotMatch(text, /Slipping/);
			assert.ok(line.querySelector('[data-slot="today-slip"]') === null, "no slip on the course line");
			const standing = line.querySelector('[data-slot="today-standing"]')!;
			assert.equal(standing.textContent, words);
			assert.equal(standing.getAttribute("data-slip"), "mistake" in signals ? "gap" : null);
			assert.equal(standing.querySelector('[data-slot="topic-glyph"]')?.getAttribute("data-fill"), "0.75", "the warning pie, a quarter short");
		});
	}
});

describe("an open mistake on a topic not weak (round 10, 1 m4)", () => {
	const partly = topic("eigen", "Eigenvalues and eigenvectors", { level: "assisted", right: "partial", weak: false, signals: { ...QUIET, gap: "Forgot the characteristic polynomial's sign", mistake: true } });
	const course: StudyCourse = { map: map({ topics: [partly] }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 };

	it("reads as a mistake to fix on the topic's head, as the sidebar says it", () => {
		assert.equal(slipOf(course.map, partly), "Mistake to fix");
		assert.deepEqual(
			headMarks(partly, (h) => h, TODAY).map((m) => m.words),
			["Mistake to fix"],
		);
	});

	it("is the row's one status on Home", () => {
		const eigen = chat({ id: "eigen", pendingQuestion: true, updatedAt: "2026-11-09T09:00:00.000Z" });
		const line = draw(course, [eigen]).querySelector('[data-slot="today-line"]')!;
		assert.equal(line.querySelector('[data-slot="today-standing"]')?.textContent, "Mistake to fix");
		assert.doesNotMatch(line.textContent ?? "", /Partly right/);
	});
});
