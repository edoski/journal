/**
 * The course page's head arrives whole (components/course-page/
 * course-frame.tsx): the readiness line and Mistakes come with the page,
 * whichever of the course and its standing is read first, so the head never
 * shows without them and never grows under him (round 8: 2 m7, they
 * appeared 2.1 s after the page and pushed it down; 1 D14, Linear Algebra's
 * head showed readiness only sometimes). A standing that cannot be read
 * never holds the page.
 */

import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
// Next's Link schedules its prefetch on `self`, which the test DOM lacks.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMapTopic, CourseStanding, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { CourseFrame } from "../components/course-page/course-frame.tsx";
import { CourseHead } from "../components/course-page/course-head/course-head.tsx";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });
const WS = "/study/linear-algebra";
const course: StudyCourse = {
	map: {
		workspace: WS,
		title: "Linear Algebra",
		today: "2026-11-08",
		revision: 1,
		exam: { date: "2026-12-03", daysLeft: 25 },
		current: h("eigen"),
		focus: null,
		tasks: [],
		topics: [topic("span", "Span", { level: "retained" }), topic("rank", "Rank and the column space", { signals: { ...QUIET, mistake: true } }), topic("eigen", "Eigenvalues and eigenvectors")],
		edges: [],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};
const standing: CourseStanding = {
	readiness: { date: "2026-12-03", daysLeft: 25, parts: [{ solid: [h("span")], notYet: [h("rank"), h("eigen")], toStart: [], wontFit: [] }] },
	mistakes: [{ topic: h("rank"), gap: "You count nonzero entries instead of pivots", latest: "2026-11-06", answers: [] }],
};

/** A read the test answers when it chooses. */
function later<T>() {
	let answer!: (value: T) => void;
	let refuse!: (error: Error) => void;
	const promise = new Promise<T>((resolve, reject) => {
		answer = resolve;
		refuse = reject;
	});
	return { promise, answer, refuse };
}

const originalFetch = globalThis.fetch;
let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
	globalThis.fetch = originalFetch;
});

/** The page as SplitCourse draws its head, with the course and its standing each answered by the test. */
async function mount() {
	const study = later<Response>();
	const standingRead = later<Response>();
	globalThis.fetch = ((input: string) => {
		const url = String(input).split("?")[0];
		if (url === "/api/study") return study.promise;
		if (url === "/api/course-standing") return standingRead.promise;
		if (url === "/api/chats") return Promise.resolve(Response.json({ chats: [] }));
		return Promise.resolve(Response.json({ available: false, reason: "test" }));
	}) as typeof fetch;
	const host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>
					<CourseFrame workspace={WS}>{({ view, standing: known, busy, onContinue }) => <CourseHead view={view} standing={known} busy={busy} onContinue={onContinue} />}</CourseFrame>
				</ServerEventsProvider>
			</AppRouterContext.Provider>,
		),
	);
	const settle = async (read: { answer: (r: Response) => void }, body: unknown) => {
		await act(async () => read.answer(Response.json(body)));
		await act(async () => {});
	};
	return {
		course: () => settle(study, { available: true, courses: [course], failed: [] }),
		standing: () => settle(standingRead, { ok: true, standing }),
		standingFails: async () => {
			await act(async () => standingRead.refuse(new Error("engine down")));
			await act(async () => {});
		},
	};
}

/** What the head shows now: nothing while reading, else its title, readiness words and whether Mistakes is there. */
function head() {
	const title = document.querySelector("[data-slot=course-title]");
	if (!title) return null;
	const ready = document.querySelector("[data-slot=course-ready]");
	return { title: title.textContent, ready: ready?.getAttribute("data-kind") ? ready.textContent : null, mistakes: document.querySelector("[data-slot=course-mistakes]") !== null };
}

const WHOLE = { title: "Linear Algebra", ready: "Not yet solid for the exam: Rank and the column space and Eigenvalues and eigenvectors", mistakes: true };

describe("the course head arrives whole", () => {
	it("waits for its standing when the course is read first, then shows the readiness line and Mistakes at once", async () => {
		const page = await mount();
		await page.course();
		assert.equal(head(), null, "no head without its readiness: the skeleton holds the place");
		assert.ok(document.querySelector("[data-slot=course-header-skeleton]"));
		await page.standing();
		assert.deepEqual(head(), WHOLE);
	});

	it("shows the same head when the standing is read first", async () => {
		const page = await mount();
		await page.standing();
		assert.equal(head(), null);
		await page.course();
		assert.deepEqual(head(), WHOLE);
	});

	it("still shows the course when its standing cannot be read", async () => {
		const page = await mount();
		await page.course();
		await page.standingFails();
		assert.deepEqual(head(), { title: "Linear Algebra", ready: null, mistakes: false });
	});
});
