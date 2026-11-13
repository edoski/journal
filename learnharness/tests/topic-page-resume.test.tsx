/**
 * The hybrid topic page's resume options: every row of the action table
 * (`topicAction`) said and done from the composer foot, by the line and
 * the chips. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import { topicFacts, type TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import {
	freshAction,
	resumeChips,
	resumeLine,
	sessionName,
} from "../components/unit-inbox/topic-page/resume/resume-facts.ts";
import { ResumeChipsFoot } from "../components/unit-inbox/topic-page/resume/resume-chips.tsx";
import { ResumeLineFoot } from "../components/unit-inbox/topic-page/resume/resume-line.tsx";
import type { ResumeProps } from "../components/unit-inbox/topic-page/resume/resume-parts.tsx";

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: handle as TopicHandle, title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const EIGEN = topic("eigen", { title: "Eigenvalues and eigenvectors" });
const SPAN = topic("span", { title: "Span", level: "retained", introduced: "2026-10-16", review: { kind: "due", date: "2026-11-06", overdue: 2 } });
const RANK = topic("rank", { title: "Rank and the column space", level: "assisted", introduced: "2026-10-30", tasks: ["sheet-4", "sheet-5"] });
const INVERTIBILITY = topic("invertibility", { title: "Invertibility" });
const DET = topic("determinant", { title: "Determinants as volume scaling", level: "assisted", introduced: "2026-11-02" });
const VECTORS = topic("vectors", { title: "Vectors", level: "retained", introduced: "2026-10-01", review: { kind: "scheduled", date: "2026-11-13" } });
const MAP: CourseMap = {
	workspace: WORKSPACE,
	title: "Linear Algebra",
	today: TODAY,
	revision: 13,
	exam: null,
	current: "rank" as TopicHandle,
	focus: "sheet-4",
	tasks: [
		{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" },
		{ key: "sheet-5", title: "Problem sheet 5", step: null },
	],
	topics: [EIGEN, SPAN, RANK, INVERTIBILITY, DET, VECTORS],
	edges: [],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, lastActiveDaysAgo: 0 };

function chat(id: string, title: string, updatedAt: string, over: Partial<ChatListItem> = {}): ChatListItem {
	return { id, title, createdAt: updatedAt, updatedAt, kind: "teach", messageCount: 6, phase: "teach", pendingQuestion: false, pendingProblem: false, course: { workspace: WORKSPACE, title: "Linear Algebra" }, topics: [], busy: false, compacting: false, ...over };
}

const factsOf = (t: CourseMapTopic, sessions: ChatListItem[] = []): TopicFacts => topicFacts({ course: COURSE, topic: t, sessions, read: { record: null, plans: [] } });

/** One topic per row of the action table, in the table's order. */
const ROWS: Array<[string, TopicFacts]> = [
	["resume", factsOf(EIGEN, [chat("chat_eigen", "Eigenvalues and eigenvectors", "2026-11-08T08:19:40.000Z", { pendingQuestion: true, topics: ["eigen"] })])],
	["open", factsOf(EIGEN, [chat("chat_eigen", "Eigenvalues and eigenvectors", "2026-11-08T08:19:40.000Z", { busy: true, topics: ["eigen"] })])],
	["review", factsOf(SPAN)],
	["continue a task", factsOf(RANK, [chat("chat_rank", "Rank, second pass", "2026-11-03T14:32:01.000Z", { topics: ["rank"] })])],
	["start", factsOf(INVERTIBILITY)],
	["continue", factsOf(DET)],
	["study", factsOf(VECTORS)],
];
const row = (name: string) => ROWS.find(([n]) => n === name)![1];

describe("the resume line", () => {
	it("says every row of the action table, with the head button's word as its press", () => {
		assert.deepEqual(
			ROWS.map(([, facts]) => {
				const line = resumeLine(facts);
				return [line.kind, line.icon, line.words, line.detail, line.press];
			}),
			[
				["resume", "reply", "Your turn in today's lesson", "Question waiting", "Resume"],
				["open", "writing", "The tutor is writing in today's lesson", null, "Open"],
				["review", "review", "Review overdue by 2 days", null, "Review"],
				["continue", "task", "Problem sheet 4", "Part (c)", "Continue"],
				["start", "standing", "Not started", null, "Start"],
				["continue", "standing", "Nearly on your own", null, "Continue"],
				["study", "review", "Next review Fri 13 Nov", null, "Study"],
			],
		);
	});

	it("names a session by its day and kind, in a sentence", () => {
		const facts = factsOf(RANK, [chat("chat_practice", "Rank practice", "2026-11-07T08:00:00.000Z", { kind: "practice", topics: ["rank"] })]);
		assert.equal(sessionName(facts.sessions[0]!, TODAY), "yesterday's practice");
	});
});

describe("the resume chips", () => {
	it("lead with the page's action in every row, opening a session or starting one with the action's opening", () => {
		assert.deepEqual(
			ROWS.map(([, facts]) => {
				const [chip] = resumeChips(facts);
				return [chip!.words, chip!.does];
			}),
			[
				["Resume today's lesson", { kind: "open", chat: "chat_eigen" }],
				["Open today's lesson", { kind: "open", chat: "chat_eigen" }],
				["Start a review", { kind: "start", opening: "Review Span" }],
				["Continue Problem sheet 4", { kind: "start", opening: "Continue Problem sheet 4" }],
				["Start learning", { kind: "start", opening: "Invertibility" }],
				["Keep learning", { kind: "start", opening: "Continue Determinants as volume scaling" }],
				["Study ahead", { kind: "start", opening: "Vectors" }],
			],
		);
	});

	it("add each other open task that holds the topic, never the one the action continues twice", () => {
		assert.deepEqual(resumeChips(row("continue a task")).map((chip) => chip.words), ["Continue Problem sheet 4", "Continue Problem sheet 5"]);
		const waiting = factsOf(RANK, [chat("chat_rank", "Rank practice", "2026-11-08T07:54:30.000Z", { kind: "practice", pendingProblem: true, topics: ["rank"] })]);
		assert.deepEqual(resumeChips(waiting).map((chip) => chip.words), ["Resume today's practice", "Continue Problem sheet 4", "Continue Problem sheet 5"]);
	});
});

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
const props = (facts: TopicFacts, text = ""): ResumeProps => ({
	facts,
	fresh: freshAction(facts.topic, MAP),
	busy: false,
	text,
	onText: () => {},
	onAct: () => {},
	onStart: () => {},
	onSend: () => {},
	onOpen: () => {},
});

describe("the resume options drawn", () => {
	it("dock the line on the composer's top edge in every row, its press last, and a field that starts a new lesson", () => {
		for (const [name, facts] of ROWS) {
			const document = render(<ResumeLineFoot {...props(facts)} />);
			const line = document.querySelector('[data-slot="composer"] > [data-slot="resume-line"]');
			assert.ok(line, name);
			assert.equal(line!.getAttribute("type"), "button", name);
			assert.equal(line!.getAttribute("data-action"), facts.action.kind, name);
			assert.ok(line!.textContent!.endsWith(resumeLine(facts).press), name);
			assert.equal(document.querySelector("textarea")!.getAttribute("placeholder"), `Ask about ${facts.topic.title} to start a new lesson`, name);
		}
	});

	it("put one chip per place to pick up in the composer's toolbar, as buttons that never submit", () => {
		const document = render(<ResumeChipsFoot {...props(row("continue a task"))} />);
		const chips = [...document.querySelectorAll('[data-slot="composer-toolbar"] [data-slot="composer-chip"]')];
		assert.deepEqual(chips.map((chip) => [chip.getAttribute("data-chip"), chip.getAttribute("type"), chip.textContent]), [
			["action", "button", "Continue Problem sheet 4"],
			["task:sheet-5", "button", "Continue Problem sheet 5"],
		]);
	});
});
