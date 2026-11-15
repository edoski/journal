/**
 * The course head's exam run-up (components/course-page/course-head/
 * head-parts.tsx, `ExamFact`), mounted open: it says whether he is ready in
 * the readiness line's own words, read from the same facts (round 6: the
 * head named the topics not yet solid while its run-up said "Every topic
 * fits before the exam").
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
import type { CalendarCourse, CourseMapTopic, CourseReadiness, ReadinessPart, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { ExamFact } from "../components/course-page/course-head/head-parts.tsx";
import { examReady } from "../components/course-page/standing/standing-model.ts";
import { ReadyLine } from "../components/course-page/standing/ready-line.tsx";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle[0]!.toUpperCase() + handle.slice(1), level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });

const course: StudyCourse = {
	map: {
		workspace: "/study/linalg",
		title: "Linear Algebra",
		today: "2026-11-08",
		revision: 1,
		exam: { date: "2026-12-03", daysLeft: 25 },
		current: h("span"),
		focus: null,
		tasks: [],
		topics: [topic("span", { level: "retained" }), topic("basis"), topic("rank"), topic("kernel"), topic("eigen", { level: "new", introduced: null })],
		edges: [],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};
const runup: CalendarCourse = { ...course, planned: [{ date: "2026-11-12", reviews: [], new: [h("eigen")] }], doesNotFit: [], finalReview: "2026-11-25" };
const part = (over: Partial<ReadinessPart>): ReadinessPart => ({ solid: [], notYet: [], toStart: [], wontFit: [], ...over });
const readiness = (over: Partial<ReadinessPart>): CourseReadiness => ({ date: "2026-12-03", daysLeft: 25, parts: [part(over)] });

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
});

/** The run-up as he sees it after pressing "Exam in 25 days". */
async function opened(ready: ReturnType<typeof examReady> | null, shown: StudyCourse = course) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<ExamFact course={shown} runup={runup} words="Exam in 25 days" ready={ready} />
				{ready && <ReadyLine course={shown} ready={ready} />}
			</AppRouterContext.Provider>,
		),
	);
	await act(async () => {
		document.querySelector("[data-slot=course-exam]")!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
	});
	const panel = document.querySelector("[data-slot=course-exam-runup]");
	assert.ok(panel, "the run-up opens");
	return panel;
}

describe("the exam's run-up", () => {
	it("says what the head says while topics are not yet solid, never that every topic fits", async () => {
		const ready = examReady(readiness({ solid: [h("span")], notYet: [h("basis"), h("rank"), h("kernel")], toStart: [h("eigen")] }), course.map, null, []);
		const panel = await opened(ready);
		assert.doesNotMatch(panel.textContent ?? "", /Every topic fits/);
		assert.equal(panel.querySelector("[data-slot=course-exam-ready]")?.textContent, "Not yet solid for the exam: Basis, Rank and Kernel");
	});

	it("names the least ready as the head does, and its \"and the rest\" opens every topic, least ready first", async () => {
		// Round 9, 2 m13: Linear Algebra's line named nine topics; the run-up repeats it word for word.
		const many: StudyCourse = { ...course, map: { ...course.map, topics: [...course.map.topics, topic("det"), topic("cramer", { level: "attempted" })] } };
		const mistakes = [{ topic: h("kernel"), gap: "Counted nonzero entries", latest: "2026-11-07", answers: [] }];
		const ready = examReady(readiness({ solid: [h("span")], notYet: ["basis", "rank", "kernel", "det", "cramer"].map(h) }), many.map, null, mistakes);
		const panel = await opened(ready, many);
		const said = panel.querySelector("[data-slot=course-exam-ready]")!.textContent;
		assert.equal(said, "Not yet solid for the exam: Kernel, Cramer, Basis and the rest");
		assert.equal(document.querySelector("[data-slot=course-ready]")!.textContent, said, "the head's line says the run-up's words");
		await act(async () => {
			panel.querySelector("[data-slot=ready-rest]")!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
		});
		const list = document.querySelector("[data-slot=ready-rest-list]");
		assert.ok(list, "the rest opens");
		assert.match(list.textContent ?? "", /^Not yet solid for the exam/);
		const links = [...list.querySelectorAll("a")];
		assert.deepEqual(links.map((a) => a.textContent), ["Kernel", "Cramer", "Basis", "Rank", "Det"], "every topic the line means, least ready first");
		assert.ok(links.every((a) => /^\/unit\//.test(a.getAttribute("href") ?? "")), "each opens its topic's page");
	});

	it("names the topics with no room before the exam, in the warning ink", async () => {
		const ready = examReady(readiness({ notYet: [h("basis")], wontFit: [h("eigen")] }), course.map, null, []);
		const line = (await opened(ready)).querySelector("[data-slot=course-exam-ready]")!;
		assert.equal(line.textContent, "No room before the exam to start Eigen");
		assert.match(line.getAttribute("class") ?? "", /text-warning/);
	});

	it("says nothing about readiness while the engine is read", async () => {
		const panel = await opened(null);
		assert.equal(panel.querySelector("[data-slot=course-exam-ready]"), null);
		assert.doesNotMatch(panel.textContent ?? "", /Every topic fits/);
	});
});
