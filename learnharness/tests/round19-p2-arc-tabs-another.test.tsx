/**
 * Round 19, P2's minors m8, m9 and m10 (lens 1, n7, n8, n10).
 *
 * m8: Linear Algebra's arc 6 read "Starts 18 Nov" and arc 7 "Planned 18 Nov"
 * for the same fact, a new topic that day. An arc's next start says
 * "Planned", as a topic's row, Home and the calendar say a planned start.
 *
 * m9: Home's course tabs changed order between visits (P, LA, CI, RA; then
 * P, CI, LA, RA; then P, LA, RA, CI), since they followed Today's order,
 * which moves with what he studied last. They keep the study read's order.
 *
 * m10: the readiness answer's "Or another" opened on the same action as the
 * line above it ("Review Random variables and distributions today", then
 * "Review Random variables and distributions ✓"). It lists alternatives only.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseArcs } from "../components/course-page/course-model.ts";
import { arcStarts } from "../components/course-page/road/road-model.ts";
import { homeOf } from "../components/study-home/home-frame.tsx";
import { anotherWays } from "../components/course-page/course-head/exam-gaps.tsx";
import { EXAM_GAP_WORDS } from "../components/study-words.ts";
import type { ArcHandle, CourseMap, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const arc = (handle: string, title: string, state: "new" | "learning") => ({ handle: handle as ArcHandle, title, state, entry: [] }) as never;

describe("an arc's next start (round 19, m8)", () => {
	const today = "2026-11-17";
	const course = (): StudyCourse => ({
		map: map({
			today,
			current: "eigen" as TopicHandle,
			arcs: [arc("eigen-arc", "Eigenvalues", "learning"), arc("inner", "Inner products", "new"), arc("now", "Orthogonality", "new")],
			topics: [
				topic("eigen", "Eigenvalues and eigenvectors", { arc: "eigen-arc" as ArcHandle }),
				topic("diag", "Diagonalization", { arc: "eigen-arc" as ArcHandle, level: "new", introduced: null, starts: "2026-11-18" }),
				topic("inner-p", "Inner products", { arc: "inner" as ArcHandle, level: "new", introduced: null, starts: "2026-11-18" }),
				topic("ortho", "Orthogonal projection", { arc: "now" as ArcHandle, level: "new", introduced: null, starts: today }),
			],
		}),
		unready: null,
		due: [],
		newToday: [],
		lastActiveDaysAgo: 1,
	});
	const line = (handle: string) => arcStarts(courseArcs(course())!.find((s) => s.arc.handle === handle)!, today);

	it("says the same word for a new topic that day, whether the arc is under way or not started", () => {
		assert.equal(line("eigen-arc"), "Planned 18 Nov", "an arc under way");
		assert.equal(line("inner"), "Planned 18 Nov", "an arc not started: the same fact in the same word, never Starts");
	});

	it("says today as a topic's row says it", () => {
		assert.equal(line("now"), "Planned today");
	});
});

describe("Home's course tabs (round 19, m9)", () => {
	const today = "2026-11-09";
	const due = (handle: string) => topic(handle, handle, { review: { kind: "due", date: today, overdue: 0 } });
	const course = (workspace: string, title: string, idle: number): StudyCourse => ({
		map: map({ workspace, title, today, current: null, topics: [due(`${workspace}-t`)] } as Partial<CourseMap>),
		unready: null,
		due: [`${workspace}-t` as TopicHandle],
		newToday: [],
		lastActiveDaysAgo: idle,
	});
	const tabs = (courses: readonly StudyCourse[], chats = [] as ReturnType<typeof chat>[]) => homeOf(courses, chats, undefined).courses.map((c) => c.map.title);

	it("keep the study read's order whatever he studied last", () => {
		const first = tabs([course("/s/la", "Linear Algebra", 1), course("/s/prob", "Probability", 3), course("/s/ra", "Real Analysis", 2)]);
		const second = tabs(
			[course("/s/la", "Linear Algebra", 4), course("/s/prob", "Probability", 0), course("/s/ra", "Real Analysis", 6)],
			[chat({ id: "p", course: { workspace: "/s/prob", title: "Probability" }, updatedAt: "2026-11-09T09:00:00.000Z" })],
		);
		assert.deepEqual(first, ["Linear Algebra", "Probability", "Real Analysis"], "the read's order");
		assert.deepEqual(second, first, "a later read where Probability was studied last keeps the same order");
	});
});

describe("Or another (round 19, m10)", () => {
	const way = (handle: string, planned: boolean) => ({ topic: { handle: handle as TopicHandle, title: handle } as CourseMapTopic, starts: false, planned });

	it("never offers the head's own way in again, and folds the rest behind More", () => {
		const ways = [way("rv", true), way("binomial", true), way("poisson", false), way("variance", false)];
		const menu = anotherWays(ways);
		const offered = [menu.next, ...menu.more.flatMap((g) => g.ways)];
		assert.ok(!offered.some((w) => w?.topic.handle === "rv"), "the pick the line above already offers is not in the menu");
		assert.equal(menu.next?.topic.handle, "binomial", "the menu opens on the next way, the plan's own for today first");
		assert.deepEqual(
			menu.more.map((g) => [g.label, g.ways.map((w) => w.topic.handle)]),
			[[EXAM_GAP_WORDS.leftOut, ["poisson", "variance"]]],
			"the rest behind More, each group by what it is",
		);
	});

	it("is one option with nothing behind More when one way is left", () => {
		const menu = anotherWays([way("rv", true), way("poisson", false)]);
		assert.equal(menu.next?.topic.handle, "poisson");
		assert.deepEqual(menu.more, []);
	});

	it("is nothing with the pick alone", () => {
		assert.deepEqual(anotherWays([way("rv", true)]), { next: null, more: [] });
	});
});
