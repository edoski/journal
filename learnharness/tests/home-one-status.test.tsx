/**
 * Home's Today rows say one status each, in words, whole (round 11):
 *   - 1 N9 (shots 01, 53): "Studied today · Mistake to fix · Your turn" on
 *     one row;
 *   - 1 N12 and 2 n3 (shots 71, 51): "Studied today" on a session he only
 *     opened;
 *   - 1 N14 (shot 33): "Not right last time: Matrix multipli…" cut with
 *     half the row empty;
 *   - 3 n5 (shot 11a): the lesson he was in folded into "Also today:";
 *   - 1 N9 (shot 32): "Studied today" named one lesson twice.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { foldLines } from "../components/study-home/agenda-rows/row-facts.ts";
import { todayRows } from "../components/study-home/study-facts.ts";
import { doneToday } from "../components/study-home/day-record.ts";
import type { ChatListItem, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { LA, chat, map, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-08";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const h = (s: string) => s as TopicHandle;
const draw = (course: StudyCourse, chats: ChatListItem[]) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<HybridRows rows={todayRows([course], chats, TODAY)} busy={false} onContinue={() => {}} />
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

/** The status cells a row fills: when he studied, the standing and the reason. */
const statuses = (line: Element) => ["today-when", "today-standing", "today-why"].flatMap((slot) => {
	const text = line.querySelector(`[data-slot="${slot}"]`)?.textContent?.trim();
	return text ? [text] : [];
});

const at = (hour: number) => new Date(2026, 10, 8, hour).toISOString();
const EIGEN = topic("eigen", "Eigenvalues and eigenvectors", { level: "assisted", introduced: "2026-11-06", weak: false, signals: { ...QUIET, gap: "Read −x + y = 0 as (1, −1)", mistake: true } });

describe("one status per Today row (1 N9, 1 N12)", () => {
	it("a lesson waiting on him with a mistake to fix says Your turn alone, as the sidebar does, never Studied today or the mistake beside it (round 12, 1 m3)", () => {
		const course: StudyCourse = { map: map({ today: TODAY, topics: [EIGEN] }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 };
		const eigen = chat({ id: "eigen", pendingQuestion: true, studied: true, updatedAt: at(9) });
		const line = draw(course, [eigen]).querySelector('[data-slot="today-line"]')!;
		assert.deepEqual(statuses(line), ["Your turn"]);
	});

	it("a session he only opened never reads Studied today", () => {
		const SHEET = { key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c)", updated: "2026-11-06" };
		const course: StudyCourse = { map: map({ today: TODAY, topics: [topic("rank", "Rank", { tasks: [SHEET.key] }), topic("kernel", "Kernel", { tasks: [SHEET.key] })], tasks: [SHEET] }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 };
		const sheet = chat({ id: "sheet", title: "Continue Problem sheet 4", topics: ["rank", "kernel"], ownTopics: [], tasks: [SHEET.key], pendingQuestion: true, studied: false, updatedAt: at(9) });
		const line = draw(course, [sheet]).querySelector('[data-slot="today-line"]')!;
		assert.doesNotMatch(line.textContent ?? "", /Studied/);
		assert.equal(statuses(line).length, 1, statuses(line).join(" · "));
	});

	it("a review's miss shows its words whole, never cut beside an empty row", () => {
		const matmul = topic("matmul", "Matrix multiplication as composition", { level: "independent", review: { kind: "due", date: TODAY, overdue: 0 }, signals: { ...QUIET, lapsed: true, mistake: true } });
		const eig = { ...EIGEN, signals: QUIET, review: { kind: "due" as const, date: TODAY, overdue: 0 } };
		const course: StudyCourse = { map: map({ today: TODAY, topics: [matmul, eig] }), unready: null, due: [h("matmul"), h("eigen")], newToday: [], lastActiveDaysAgo: 1 };
		const why = draw(course, []).querySelector('[data-slot="today-why"]')!;
		assert.equal(why.textContent, "Not right last time: Matrix multiplication as composition");
		const cut = [why, ...why.querySelectorAll("*")].some((el) => /\b(truncate|max-w-56)\b/.test(el.getAttribute("class") ?? ""));
		assert.equal(cut, false, "the reason never cuts");
	});
});

describe("the lesson he is in stays on Today (3 n5)", () => {
	it("never folds a session waiting on him that he worked in today into Also today", () => {
		const topics = ["rv", "lm", "eigen", "rank", "inv"].map((t) => topic(t, t.toUpperCase(), { level: t === "lm" || t === "inv" ? "new" : "assisted", introduced: t === "lm" ? null : "2026-11-06" }));
		const SHEET = { key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: "2026-11-06" };
		const course: StudyCourse = {
			map: map({ today: TODAY, topics: topics.map((t) => (t.handle === "rv" ? { ...t, review: { kind: "due", date: TODAY, overdue: 0 } } : t)), tasks: [SHEET] }),
			unready: null,
			due: [h("rv")],
			newToday: [h("lm")],
			lastActiveDaysAgo: 0,
		};
		// The seed stamped the Eigen and Rank sessions at 08:05 and 08:10; the live Invertible lesson's clock read 01:20.
		const eigen = chat({ id: "eigen", topics: ["eigen"], ownTopics: ["eigen"], pendingQuestion: true, updatedAt: at(8) });
		const rank = chat({ id: "rank", title: "Rank practice", kind: "practice", topics: ["rank"], ownTopics: ["rank"], pendingProblem: true, updatedAt: at(8) });
		const inv = chat({ id: "inv", title: "Invertible matrices", topics: ["inv"], ownTopics: ["inv"], pendingQuestion: true, updatedAt: at(1) });
		const sheet = chat({ id: "sheet", title: "Problem sheet 4", topics: [], ownTopics: [], tasks: [SHEET.key], ended: "left", updatedAt: "2026-11-06T10:00:00.000Z" });
		const rows = todayRows([course], [eigen, rank, sheet, inv], TODAY);
		const { shown, also } = foldLines(rows);
		assert.ok(shown.some((row) => row.kind === "session" && row.chat.id === "inv"), "the lesson he is in has its own line");
		assert.ok(also.every((row) => row.kind !== "session" || row.chat.id !== "inv"));
		assert.ok(also.some((row) => row.kind === "session" && row.chat.id === "sheet"), "a lesson left on an earlier day still folds after the plan");
	});
});

describe("Studied today names a lesson once (1 N9)", () => {
	it("names two sessions of one lesson's task once, by the task's title", () => {
		const TASK = { key: "eigen-lesson", title: "Eigenvalues lesson: eigenvectors step", step: null, updated: TODAY };
		const course: StudyCourse = { map: map({ today: TODAY, topics: [EIGEN], tasks: [TASK] }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 };
		const first = chat({ id: "first", title: "Eigenvalues and eigenvectors", studied: true, tasks: [TASK.key], ended: "left", updatedAt: at(9), course: LA });
		const second = chat({ id: "second", title: "Eigenvalues lesson: eigenvectors step", studied: true, tasks: [TASK.key], ended: "closed", updatedAt: at(10), course: LA });
		assert.deepEqual(doneToday([second, first], new Date(2026, 10, 8, 11), [course]), ["Eigenvalues lesson: eigenvectors step"]);
	});
});
