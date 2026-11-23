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
import { rowStanding, rowWords } from "../components/study-home/agenda-rows/row-standing.ts";
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
	it('says "Mistake to fix" alone beside the warning pie, never with Slipping', () => {
		const words = "Mistake to fix";
		// The course's next step on Rank, with no session open: a plain "Next up" gives way to the slip (round 12, 1 m3).
		const weak = rankCourse({ gap: "Counts entries, not pivots", mistake: true });
		const learning = { ...weak, map: { ...weak.map, topics: weak.map.topics.map((t) => ({ ...t, level: "assisted" as const })) } };
		const line = draw(learning, []).querySelector('[data-slot="today-line"]')!;
		const text = line.textContent ?? "";
		assert.equal(text.split(words).length - 1, 1, `"${words}" once: ${text}`);
		assert.doesNotMatch(text, /Slipping/);
		assert.ok(line.querySelector('[data-slot="today-slip"]') === null, "no slip on the course line");
		const standing = line.querySelector('[data-slot="today-standing"]')!;
		assert.equal(standing.textContent, words);
		assert.equal(standing.getAttribute("data-slip"), "gap");
		assert.equal(standing.querySelector('[data-slot="topic-glyph"]')?.getAttribute("data-fill"), "0.75", "the warning pie, a quarter short");
	});

	// A gap with no mistake open slips no more (round 11, 3 N1): its standing
	// says what is left, with no slip; with no slip the row's one status is
	// why it is on Today (round 11, 1 N9), here the practice problem waiting.
	it("a gap with no mistake open is no slip: the row says its reason alone, never Slipping", () => {
		const course = rankCourse({ gap: "Pivots" });
		const [row] = todayRows([course], [practice], TODAY);
		assert.equal(rowStanding(row!)?.slip ?? null, null);
		// The engine still calls it weak: the check to come, never "Right on your own" (round 20, m4).
		assert.equal(rowStanding(row!) && rowWords(rowStanding(row!)!), "Check again another day");
		const line = draw(course, [practice]).querySelector('[data-slot="today-line"]')!;
		const text = line.textContent ?? "";
		assert.doesNotMatch(text, /Slipping|Check on your own/);
		assert.ok(line.querySelector('[data-slot="today-slip"]') === null, "no slip on the course line");
		assert.ok(line.querySelector('[data-slot="today-standing"]') === null, "one status: the reason, not the standing beside it");
		assert.equal(line.querySelector('[data-slot="today-why"]')?.textContent, "Your turn");
	});
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

	it("is the row's one status on Home where the row says no more than Next up, and a lesson waiting on him says Your turn (round 12, 1 m3)", () => {
		const line = draw(course, []).querySelector('[data-slot="today-line"]')!;
		assert.equal(line.querySelector('[data-slot="today-standing"]')?.textContent, "Mistake to fix");
		assert.doesNotMatch(line.textContent ?? "", /Partly right/);
		const eigen = chat({ id: "eigen", pendingQuestion: true, updatedAt: "2026-11-09T09:00:00.000Z" });
		const waiting = draw(course, [eigen]).querySelector('[data-slot="today-line"]')!;
		assert.equal(waiting.querySelector('[data-slot="today-why"]')?.textContent, "Your turn");
	});
});
