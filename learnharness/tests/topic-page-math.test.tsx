/**
 * Math on the hybrid topic page under Pick up: a step title or a history
 * line written with TeX is typeset by MathText in the map's steps and the
 * list's rows alike, a screen reader hears it as plain words, and a title
 * with no formula stays plain text. The determinant plan is the seeded
 * demo's own (fixtures/topic) with its titles rewritten in TeX. Same tsx
 * classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, ChatRecord } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import type { SessionPlan } from "../src/core/contracts/topic.ts";
import { sessionPlanOf } from "../src/server/topic.ts";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { HybridTopic } from "../components/unit-inbox/topic-page/hybrid/hybrid-topic.tsx";
import { PICKUP_PANES } from "../components/unit-inbox/topic-page/pickup/pickup-options.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };
const DET: CourseMapTopic = { handle: "determinant" as TopicHandle, title: "Determinants as volume scaling", level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [] };
const MAP: CourseMap = { workspace: WORKSPACE, title: "Linear Algebra", today: TODAY, revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [DET], edges: [] };
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, lastActiveDaysAgo: 0 };

const PRODUCT = "$\\det(AB) = \\det A \\cdot \\det B$";
const TEX: Record<string, string> = { "det(AB) = det A · det B": PRODUCT, "det is the area scale factor": "$\\det$ is the area scale factor" };
const PLAIN = "The sign records orientation";

const source = sessionPlanOf(fixture("chat_demo_det.json") as ChatRecord) as SessionPlan;
const PLAN: SessionPlan = { ...source, tree: { ...source.tree, nodes: source.tree.nodes.map((node) => ({ ...node, title: TEX[node.title] ?? node.title })) } };

const LESSON: ChatListItem = {
	id: "chat_demo_det",
	title: "Why $\\det(AB)$ multiplies",
	createdAt: "2026-11-08T08:00:00.000Z",
	updatedAt: "2026-11-08T08:00:00.000Z",
	kind: "teach",
	messageCount: 6,
	phase: "teach",
	pendingQuestion: true,
	pendingProblem: false,
	course: { workspace: WORKSPACE, title: "Linear Algebra" },
	topics: ["determinant"],
	busy: false,
	compacting: false,
};
const EARLIER: ChatListItem = { ...LESSON, id: "chat_cofactors", title: "$\\det$ by cofactors", updatedAt: "2026-11-06T08:00:00.000Z", pendingQuestion: false };
const ATTEMPT = { id: "o1", date: "2026-11-07", recorded: null, result: "partial" as const, unaided: false, sure: null, chose: null, text: "Read $\\det = -2$ as an area doubled and flipped" };

const facts = topicFacts({ course: COURSE, topic: DET, sessions: [LESSON, EARLIER], read: { record: { attempts: [ATTEMPT], tasks: [] }, plans: [PLAN] } });
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const document = parseHTML(
	`<html><body>${renderToStaticMarkup(
		<AppRouterContext.Provider value={router as never}>
			<HybridTopic facts={facts} busy={false} onAct={() => {}} onTask={() => {}} pane={PICKUP_PANES.sections} />
		</AppRouterContext.Provider>,
	)}</body></html>`,
).document;

const step = (words: string) => [...document.querySelectorAll('[data-slot="topic-step"]')].find((el) => el.getAttribute("aria-label")!.startsWith(words))!;

describe("math on the topic page", () => {
	it("typesets a step title's formula in its map node, and names it in plain words", () => {
		const node = step("det(AB) = det A · det B");
		assert.ok(node, "the node's label is the plain words");
		assert.equal(node.querySelectorAll('[data-slot="math-text"] .katex').length, 1);
		assert.doesNotMatch(node.getAttribute("aria-label")!, /\$|\\det/);
		const caption = document.querySelector('[data-slot="topic-steps"] figcaption')!.textContent!;
		assert.match(caption, /Your turn on det\(AB\) = det A · det B/);
	});

	it("keeps a plain step title plain", () => {
		const node = step(PLAIN);
		assert.equal(node.querySelector('[data-slot="math-text"]'), null);
		assert.match(node.textContent!, new RegExp(PLAIN));
	});

	it("typesets the step Now stopped on, a session's title and an attempt's sentence in the list", () => {
		const now = document.querySelector('[data-slot="pickup-now"]')!;
		assert.ok(now.querySelector('[data-slot="pickup-now-words"] [data-slot="math-text"] .katex'), "Now's step");
		const row = document.querySelector('[data-slot="topic-history-session"]')!;
		assert.ok(row.querySelector('[data-slot="math-text"] .katex'), "a session's title");
		const attempt = document.querySelector('[data-slot="topic-attempt"]')!;
		assert.ok(attempt.querySelector('[data-slot="math-text"] .katex'), "the attempt");
		for (const el of [now, attempt]) assert.doesNotMatch(el.textContent!, /\$/, "no dollar is left in the words");
	});
});

describe("math in the topic page's head and Next", () => {
	const SHEET = { key: "sheet-4", title: "Problem sheet 4", step: "Part (c): show $\\dim\\ker A = 2$" };
	const RANK: CourseMapTopic = {
		...DET,
		handle: "rank" as TopicHandle,
		title: "Rank of $A^T A$",
		level: "assisted",
		weak: true,
		signals: { ...QUIET, gap: "Reads $\\operatorname{rank} A$ as the number of rows" },
		tasks: ["sheet-4"],
	};
	const map: CourseMap = { ...MAP, topics: [RANK], tasks: [SHEET] as CourseMap["tasks"] };
	const rankFacts = topicFacts({ course: { ...COURSE, map }, topic: RANK, sessions: [{ ...LESSON, topics: ["rank"] }], read: { record: { attempts: [], tasks: [] }, plans: [] } });
	const page = parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<HybridTopic facts={rankFacts} busy={false} onAct={() => {}} onTask={() => {}} pane={PICKUP_PANES.sections} />
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

	it("typesets the title and the mistake under it", () => {
		const head = page.querySelector('[data-slot="topic-head"]')!;
		assert.ok(head.querySelector("h1 .katex"), "the title");
		assert.ok(head.querySelector('[data-slot="unit-gap"] .katex'), "the mistake");
		assert.doesNotMatch(head.textContent!, /\$/);
	});

	it("typesets the step an unfinished task stopped on", () => {
		const next = page.querySelector('[data-slot="pickup-next"][data-kind="task"]')!;
		assert.ok(next.querySelector(".katex"));
		assert.doesNotMatch(next.textContent!, /\$/);
	});
});
