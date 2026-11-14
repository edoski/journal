/**
 * The lesson (polish pass phase 3): agent chrome stays out of the
 * column, the plan reads as a calm map, and his own words and math read
 * as his. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { PlanCard, PlanPanel, planMapSteps } from "../components/lesson/plan-map.tsx";
import { LiveToolCard } from "../components/artifacts/live-tool-card.tsx";
import { artifactRenderers } from "../components/artifacts/index.ts";
import { PhaseDivider } from "../components/phase-divider.tsx";
import { CompactionCutDivider } from "../components/compaction-divider.tsx";
import { ProseConclude, ProseProblem, ThinkingBubble } from "../components/lesson/prose/prose-practice.tsx";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { CourseLinkBody } from "../components/course-link-banner.tsx";
import { sessionStatLabels } from "../components/usage-format.ts";
import type { CourseChoice } from "../components/course-picker.tsx";
import type { ArtifactPartProps, PlanBlockData, QuestionAnswerData } from "../src/core/index.ts";

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

const part = (over: Record<string, unknown>) => over as unknown as ArtifactPartProps["part"];

const NODES = [
	{ id: "compute", title: "Computing a 2×2 spectrum" },
	{ id: "maps", title: "A matrix is a linear map" },
	{ id: "equation", title: "The eigen-equation" },
];
const EDGES = [
	{ from: "maps", to: "equation" },
	{ from: "equation", to: "compute" },
];

describe("plan map", () => {
	it("lists the steps in teaching order and marks where the learner is and what comes next", () => {
		const status: Record<string, "visited" | "current" | "upcoming"> = { maps: "visited", equation: "current", compute: "upcoming" };
		const steps = planMapSteps(NODES, EDGES, (id) => status[id]!);
		assert.deepEqual(steps.map((s) => [s.title, s.status, s.next]), [
			["A matrix is a linear map", "visited", false],
			["The eigen-equation", "current", false],
			["Computing a 2×2 spectrum", "upcoming", true],
		]);
	});

	it("before any step is current, the first step is next", () => {
		const steps = planMapSteps(NODES, EDGES, () => "upcoming");
		assert.deepEqual(steps.map((s) => s.next), [true, false, false]);
	});

	it("the transcript card names the steps, with no count and no node numbers", () => {
		const data = { kind: "full", at: "x", current: null, nodes: NODES.map((n) => ({ ...n, status: "upcoming" })), edges: EDGES } as PlanBlockData;
		const document = documentFor(<PlanCard data={data} onOpen={() => {}} />);
		const card = document.querySelector('[data-testid="plan-block-full"]')!;
		assert.match(card.textContent!, /^Plan/);
		assert.doesNotMatch(card.textContent!, /\d steps?/);
		assert.match(card.textContent!, /A matrix is a linear map/);
		assert.doesNotMatch(card.textContent!, /Node \d/);
		assert.equal(card.getAttribute("aria-label"), "Open the plan");
	});

	it("a step that names a formula shows it typeset", () => {
		const nodes = [{ id: "eq", title: "The eigen-equation $Av = \\lambda v$", status: "upcoming" }];
		const data = { kind: "full", at: "x", current: null, nodes, edges: [] } as unknown as PlanBlockData;
		const card = documentFor(<PlanCard data={data} onOpen={() => {}} />).querySelector('[data-testid="plan-block-full"]')!;
		assert.equal(card.querySelectorAll(".katex").length, 1);
		assert.doesNotMatch(card.textContent!, /\$/);
	});

	it("the plan panel derives statuses live: the latest tagged check is current, earlier ones visited", () => {
		const tree = { nodes: NODES, edges: EDGES, version: 1 };
		const messages = [
			{ parts: [{ type: "tool-plan_init", state: "output-available", output: { ok: true, tree } }] },
			{ parts: [{ type: "tool-quiz", state: "output-available", input: { nodeId: "maps" }, output: { correct: true } }] },
			{ parts: [{ type: "tool-quiz", state: "input-available", input: { nodeId: "equation" } }] },
		];
		const document = documentFor(<PlanPanel messages={messages} onClose={() => {}} />);
		const status = (id: string) => document.querySelector(`[data-testid="plan-step-${id}"]`)!.getAttribute("data-status");
		assert.equal(status("maps"), "visited");
		assert.equal(status("equation"), "current");
		assert.equal(status("compute"), "upcoming");
		assert.equal(documentFor(<PlanPanel messages={[]} onClose={() => {}} />).querySelectorAll('[data-testid^="plan-step-"]').length, 0, "no plan, no steps");
	});
});

describe("agent chrome out of the lesson", () => {
	it("a settled tool call leaves no row in the column: no renderer draws the agent's own tools", () => {
		for (const tool of ["read", "ls", "find", "grep", "list_sessions", "list_propositions", "course_resume", "course_show", "course_search", "course_save"]) {
			assert.equal(artifactRenderers[tool], undefined, tool);
		}
	});

	it("the prober's hand-off to the teacher stays out: no notes about the learner in the column", () => {
		assert.equal(artifactRenderers.probe_done, undefined);
	});

	it("a running tool is one muted activity line with no arguments", () => {
		const document = documentFor(<LiveToolCard part={part({ type: "tool-read", state: "input-streaming", toolCallId: "t", input: { path: "secret/notes.md" } })} />);
		const line = document.querySelector('[data-slot="activity-line"]')!;
		assert.equal(line.textContent, "Reading a file…");
		assert.doesNotMatch(document.body.textContent!, /secret\/notes\.md/);
	});

	it("phase changes are quiet section breaks; compaction leaves only a hairline, no token count", () => {
		const teach = documentFor(<PhaseDivider phase="teach" />).querySelector('[data-slot="section-break"]')!;
		assert.equal(teach.getAttribute("aria-label"), "Teaching");
		assert.equal(teach.textContent, "Teaching");
		const cut = documentFor(<CompactionCutDivider />);
		assert.equal(cut.body.textContent, "");
		assert.ok(cut.querySelector('[data-slot="section-break"]'));
	});
});

describe("lesson cards", () => {
	it("a problem he works on reads once, as the tutor's words; the commitment never shows", () => {
		const html = renderToStaticMarkup(<ProseProblem input={{ statement: "Find the rank.", modelSolution: "Eliminate." }} active={false} />);
		assert.match(html, /Find the rank\./);
		assert.doesNotMatch(html, /Eliminate/);
	});

	it("a given-up problem opens its model solution, with no tutor bookkeeping", () => {
		const html = renderToStaticMarkup(<ProseConclude toolCallId="c2" input={{ outcome: "surrendered", verdict: "You read the rows by eye.", rung: "R2", missClass: "execution" }} output={{}} reveal="Eliminate." />);
		assert.match(html, /Model solution/);
		assert.match(html, /Eliminate\./);
		assert.doesNotMatch(html, /Surrendered|Details|rung|Miss class/i);
	});

	it("the learner's own math is typeset, in an answer and in his thinking", () => {
		const input = { question: "Why?", correctAnswer: "Because." };
		const answer = { kind: "explain", tool: "explain", questionText: "Why?", answers: [], text: "Because $Av = \\lambda v$ with $v \\neq 0$." } as unknown as QuestionAnswerData;
		const card = documentFor(<ProseQuestion tool="explain" toolCallId="q1" input={input} output={answer} open={false} />).querySelector('[data-testid="prose-answer"]')!;
		assert.equal(card.querySelectorAll(".katex").length, 2);
		assert.doesNotMatch(card.textContent!, /\$/, "no delimiter left as text");
		const thinking = documentFor(<ThinkingBubble data={{ problemCallId: "p1", text: "Row 3 is $R_1 + R_2$" }} />);
		assert.ok(thinking.querySelector(".katex"));
		assert.doesNotMatch(thinking.body.textContent!, /\$/);
	});

	it("the course link banner is one line with one Link action", () => {
		const choice = {
			state: { status: "ready", courses: [{ workspace: "/s", title: "SMM", due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null }], roots: [] },
			workspace: "/s", notice: null, choose: () => {}, add: () => {}, requireCourse: () => "/s",
		} as unknown as CourseChoice;
		const banner = documentFor(<CourseLinkBody choice={choice} busy={false} error={null} onLink={() => {}} />).querySelector('[data-testid="course-link-banner"]')!;
		assert.match(banner.textContent!, /Link this session to a course to continue\./);
		assert.deepEqual(
			[...banner.querySelectorAll("button")].filter((b) => b.getAttribute("data-testid") !== "course-picker").map((b) => b.textContent),
			["Link"],
			"besides the course chip, Link is the one action",
		);
		assert.equal(banner.querySelector('[data-testid="course-link"]')!.textContent, "Link");
	});
});

describe("session details", () => {
	it("context reads used over the catalog limit, and cost stays — until a turn is priced", () => {
		assert.deepEqual(
			[sessionStatLabels({ turns: [], contextTokens: 19400, pricing: undefined, limit: 1_000_000 }).contextLabel, sessionStatLabels({ turns: [], contextTokens: 19400, pricing: undefined, limit: 1_000_000 }).costLabel],
			["19.4k / 1M", "—"],
		);
	});
});
