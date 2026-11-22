/**
 * The topic page's gaps (round 14, m36: 1 n9, with round 13's n6 and n11
 * remainders): Earlier's session row cut to "Eigenvalues a…" beside an
 * empty half-pane; the begun Poisson page's empty band under its title,
 * where the head said nothing; and no review day beside "Lesson
 * continues", though the engine's plan dates the first review after it.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { firstReviewOf } from "../src/server/topic.ts";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { pickupSections } from "../components/unit-inbox/topic-page/pickup/pickup-facts.ts";
import { HybridTopic } from "../components/unit-inbox/topic-page/hybrid/hybrid-topic.tsx";
import { SessionItem } from "../components/unit-inbox/topic-page/hybrid/history.tsx";
import { LESSON_BEGUN } from "../components/study-words.ts";

const TODAY = "2026-11-10";
const WORKSPACE = "/study/prob";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: handle as TopicHandle, title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });

const RV = topic("random-variables", { title: "Random variables and distributions", level: "assisted", introduced: "2026-11-02", review: { kind: "due", date: TODAY, overdue: 0 } });
const POISSON = topic("poisson", { title: "Poisson distribution", tasks: ["poisson-lesson"], starts: TODAY, startsWhy: { kind: "begun" } });
const MAP: CourseMap = {
	workspace: WORKSPACE, title: "Probability", today: TODAY, revision: 1, exam: null, current: "random-variables" as TopicHandle, focus: null,
	tasks: [{ key: "poisson-lesson", title: "Poisson distribution lesson", step: null, updated: "2026-11-09", topics: ["poisson" as TopicHandle] }],
	topics: [RV, POISSON],
	edges: [{ kind: "needs", prerequisite: "random-variables" as TopicHandle, topic: "poisson" as TopicHandle }],
};
const COURSE = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 1 };
const LESSON: ChatListItem = {
	id: "chat_poisson", title: "Poisson distribution lesson", createdAt: "2026-11-09T10:00:00.000Z", updatedAt: "2026-11-09T11:00:00.000Z", kind: "teach", messageCount: 9, phase: "teach",
	pendingQuestion: false, pendingProblem: false, course: { workspace: WORKSPACE, title: "Probability" }, topics: ["poisson"], ownTopics: ["poisson"], busy: false, ended: "left", tasks: ["poisson-lesson"],
};

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
const classes = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

describe("the begun lesson's page (m36)", () => {
	const facts = topicFacts({ course: COURSE, topic: POISSON, chats: [LESSON], read: { record: null, plans: [], firstReview: "2026-11-11" } });

	it("says where he stands under the title, the lesson in progress, never an empty band", () => {
		assert.equal(facts.standing?.words, LESSON_BEGUN);
		const head = render(<HybridTopic facts={facts} busy={false} onAct={() => {}} onTask={() => {}} />).querySelector('[data-slot="page-standing"]');
		assert.ok(head !== null, "the head's standing line is drawn");
		assert.match(head.textContent ?? "", new RegExp(LESSON_BEGUN));
	});

	it("keeps a topic a session only touched silent, since Not started would contradict it", () => {
		const touched = topicFacts({ course: COURSE, topic: { ...POISSON, tasks: [], startsWhy: undefined }, chats: [LESSON], read: null });
		assert.equal(touched.standing, null);
	});

	it("dates the first review the plan puts after the lesson, beside Lesson continues", () => {
		const { scheduled, review } = pickupSections(facts);
		assert.equal(scheduled?.kind, "lesson");
		assert.deepEqual(review, { day: "Wed 11 Nov" });
		const rows = [...render(<HybridTopic facts={facts} busy={false} onAct={() => {}} onTask={() => {}} />).querySelectorAll('[data-slot="pickup-scheduled"]')];
		assert.deepEqual(
			rows.map((row) => [row.getAttribute("data-kind"), row.querySelector('[data-slot="topic-history-date"]')?.textContent]),
			[
				["lesson", "Today"],
				["review", "Wed 11 Nov"],
			],
		);
	});

	it("reads that day from the engine's daily plan, the first day it reviews the topic", () => {
		const plan = { today: TODAY, courses: [{ plan: { days: [
			{ date: TODAY, reviews: ["random-variables"], new: ["poisson"] },
			{ date: "2026-11-11", reviews: ["poisson", "random-variables"], new: [] },
			{ date: "2026-11-14", reviews: ["poisson"], new: [] },
		] } }] };
		assert.equal(firstReviewOf(plan, "poisson"), "2026-11-11");
		assert.equal(firstReviewOf(plan, "geometric"), null);
		assert.equal(firstReviewOf(null, "poisson"), null);
	});
});

describe("Earlier's session row (m36)", () => {
	it("wraps a long title whole instead of cutting it beside the pane's free half", () => {
		const entry = { chat: { ...LESSON, title: "Eigenvalues and eigenvectors lesson: eigenspaces and diagonalising" }, state: "left", day: "2026-11-08", own: true, maps: true, plan: null } as never;
		const doc = render(<ol><SessionItem entry={entry} shown={false} onShow={() => {}} ends={{ above: false, below: false }} date="Sun 8 Nov" /></ol>);
		const title = doc.querySelector('[data-slot="topic-history-session-title"]');
		assert.ok(title !== null, "the session's title");
		assert.ok(!classes(title).includes("truncate"), `never cut: ${classes(title).join(" ")}`);
		const row = doc.querySelector('[data-testid="unit-page-session"]');
		assert.ok(!classes(row).includes("h-10") && classes(row).includes("min-h-10"), `40px for one line, taller for two: ${classes(row).join(" ")}`);
	});
});
