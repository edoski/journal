/**
 * The course page's exam readiness and open mistakes (components/
 * course-page/standing/): the words the head says from the engine's
 * `standing`, with and without an exam, with and without arcs, and the
 * mistake rows with what a press does.
 */

import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle, ChatListItem, CourseMapTopic, CourseReadiness, CourseStanding, ReadinessPart, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead } from "../components/course-page/course-model.ts";
import { examReady, mistakeRows, partState } from "../components/course-page/standing/standing-model.ts";
import { ReadyLine } from "../components/course-page/standing/ready-line.tsx";
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

	it("with arcs, names the arcs not ready as bubbles, and says so plainly when none is ready", () => {
		const view = viewOf(course(true));
		const some = examReady(readiness(part({ arc: a("spaces"), solid: [h("span")] }), part({ arc: a("maps"), notYet: [h("rank")] })), view.course.map, view.arcs);
		assert.equal(some.kind, "notYet");
		assert.deepEqual(some.kind === "notYet" && some.arcs.map((arc) => arc.title), ["Linear maps"]);
		const none = examReady(readiness(part({ arc: a("spaces"), notYet: [h("basis")] }), part({ arc: a("maps"), notYet: [h("rank")] })), view.course.map, view.arcs);
		assert.deepEqual(none, { kind: "notYet", words: "Not ready for the exam yet", arcs: [] });
	});

	it("without arcs, names the topics not yet solid, else those still to start", () => {
		const { map } = course(false);
		assert.deepEqual(examReady(readiness(part({ solid: [h("span")], notYet: [h("basis"), h("rank")], toStart: [h("kernel")] })), map, null), { kind: "notYet", words: "Not yet solid for the exam: Basis and Rank", arcs: [] });
		assert.deepEqual(examReady(readiness(part({ solid: [h("span")], toStart: [h("kernel")] })), map, null), { kind: "notYet", words: "Still to start before the exam: Kernel", arcs: [] });
	});

	it("in a course without arcs, names every topic not yet solid, however many", () => {
		const { map } = course(false);
		const many = { ...map, topics: [...map.topics, ...["det", "cramer", "eigen", "diag"].map((t) => topic(t))] };
		const words = examReady(readiness(part({ notYet: ["basis", "rank", "kernel", "det", "cramer", "eigen", "diag"].map(h) })), many, null).words;
		assert.equal(words, "Not yet solid for the exam: Basis, Rank, Kernel, Det, Cramer, Eigen and Diag");
		assert.doesNotMatch(words, /others/);
	});

	it("names what has no room first, and says ready when every part is solid", () => {
		const { map } = course(false);
		assert.deepEqual(examReady(readiness(part({ notYet: [h("rank")], wontFit: [h("kernel")] })), map, null), { kind: "short", words: "No room before the exam to start Kernel" });
		assert.deepEqual(examReady(readiness(part({ solid: [h("span")] })), map, null), { kind: "ready", words: "Ready for the exam" });
	});

	it("never says ready while the final review leaves a taught topic out", () => {
		const { map } = course(false);
		const left = { ...map, exam: { date: "2026-11-19", daysLeft: 11, unreviewed: [h("rank")] } };
		assert.deepEqual(examReady(readiness(part({ solid: [h("span"), h("rank")] })), left, null), { kind: "short", words: "No room in the final review for Rank" });
		assert.deepEqual(examReady(readiness(part({ wontFit: [h("kernel")] })), left, null), { kind: "short", words: "No room before the exam to start Kernel" }, "what has no room to start first");
	});

});

describe("the head's readiness line", () => {
	it("with arcs, shows the arcs not ready as bubbles that show them on the page", () => {
		const view = viewOf(course(true));
		const doc = render(<ReadyLine course={view.course} ready={examReady(readiness(part({ arc: a("spaces"), solid: [h("span")] }), part({ arc: a("maps"), notYet: [h("rank")] })), view.course.map, view.arcs)} />);
		const line = doc.querySelector("[data-slot=course-ready]")!;
		assert.match(line.textContent ?? "", /Not ready yet in/);
		const pills = [...line.querySelectorAll("[data-slot=arc-pill]")];
		assert.deepEqual(pills.map((p) => p.getAttribute("data-arc")), ["maps"]);
		assert.match(pills[0]!.getAttribute("href") ?? "", /\?arc=maps$/);
	});

	it("with arcs, says only that he is not ready when no arc is", () => {
		const view = viewOf(course(true));
		const doc = render(<ReadyLine course={view.course} ready={examReady(readiness(part({ arc: a("spaces"), notYet: [h("span")] }), part({ arc: a("maps"), notYet: [h("rank")] })), view.course.map, view.arcs)} />);
		assert.equal(doc.querySelector("[data-slot=course-ready]")?.textContent, "Not ready for the exam yet");
		assert.equal(doc.querySelectorAll("[data-slot=arc-pill]").length, 0);
	});

	it("without an exam says what the plan does with its reviews, and while the engine is read says nothing", () => {
		const plain = course(false, false);
		assert.match(render(<ReadyLine course={plain} ready={null} />).querySelector("[data-slot=course-ready]")?.textContent ?? "", /^No exam: reviews /);
		assert.equal(render(<ReadyLine course={course(false)} ready={null} />).querySelector("[data-slot=course-ready]")?.textContent, "");
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
	it("words each in the tutor's words, the diagnosis first, with when, help, its arc's bubble and its hint", () => {
		const view = viewOf(course(true));
		const rows = mistakeRows(STANDING, view.course, [], view.arcs);
		assert.deepEqual(
			rows.map((r) => [r.topic.handle, r.slip, r.words, r.when, r.helped, r.arc?.title, r.hint]),
			[
				["basis", "confident", "Called three vectors in a plane a basis", "6 Nov", false, "Vector spaces", "Sheet 3. You answered a basis"],
				["rank", "gap", "You count the vectors, not the dimension of their span", "Today", true, "Linear maps", null],
			],
		);
	});

	it("without arcs the rows wear no bubble; a press resumes the session that waits on the topic, else starts one", () => {
		const waiting = { id: "c1", title: "Rank", kind: "teach", createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:00:00Z", messageCount: 2, phase: "teach", pendingQuestion: true, pendingProblem: false, busy: false, compacting: false, course: { workspace: WS, title: "Linear Algebra" }, topics: ["rank"] } as ChatListItem;
		const rows = mistakeRows(STANDING, course(false), [waiting], null);
		assert.ok(rows.every((r) => r.arc === null));
		const doc = render(<MistakeList rows={rows} />);
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
