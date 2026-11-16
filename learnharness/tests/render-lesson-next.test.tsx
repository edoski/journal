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
import { partKey, roadmapLabel, roadmapSteps, stepAnchors } from "../components/lesson/roadmap-facts.ts";
import { derivePlanStatuses } from "../src/core/index.ts";
import { rowDot, rowWord, stripDot } from "../components/lesson/lesson-roadmap.tsx";
import { LiveToolCard } from "../components/artifacts/live-tool-card.tsx";
import { artifactRenderers } from "../components/artifacts/index.ts";
import { ProseConclude, ProseProblem, ThinkingBubble } from "../components/lesson/prose/prose-practice.tsx";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { CourseLinkBody } from "../components/course-link-banner.tsx";
import type { CourseChoice } from "../components/course-picker.tsx";
import type { ArtifactPartProps, QuestionAnswerData } from "../src/core/index.ts";

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

describe("the lesson's roadmap", () => {
	const tree = { nodes: NODES, edges: EDGES, version: 1 };
	const messages = [
		{ parts: [{ type: "tool-plan_init", state: "output-available", output: { ok: true, tree } }] },
		{ parts: [{ type: "step-start" }, { type: "text" }, { type: "tool-explain", state: "output-available", input: { nodeId: "maps" } }] },
		{ parts: [{ type: "step-start" }, { type: "tool-lesson_progress", state: "output-available", input: { done: ["maps"] } }, { type: "step-start" }, { type: "text" }, { type: "text" }, { type: "tool-explain", state: "input-available", input: { nodeId: "equation" } }] },
	];
	const statuses = () => derivePlanStatuses(tree, messages);

	it("lists the steps in teaching order, marks where he is, what comes next and what the tutor marked done", () => {
		const steps = roadmapSteps(tree, statuses(), new Set(["maps", "equation"]));
		assert.deepEqual(steps.map((s) => [s.title, s.status, s.next, s.done, s.taught]), [
			["A matrix is a linear map", "visited", false, true, true],
			["The eigen-equation", "current", false, false, true],
			["Computing a 2×2 spectrum", "upcoming", true, false, false],
		]);
		assert.equal(roadmapLabel(steps), "The eigen-equation");
	});

	it("draws a step before Now that was never reached as passed, never like the next one", () => {
		const steps = roadmapSteps(tree, { current: "compute", visited: new Set(["maps", "compute"]), done: new Set() }, new Set());
		assert.deepEqual(steps.map((s) => [s.id, s.status, s.next]), [
			["maps", "visited", false],
			["equation", "passed", false],
			["compute", "current", false],
		]);
		const [visited, passed] = steps;
		assert.equal(rowDot(passed!), rowDot(visited!), "the panel draws it filled, as a step behind him, never hollow like a step ahead");
		assert.equal(stripDot(passed!), stripDot(visited!), "and so does the strip");
		assert.equal(rowWord(passed!), null, "never Next");
	});

	it("names the next step between steps, and says when every step was taught", () => {
		const between = roadmapSteps(tree, { current: null, visited: new Set(["maps"]), done: new Set(["maps"]) }, new Set());
		assert.equal(roadmapLabel(between), "Next: The eigen-equation");
		const all = roadmapSteps(tree, { current: null, visited: new Set(NODES.map((n) => n.id)), done: new Set() }, new Set());
		assert.equal(roadmapLabel(all), "Every step taught");
		assert.equal(roadmapLabel([]), null);
	});

	it("a step was taught at the first text of the provider step that asks its first question", () => {
		const anchors = stepAnchors(messages, new Set(NODES.map((n) => n.id)));
		assert.equal(anchors.get(partKey(1, 1)), "maps");
		assert.equal(anchors.get(partKey(2, 3)), "equation", "the step's own text, past the progress call's step");
		assert.equal(anchors.size, 2, "an untaught step has no place");
	});

	it("a question with no text before it in its step is its own place", () => {
		const bare = [{ parts: [{ type: "step-start" }, { type: "tool-explain", input: { nodeId: "maps" } }] }];
		assert.equal(stepAnchors(bare, new Set(["maps"])).get(partKey(0, 1)), "maps");
	});
});

describe("agent chrome out of the lesson", () => {
	it("a settled tool call leaves no row in the column: no renderer draws the agent's own tools", () => {
		for (const tool of ["Read", "Grep", "Glob", "list_sessions", "list_propositions", "course_resume", "course_show", "course_search", "course_save"]) {
			assert.equal(artifactRenderers[tool], undefined, tool);
		}
	});

	it("the prober's hand-off to the teacher stays out: no notes about the learner in the column", () => {
		assert.equal(artifactRenderers.probe_done, undefined);
	});

	it("a running tool is one muted activity line with no arguments", () => {
		const document = documentFor(<LiveToolCard part={part({ type: "tool-Read", state: "input-streaming", toolCallId: "t", input: { file_path: "secret/notes.md" } })} />);
		const line = document.querySelector('[data-slot="activity-line"]')!;
		assert.equal(line.textContent, "Thinking…");
		assert.doesNotMatch(document.body.textContent!, /secret\/notes\.md/);
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
