/**
 * The course page's exam readiness and open mistakes (components/
 * course-page/standing/): the words the head says from the engine's
 * `standing`, with and without an exam, with and without arcs, and the
 * mistake rows with what a press does.
 */

import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle, ChatListItem, CourseMapTopic, CourseReadiness, CourseStanding, ReadinessPart, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead } from "../components/course-page/course-model.ts";
import { examReady, leastReadyFirst, mistakeRows, partState } from "../components/course-page/standing/standing-model.ts";
import { MistakeList } from "../components/course-page/standing/mistake-list.tsx";
import { MistakesPress } from "../components/course-page/standing/mistakes-press.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle[0]!.toUpperCase() + handle.slice(1), level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });
const WS = "/study/linalg";

function course(arcs: boolean, exam = true): StudyCourse {
	const inArc = (arc: string) => (arcs ? { arc: a(arc) } : {});
	return {
		map: {
			workspace: WS,
			title: "Linear Algebra",
			today: "2026-11-08",
			revision: 1,
			exam: exam ? { date: "2026-11-30", daysLeft: 22 } : null,
			current: h("span"),
			focus: null,
			tasks: [],
			topics: [topic("span", { level: "retained", ...inArc("spaces") }), topic("basis", { ...inArc("spaces"), signals: { ...QUIET, confidentErrors: 1, mistake: true } }), topic("rank", inArc("maps")), topic("kernel", { level: "new", introduced: null, ...inArc("maps") })],
			edges: [],
			...(arcs
				? {
						arcs: [
							{ handle: a("spaces"), title: "Vector spaces", state: "learning" as const, entry: [] },
							{ handle: a("maps"), title: "Linear maps", state: "learning" as const, entry: [] },
						],
					}
				: {}),
		},
		unready: null,
		due: [],
		lastActiveDaysAgo: 0,
		newToday: [],
	};
}

function viewOf(c: StudyCourse, chats: ChatListItem[] = []) {
	const read = courseRead({ status: "ready", courses: [c], failed: [], open: [], chats }, c.map.workspace);
	assert.equal(read.status, "ready");
	return (read as Extract<typeof read, { status: "ready" }>).view;
}

const part = (over: Partial<ReadinessPart>): ReadinessPart => ({ solid: [], notYet: [], toStart: [], wontFit: [], ...over });
const readiness = (...parts: ReadinessPart[]): CourseReadiness => ({ date: "2026-11-30", daysLeft: 22, parts });

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close: () => {} }) as never}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

describe("exam readiness, from the engine's sorting", () => {
	it("says a part is ready only when every topic is solid, and short when one has no room", () => {
		assert.equal(partState(part({ solid: [h("span")] })), "ready");
		assert.equal(partState(part({ solid: [h("span")], toStart: [h("kernel")] })), "notYet");
		assert.equal(partState(part({ notYet: [h("rank")], wontFit: [h("kernel")] })), "short");
	});

	it("with arcs, says only that he is not ready yet while all of it still fits, never a list of the arcs (round 16, m6)", () => {
		const view = viewOf(course(true));
		const some = examReady(readiness(part({ arc: a("spaces"), solid: [h("span")] }), part({ arc: a("maps"), notYet: [h("rank")] })), view.course.map, view.arcs, []);
		assert.deepEqual(some, { kind: "notYet", words: "Not ready for the exam yet", rest: null });
		const none = examReady(readiness(part({ arc: a("spaces"), notYet: [h("basis")] }), part({ arc: a("maps"), notYet: [h("rank")] })), view.course.map, view.arcs, []);
		assert.deepEqual(none, { kind: "notYet", words: "Not ready for the exam yet", rest: null });
	});

	it("without arcs, names the topics not yet solid, else those still to start", () => {
		const { map } = course(false);
		assert.deepEqual(examReady(readiness(part({ solid: [h("span")], notYet: [h("basis"), h("rank")], toStart: [h("kernel")] })), map, null, []), { kind: "notYet", words: "Not yet solid for the exam: Basis and Rank", rest: null });
		assert.deepEqual(examReady(readiness(part({ solid: [h("span")], toStart: [h("kernel")] })), map, null, []), { kind: "notYet", words: "Still to start before the exam: Kernel", rest: null });
	});

	it("in a course without arcs, names the three least ready by the engine's facts, then folds the rest behind a press that holds them all", () => {
		// Linear Algebra's demo in round 9: nine of ten started topics named on one line (2 m13).
		const { map } = course(false);
		const handles = ["independence", "matmul", "gauss", "rank", "kernel", "det", "cramer", "eigen", "basis"];
		const taught = map.topics.filter((t) => t.handle !== "kernel");
		const many = { ...map, topics: [...taught, ...handles.filter((t) => t !== "rank" && t !== "basis").map((t) => topic(t, t === "independence" ? { level: "attempted" } : {}))] };
		const mistakes = [
			{ topic: h("eigen"), gap: null, latest: "2026-11-08", answers: [] },
			{ topic: h("matmul"), gap: "Gave a 3 by 3 product", latest: "2026-11-05", answers: [] },
		];
		const ready = examReady(readiness(part({ notYet: handles.map(h) })), many, null, mistakes);
		assert.equal(ready.kind, "notYet");
		assert.equal(ready.words, "Not yet solid for the exam: Eigen, Matmul, Independence", "open mistakes first, newest first, then the lowest level; never the path's first three");
		assert.doesNotMatch(ready.words, /others/);
		const rest = ready.kind === "notYet" ? ready.rest : null;
		assert.equal(rest?.heading, "Not yet solid for the exam");
		assert.deepEqual(
			rest?.topics.map((t) => t.handle),
			["eigen", "matmul", "independence", "gauss", "rank", "kernel", "det", "cramer", "basis"],
			"every topic, least ready first; the rest, alike, keep the path's order",
		);
	});

	it("ranks the least ready by open mistake, then engine level, then the weak verdict, and only then the path", () => {
		const { map } = course(false);
		const topics = [topic("a"), topic("b", { level: "introduced" }), topic("c", { weak: true }), topic("d", { level: "independent" }), topic("e")];
		const mistakes = [{ topic: h("e"), gap: "slip", latest: "2026-11-07", answers: [] }];
		assert.deepEqual(leastReadyFirst(["a", "b", "c", "d", "e"].map(h), { ...map, topics }, mistakes).map((t) => t.handle), ["e", "b", "c", "a", "d"]);
	});

	it("names four topics whole, so the press always holds at least two more", () => {
		const { map } = course(false);
		const many = { ...map, topics: [...map.topics.filter((t) => t.handle !== "kernel"), topic("kernel"), topic("det")] };
		const four = examReady(readiness(part({ notYet: ["basis", "rank", "kernel", "det"].map(h) })), many, null, []);
		assert.deepEqual(four, { kind: "notYet", words: "Not yet solid for the exam: Basis, Rank, Kernel and Det", rest: null });
	});

	it("names what has no room first, and says ready when every part is solid", () => {
		const { map } = course(false);
		assert.deepEqual(examReady(readiness(part({ notYet: [h("rank")], wontFit: [h("kernel")] })), map, null, []), { kind: "short", words: "No room before the exam to start Kernel" });
		assert.deepEqual(examReady(readiness(part({ solid: [h("span")] })), map, null, []), { kind: "ready", words: "Ready for the exam" });
	});

	it("never says ready while the final review leaves a taught topic out", () => {
		const { map } = course(false);
		const left = { ...map, exam: { date: "2026-11-19", daysLeft: 11, unreviewed: [h("rank")] } };
		assert.deepEqual(examReady(readiness(part({ solid: [h("span"), h("rank")] })), left, null, []), { kind: "short", words: "No room in the final review for Rank" });
		assert.deepEqual(examReady(readiness(part({ wontFit: [h("kernel")] })), left, null, []), { kind: "short", words: "No room before the exam to start Kernel" }, "what has no room to start first");
	});

	it("names the final review's first day, so a review before it never reads as a contradiction (round 11 integration: \"No room in the final review for Binomial\" beside \"Review Binomial today\")", () => {
		const { map } = course(false);
		const rank = map.topics.find((t) => t.handle === h("rank"))!;
		const reviewedToday = { ...map, topics: map.topics.map((t) => (t === rank ? { ...t, review: { kind: "scheduled" as const, date: map.today } } : t)) };
		const ahead = { ...reviewedToday, exam: { date: "2026-11-19", daysLeft: 11, finalReview: "2026-11-13", unreviewed: [h("rank")], reasons: { rank: "full" as const } } };
		assert.deepEqual(examReady(readiness(part({ solid: [h("span"), h("rank")] })), ahead, null, []), { kind: "short", words: "No room in the final review from 13 Nov for Rank" });
		const begun = { ...ahead, exam: { ...ahead.exam, finalReview: map.today } };
		assert.deepEqual(examReady(readiness(part({ solid: [h("span"), h("rank")] })), begun, null, []), { kind: "short", words: "No room in the final review for Rank" }, "a final review already under way needs no day");
	});

});

const STANDING: CourseStanding = {
	readiness: null,
	mistakes: [
		{ topic: h("basis"), gap: null, latest: "2026-11-06", answers: [{ id: "o4", date: "2026-11-06", text: "Called three vectors in a plane a basis", response: "a basis", result: "incorrect", helped: false, confident: true, chose: null, on: "Sheet 3" }] },
		{ topic: h("rank"), gap: "You count the vectors, not the dimension of their span", latest: "2026-11-08", answers: [{ id: "o5", date: "2026-11-08", text: "Gave rank 3", response: null, result: "partial", helped: true, confident: false, chose: null, on: null }] },
		{ topic: h("gone"), gap: "Not on the map", latest: "2026-11-08", answers: [] },
	],
};

describe("the open mistakes", () => {
	it("words each in the tutor's words, the diagnosis first, else the answer under its mark, with when, help and its hint", () => {
		const view = viewOf(course(true));
		const rows = mistakeRows(STANDING, view.course, []);
		assert.deepEqual(
			rows.map((r) => [r.topic.handle, r.slip, r.words, r.when, r.helped, r.hint]),
			[
				// Round 16, m17: the answer's sentence says what he did, so with
				// no diagnosis its mark leads, never an achievement alone.
				["basis", "confident", "Not right: called three vectors in a plane a basis", "6 Nov", false, "Sheet 3. You answered a basis"],
				["rank", "gap", "You count the vectors, not the dimension of their span", "Today", true, null],
			],
		);
	});

	it("names no arc: its bare number meant nothing alone (round 16, m18); a press resumes the session that waits on the topic, else starts one", () => {
		const waiting = { id: "c1", title: "Rank", kind: "teach", createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:00:00Z", messageCount: 2, phase: "teach", pendingQuestion: true, pendingProblem: false, busy: false, course: { workspace: WS, title: "Linear Algebra" }, topics: ["rank"], ownTopics: ["rank"] } as ChatListItem;
		const rows = mistakeRows(STANDING, viewOf(course(true)).course, [waiting]);
		const doc = render(<MistakeList rows={rows} />);
		assert.ok(doc.querySelector("[data-slot=mistake-list] [data-slot=arc-label]") === null, "no arc label on a row");
		const presses = [...doc.querySelectorAll("[data-slot=mistake-row]")];
		assert.equal(presses.length, 2);
		assert.equal(presses[0]!.tagName, "BUTTON");
		assert.match(presses[0]!.getAttribute("aria-label") ?? "", /^Fix: Basis$/);
		assert.equal(doc.querySelectorAll("[aria-label='With help']").length, 1);
		assert.equal(presses[1]!.getAttribute("aria-label"), "Resume: Rank");
		assert.equal(presses[1]!.getAttribute("href"), "/chat/c1");
	});

	it("shows no press in the head when nothing is open", () => {
		assert.ok(render(<MistakesPress rows={[]} />).querySelector("[data-slot=course-mistakes]") === null);
	});
});
