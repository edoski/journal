/**
 * The course page head candidates (components/course-page/course-head/):
 * the facts each adds, from the engine's plan and record only, and what
 * every candidate drops and keeps: no progress words and no line that
 * repeats the rows, the title and the press kept, Context in place of
 * Add material, "Studied" opening his last session.
 */

import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseRead } from "../components/course-page/course-model.ts";
import { aheadWords, lastSessionOf, namesWords, nextStartOf, paceOf } from "../components/course-page/course-head/head-facts.ts";
import { PaceHead } from "../components/course-page/course-head/pace-head.tsx";
import { BriefHead } from "../components/course-page/course-head/brief-head.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle[0]!.toUpperCase() + handle.slice(1), level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });
const WS = "/study/probability";

function course(over: Partial<StudyCourse["map"]> = {}, rest: Partial<Omit<StudyCourse, "map">> = {}): StudyCourse {
	return {
		map: {
			workspace: WS,
			title: "Probability",
			today: "2026-11-08",
			revision: 1,
			exam: { date: "2026-11-19", daysLeft: 11 },
			current: h("bayes"),
			focus: null,
			tasks: [],
			topics: [topic("bayes", { level: "assisted", introduced: "2026-11-01" }), topic("binomial", { level: "attempted", introduced: "2026-11-03" }), topic("poisson"), topic("variance")],
			edges: [],
			...over,
		},
		unready: null,
		due: [],
		lastActiveDaysAgo: 2,
		newToday: [],
		...rest,
	};
}

const plan = (doesNotFit: string[] = []) => ({ doesNotFit: doesNotFit.map(h), planned: [{ date: "2026-11-08", reviews: [], new: [h("poisson")] }, { date: "2026-11-12", reviews: [], new: [h("variance")] }] });

describe("pace, from the engine's plan", () => {
	it("names the topics the plan has no room for before the exam first", () => {
		assert.deepEqual(paceOf(course({}, { unready: [h("bayes")] }), plan(["variance"])), { kind: "short", words: "No room before the exam to start Variance" });
	});

	it("inside the run-up, names the topics not yet solid", () => {
		assert.deepEqual(paceOf(course({}, { unready: [h("bayes"), h("binomial")] }), plan()), { kind: "unready", words: "Not yet solid for the exam: Bayes and Binomial" });
	});

	it("says every topic fits, or that every topic is started", () => {
		assert.equal(paceOf(course(), plan())?.words, "Every topic fits before the exam");
		const taught = course({ topics: [topic("bayes", { introduced: "2026-11-01" }), topic("poisson", { excluded: "Not examined" })] });
		assert.equal(paceOf(taught, plan())?.words, "Every topic started");
	});

	it("says nothing with no exam ahead or before the plan is read", () => {
		assert.equal(paceOf(course({ exam: null }), plan()), null);
		assert.equal(paceOf(course(), null), null);
	});

	it("names four or more topics as three and others, never a count", () => {
		assert.equal(namesWords(["A", "B", "C", "D", "E"]), "A, B, C and others");
	});
});

describe("the road ahead", () => {
	it("is the next day after today the plan starts new topics, before the exam", () => {
		assert.deepEqual(nextStartOf(course(), plan()), { day: "2026-11-12", titles: ["Variance"] });
		assert.equal(nextStartOf(course({ exam: { date: "2026-11-10", daysLeft: 2 } }), plan()), null);
	});

	it("says the day as a sentence ends with it", () => {
		assert.equal(aheadWords("2026-11-09", "2026-11-08"), "tomorrow");
		assert.equal(aheadWords("2026-11-12", "2026-11-08"), "on Thursday");
		assert.equal(aheadWords("2026-11-20", "2026-11-08"), "on 20 Nov");
	});
});

const chat = (id: string, updatedAt: string, workspace = WS): ChatListItem =>
	({ id, title: `Session ${id}`, kind: "teach", createdAt: updatedAt, updatedAt, messageCount: 2, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false, compacting: false, course: { workspace, title: "Probability" } }) as ChatListItem;

describe("his last session", () => {
	it("is the course's latest, never another course's", () => {
		const chats = [chat("a", "2026-11-05T09:00:00Z"), chat("b", "2026-11-06T09:00:00Z"), chat("c", "2026-11-07T09:00:00Z", "/study/other")];
		assert.deepEqual(lastSessionOf(WS, chats), { id: "b", title: "Session b" });
		assert.equal(lastSessionOf(WS, []), null);
	});
});

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close: () => {} }) as never}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

function viewOf(c: StudyCourse, chats: ChatListItem[] = []) {
	const read = courseRead({ status: "ready", courses: [c], failed: [], open: [], chats }, c.map.workspace);
	assert.equal(read.status, "ready");
	return (read as Extract<typeof read, { status: "ready" }>).view;
}

describe("every candidate head", () => {
	for (const [name, Head] of [["Pace", PaceHead], ["Brief", BriefHead]] as const) {
		it(`${name}: the title and the press stay, Context replaces Add material, no progress words, no line repeating the rows, Studied opens the last session`, () => {
			const document = render(<Head view={viewOf(course({}, { due: [h("bayes")] }), [chat("b", "2026-11-06T09:00:00Z")])} busy={false} onContinue={() => {}} />);
			const text = document.body.textContent ?? "";
			assert.equal(document.querySelector("[data-slot=course-title]")?.textContent, "Probability");
			assert.ok(document.querySelector("[data-slot=course-action]"));
			assert.ok(document.querySelector("[data-slot=course-context]"));
			assert.equal(document.querySelector("[data-slot=course-add-material]"), null);
			assert.equal(document.querySelector("[data-slot=course-next]"), null);
			assert.doesNotMatch(text, /on your own/i);
			assert.equal(document.querySelector("[data-slot=course-studied]")?.getAttribute("href"), "/chat/b");
			assert.match(document.querySelector("[data-slot=course-exam]")?.textContent ?? "", /Exam in 11 days/);
		});
	}
});
