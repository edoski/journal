/**
 * Arcs carried through the rest of the app: Home's rows name the arc a
 * lesson sits in and why a new topic starts now, the sidebar's cards show
 * no arc (Edo kept them as they were), the topic page's head links its
 * course and its arc and says why a topic not started comes when it does,
 * and search finds arcs by name. A course without arcs reads as it did. Linear Algebra
 * cut into three arcs (`LINALG_ARCS`), engine day 2026-11-08.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle, CourseMapTopic, StartsWhy, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { arcPlace, lessonOf } from "../components/study-home/lesson-facts.ts";
import { nextStepOf, todayRows, type TodayRow } from "../components/study-home/study-facts.ts";
import { placeOf, whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { NowCard } from "../components/unit-inbox/now-card.tsx";
import { topicUnit, unitFor } from "../components/unit-inbox/now-inbox.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import { TopicCard } from "../components/unit-inbox/unit-row.tsx";
import { CourseResultRow } from "../components/unit-inbox/course-result-row.tsx";
import { searchInbox } from "../components/unit-inbox/unit-sidebar.tsx";
import { arcHref, courseHref } from "../components/unit-inbox/unit-href.ts";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { TopicHead } from "../components/unit-inbox/topic-page/topic-head.tsx";
import { pickupSections } from "../components/unit-inbox/topic-page/pickup/pickup-facts.ts";
import { SectionsPane } from "../components/unit-inbox/topic-page/pickup/sections.tsx";
import { chat, LINALG, LINALG_ARCS, TODAY } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;

const h = (...handles: string[]) => handles as TopicHandle[];
const arc = (handle: string) => handle as ArcHandle;

/** The course with Diagonalization planned today, for the reason it starts. */
function planned(course: StudyCourse, startsWhy: StartsWhy): StudyCourse {
	const topics = course.map.topics.map((t): CourseMapTopic => (t.handle === "diag" ? { ...t, starts: TODAY, startsWhy } : t));
	return { ...course, due: [], newToday: h("diag"), map: { ...course.map, topics } };
}

const row = (course: StudyCourse): TodayRow => ({ kind: "course", course, step: nextStepOf(course) });

describe("Home's rows", () => {
	it("name the arc when every topic of the lesson lies in it, and none when the lesson spans arcs", () => {
		assert.equal(arcPlace(LINALG_ARCS.map, h("rank", "det")), "Linear systems");
		assert.equal(arcPlace(LINALG_ARCS.map, h("independence", "rank")), null, "a review that mixes arcs names none");
		assert.equal(arcPlace(LINALG_ARCS.map, h("gone")), null);
		assert.equal(arcPlace(LINALG_ARCS.map, []), null);
		assert.equal(arcPlace(LINALG.map, h("rank", "det")), null, "a course without arcs has no place");
	});

	it("put the arc on the course line, for a course's step and for a waiting session", () => {
		const [review] = todayRows([LINALG_ARCS], [], TODAY);
		assert.deepEqual(lessonOf(review!).topics, ["independence"]);
		assert.equal(placeOf(review!), "Linear Algebra · Vector spaces");
		const waiting = chat("q", { pendingQuestion: true, updatedAt: `${TODAY}T09:00:00.000Z`, course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["eigen", "charpoly"] });
		const [session] = todayRows([LINALG_ARCS], [waiting], TODAY);
		assert.equal(placeOf(session!), "Linear Algebra · Eigenvalues");
		assert.equal(placeOf(todayRows([LINALG], [], TODAY)[0]!), "Linear Algebra", "the course alone without arcs");
		const doc = render(<HybridRows rows={[review!, session!]} busy={false} onContinue={() => {}} />);
		assert.deepEqual(
			[...doc.querySelectorAll('[data-slot="today-course"]')].map((line) => line.textContent),
			["Linear Algebra · Vector spaces", "Linear Algebra · Eigenvalues"],
		);
	});

	it("give a planned new topic its reason with its own icon, cut to fit the row", () => {
		const after = planned(LINALG_ARCS, { kind: "after", arc: arc("eigenvalues"), needs: h("eigen"), partners: [] });
		assert.deepEqual(whyOf(row(after)), { kind: "next", starts: "after", short: "After Eigenvalues and eigenvectors" });
		const next = planned(LINALG_ARCS, { kind: "next", arc: arc("eigenvalues") });
		assert.equal(whyOf(row(next))?.short, "Next in Eigenvalues");
		const early = planned(LINALG_ARCS, { kind: "early", arc: arc("eigenvalues"), waitingOn: h("rank"), exam: false });
		assert.deepEqual([whyOf(row(early))?.starts, whyOf(row(early))?.short], ["early", "Early, from Eigenvalues"], "the waiting clause stays on the topic page");
		const doc = render(<HybridRows rows={[row(after)]} busy={false} onContinue={() => {}} />);
		const why = doc.querySelector('[data-slot="today-why"]')!;
		assert.equal(why.getAttribute("data-starts"), "after");
		assert.equal(why.textContent, "After Eigenvalues and eigenvectors");
	});

	it("keep today's words for a planned topic in a course without arcs", () => {
		const plain = planned(LINALG, { kind: "next" });
		assert.deepEqual(whyOf(row(plain)), { kind: "next", short: "Planned today" });
	});
});

describe("the sidebar's cards", () => {
	it("keep the course line alone, with no arc, even in a course with arcs (Edo, 14 Nov 2026)", () => {
		const [line] = needsYouNow([LINALG_ARCS], [], TODAY).lines;
		const inbox = buildInbox([LINALG_ARCS], [], null);
		const today = render(<NowCard line={line!} unit={topicUnit(inbox, LINALG_ARCS, line!.lead!, [])} active={false} />);
		assert.equal(today.querySelector('[data-slot="unit-card-course"]')?.textContent, "Linear Algebra");
		const rank = LINALG_ARCS.map.topics.find((t) => t.handle === "rank")!;
		const found = render(<TopicCard unit={unitFor(LINALG_ARCS, rank, [])} today={TODAY} active={false} />);
		assert.equal(found.querySelector('[data-slot="unit-card-course"]')?.textContent, "Linear Algebra");
	});
});

describe("the topic page", () => {
	const rank = LINALG_ARCS.map.topics.find((t) => t.handle === "rank")!;

	it("links the course and the arc in its head, the arc to its place on the course page", () => {
		const facts = topicFacts({ course: LINALG_ARCS, topic: rank, chats: [], read: null });
		assert.deepEqual(facts.arc, { handle: "systems", title: "Linear systems" });
		const doc = render(<TopicHead facts={facts} />);
		assert.equal(doc.querySelector('[data-slot="topic-course-link"]')?.getAttribute("href"), courseHref("/s/linalg"));
		const link = doc.querySelector('[data-slot="topic-arc-link"]')!;
		assert.equal(link.textContent, "Linear systems");
		assert.equal(link.getAttribute("href"), `${courseHref("/s/linalg")}?arc=systems`);
		assert.equal(arcHref("/s/linalg", "systems"), link.getAttribute("href"));
	});

	it("has only the course link without arcs", () => {
		const facts = topicFacts({ course: LINALG, topic: rank, chats: [], read: null });
		assert.equal(facts.arc, null);
		const doc = render(<TopicHead facts={facts} />);
		assert.equal(doc.querySelector('[data-slot="topic-arc-link"]'), null);
		assert.equal(doc.querySelector('[data-slot="page-eyebrow"]')?.textContent, "Linear Algebra");
	});

	it("says why a topic not started comes when it does, under its planned first lesson", () => {
		const startsWhy: StartsWhy = { kind: "after", arc: arc("eigenvalues"), needs: h("eigen"), partners: [] };
		const diag = { ...LINALG_ARCS.map.topics.find((t) => t.handle === "diag")!, starts: "2026-11-11", startsWhy };
		const course = { ...LINALG_ARCS, map: { ...LINALG_ARCS.map, topics: LINALG_ARCS.map.topics.map((t) => (t.handle === "diag" ? diag : t)) } };
		const facts = topicFacts({ course, topic: diag, chats: [], read: null });
		assert.deepEqual(facts.startsWhy, { kind: "after", words: "After Eigenvalues and eigenvectors, which it needs" });
		const { now } = pickupSections(facts);
		assert.deepEqual([now.kind, now.note, now.why], ["start", "Planned Wed 11 Nov", facts.startsWhy]);
		const doc = render(<SectionsPane facts={facts} busy={false} onAct={() => {}} onTask={() => {}} shown={null} onShow={() => {}} />);
		const line = doc.querySelector('[data-slot="pickup-now"] [data-slot="topic-starts-why"]')!;
		assert.equal(line.textContent, "After Eigenvalues and eigenvectors, which it needs");
		assert.equal(line.getAttribute("data-kind"), "after");
		const withSession = topicFacts({ course, topic: diag, chats: [chat("d", { topics: ["diag"], pendingQuestion: true, course: { workspace: "/s/linalg", title: "Linear Algebra" } })], read: null });
		assert.deepEqual(pickupSections(withSession).scheduled?.why, facts.startsWhy, "Scheduled's first lesson says it too, when Now does not start it");
		const plain = topicFacts({ course: { ...LINALG, map: { ...LINALG.map, topics: LINALG.map.topics.map((t) => (t.handle === "diag" ? diag : t)) } }, topic: diag, chats: [], read: null });
		assert.equal(plain.startsWhy, null, "a course without arcs says what it said before");
		assert.equal(pickupSections(plain).now.why, null);
	});
});

describe("search", () => {
	it("finds an arc by name as a course result reading 'Linear systems, in Linear Algebra' that opens its place", () => {
		const inbox = buildInbox([LINALG_ARCS], [], null);
		const found = searchInbox(inbox, [], "systems", [LINALG_ARCS]);
		assert.deepEqual(
			found.arcs.map((f) => [f.course.map.title, f.arc.handle]),
			[["Linear Algebra", "systems"]],
		);
		const doc = render(<CourseResultRow course={found.arcs[0]!.course} arc={found.arcs[0]!.arc} active={false} />);
		const link = doc.querySelector('[data-testid="course-result"]')!;
		assert.equal(link.querySelector(":scope > span:last-child")?.textContent, "Linear systems, in Linear Algebra");
		assert.equal(link.getAttribute("href"), arcHref("/s/linalg", "systems"));
	});

	it("finds no arcs in a course without them", () => {
		assert.deepEqual(searchInbox(buildInbox([LINALG], [], null), [], "systems", [LINALG]).arcs, []);
	});
});
