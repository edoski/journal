/**
 * Round 17, P2's minors on Home, the course page and session status:
 * m7 (no bare readiness line), m8 (an arc's rows in study order), m9 (every
 * arc line a day or a plan word), m11 (Home follows the exam in its final
 * review), m12 (a one-topic row's lapse names no title) and m13 (an offer
 * with no question is not "Your turn").
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReadyFact } from "../components/course-page/course-head/ready-fact.tsx";
import { courseArcs, type CourseView } from "../components/course-page/course-model.ts";
import { arcStarts } from "../components/course-page/road/road-model.ts";
import { followedRow, whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import type { TodayRow } from "../components/study-home/study-facts.ts";
import { sessionEndOf } from "../src/core/session-end.ts";
import type { ArcHandle, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { LA, chat, map, topic } from "./fixtures/round8-home.ts";

const h = (s: string) => s as TopicHandle;
const arc = (handle: string, title: string, state: "new" | "learning" = "new") => ({ handle: handle as ArcHandle, title, state, entry: [] }) as never;

describe("the course head's readiness (round 17, m7)", () => {
	it("draws no bare Not ready line: it shows only with what won't fit", () => {
		const course: StudyCourse = { map: map({ exam: { date: "2026-12-03", daysLeft: 24 } }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 1 };
		const html = renderToStaticMarkup(<ReadyFact view={{ course, chats: [] } as unknown as CourseView} ready={{ kind: "notYet", words: "Not ready for the exam yet", rest: null } as never} />);
		assert.equal(html, "");
	});
});

describe("an arc's rows (round 17, m8, m9)", () => {
	const course = (): StudyCourse => ({
		map: map({
			today: "2026-11-17",
			current: h("eigen"),
			arcs: [arc("spaces", "Vector spaces", "learning"), arc("eigen-arc", "Eigenvalues"), arc("late", "Late paradoxes"), arc("under-way", "Paradoxes and continuous conditioning", "learning")],
			topics: [
				topic("vectors", "Vectors", { arc: "spaces" as ArcHandle }),
				topic("complex", "Complex vector spaces", { arc: "eigen-arc" as ArcHandle, level: "new", introduced: null }),
				topic("similar", "Similar matrices", { arc: "eigen-arc" as ArcHandle, level: "new", introduced: null, starts: "2026-11-25" }),
				topic("diag", "Diagonalization", { arc: "eigen-arc" as ArcHandle, level: "new", introduced: null, starts: "2026-11-26" }),
				topic("eigen", "Eigenvalues and eigenvectors", { arc: "eigen-arc" as ArcHandle, introduced: "2026-11-08" }),
				topic("paradox", "Bertrand's paradox", { arc: "late" as ArcHandle, level: "new", introduced: null }),
				topic("borel", "Borel's paradox", { arc: "under-way" as ArcHandle, level: "independent", introduced: "2026-10-30" }),
				topic("cont-cond", "Continuous conditioning", { arc: "under-way" as ArcHandle, level: "new", introduced: null, starts: "2026-12-10" }),
			],
		}),
		unready: null,
		due: [],
		newToday: [],
		lastActiveDaysAgo: 1,
	});

	it("lists them in study order: started first, then by the day the plan starts them, none planned last", () => {
		const eigen = courseArcs(course())!.find((s) => s.arc.handle === "eigen-arc")!;
		assert.deepEqual(eigen.topics.map((r) => r.topic.handle), ["eigen", "similar", "diag", "complex"]);
	});

	it("gives an arc not started a day, or says the plan has none yet", () => {
		const late = courseArcs(course())!.find((s) => s.arc.handle === "late")!;
		assert.equal(arcStarts(late, "2026-11-17"), "Not planned yet");
		const underWay = courseArcs(course())!.find((s) => s.arc.handle === "under-way")!;
		assert.equal(arcStarts(underWay, "2026-11-17"), "Planned 10 Dec", "an arc under way says when its next topic starts");
	});
});

describe("Home's map in an exam's final review (round 17, m11)", () => {
	it("follows the exam's course, whatever session he touched last", () => {
		const prob: StudyCourse = { map: { ...map({ today: "2026-11-17", workspace: "/s/prob", title: "Probability" }), exam: { date: "2026-11-19", daysLeft: 2, finalReview: "2026-11-15" } }, unready: [], due: [], newToday: [], lastActiveDaysAgo: 7 };
		const la: StudyCourse = { map: map({ today: "2026-11-17" }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 };
		const lesson = chat({ id: "la", course: LA, ended: "left", updatedAt: "2026-11-17T09:00:00.000Z" });
		const rows: TodayRow[] = [{ kind: "course", course: prob, step: { kind: "review", titles: ["Binomial distribution"], topics: [h("binomial")], then: null } }, { kind: "session", chat: lesson, course: la }];
		assert.equal(followedRow(rows, null, [lesson])?.course?.map.title, "Probability");
	});
});

describe("a one-topic review row's reason (round 17, m12)", () => {
	it("is the lapse alone, since the row already names the topic", () => {
		const cantor = topic("cantor", "Cardinality, countable sets and Cantor's theorem", { review: { kind: "due", date: "2026-11-09", overdue: 0 }, signals: { gap: null, lapsed: true, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false, mistake: true } as never });
		const course: StudyCourse = { map: map({ topics: [cantor] }), unready: null, due: [h("cantor")], newToday: [], lastActiveDaysAgo: 1 };
		const why = whyOf({ kind: "course", course, step: { kind: "review", titles: [cantor.title], topics: [h("cantor")], then: null } });
		assert.equal(why?.short, "Not right last time");
	});
});

describe("an offer after the last step (round 17, m13)", () => {
	it("is not his turn: with every step taught, words with no question close the lesson", () => {
		const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
		const tree = { nodes: [{ id: "a", title: "Spectrum" }, { id: "b", title: "Recall" }], edges: [{ from: "a", to: "b" }], version: 1 };
		const say = (id: string, content: unknown[], stopReason: string) => ({ id, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: 1 });
		const result = (id: string, call: string, name: string) => ({ id, role: "toolResult", toolCallId: call, toolName: name, content: [{ type: "text", text: "ok" }], details: {}, isError: false, timestamp: 1 });
		const messages = [
			{ id: "probe", role: "assistant", content: [{ type: "toolCall", id: "pd", name: "probe_done", arguments: {} }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: 1 },
			result("pdr", "pd", "probe_done"),
			say("q", [{ type: "toolCall", id: "ex", name: "explain", arguments: { type: "check", nodeId: "b", question: "Recall: what is an eigenvalue?", correctAnswer: "-" } }], "toolUse"),
			result("exr", "ex", "explain"),
			say("p", [{ type: "toolCall", id: "lp", name: "lesson_progress", arguments: { done: ["a", "b"] } }], "toolUse"),
			result("lpr", "lp", "lesson_progress"),
			say("offer", [{ type: "text", text: "If you want to keep going today, a set of practice problems on eigenvalues is ready whenever you are." }], "stop"),
		];
		assert.equal(sessionEndOf(messages as never, tree as never), "closed");
		const asked = [...messages.slice(0, -1), say("offer", [{ type: "text", text: "Want to try a few practice problems now?" }], "stop")];
		assert.equal(sessionEndOf(asked as never, tree as never), "mid-lesson", "a question still waits on him");
	});
});
