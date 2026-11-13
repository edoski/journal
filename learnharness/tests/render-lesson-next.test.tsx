/**
 * The Proposed lesson (polish pass phase 3): agent chrome stays out of the
 * column, the plan reads as a calm map, the docks share one anatomy, and
 * the problem reads once. Same tsx classic-JSX shim as the other render
 * tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { PlanCard, planMapSteps } from "../components/lesson/plan-map.tsx";
import { LessonDesignContext } from "../components/lesson/lesson-design.ts";
import { ConfidenceChoice } from "../components/confidence-choice.tsx";
import { QuestionDock, QuestionDockBar, teaserLine } from "../components/question-dock.tsx";
import { ReadingThinkingField } from "../components/reading-thinking.tsx";
import { PracticeDock } from "../components/practice-dock.tsx";
import { ProblemCard, ConcludeCard, ThinkingCard } from "../components/practice-cards.tsx";
import { ToolCallCard } from "../components/artifacts/tool-call-card.tsx";
import { LiveToolCard } from "../components/artifacts/live-tool-card.tsx";
import { ProbeDoneCard } from "../components/artifacts/probe-done-card.tsx";
import { PhaseDivider } from "../components/phase-divider.tsx";
import { CompactionCutDivider, CompactionMomentDivider } from "../components/compaction-divider.tsx";
import { AnsweredCard } from "../components/answered-card.tsx";
import { CourseLinkBody } from "../components/course-link-banner.tsx";
import { sessionStatLabels } from "../components/usage-format.ts";
import type { CourseChoice } from "../components/course-picker.tsx";
import type { ArtifactPartProps, PlanBlockData, QuestionAnswerData } from "../src/core/index.ts";

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

const proposed = (node: React.ReactNode, activeProblemCallId: string | null = null) => (
	<LessonDesignContext.Provider value={{ variant: "proposed", activeProblemCallId }}>{node}</LessonDesignContext.Provider>
);

const AnswerFor = ({ answer }: { answer: QuestionAnswerData }) => <AnsweredCard answer={answer} variant="proposed" />;

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

	it("the transcript card names the step count and the steps, with no node numbers", () => {
		const data = { kind: "full", at: "x", current: null, nodes: NODES.map((n) => ({ ...n, status: "upcoming" })), edges: EDGES } as PlanBlockData;
		const document = documentFor(<PlanCard data={data} onOpen={() => {}} />);
		const card = document.querySelector('[data-testid="plan-block-full"]')!;
		assert.match(card.textContent!, /Plan·3 steps/);
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
});

describe("the Proposed docks", () => {
	it("confidence is the segmented group in sentence case, Neutral on, no numbers", () => {
		const document = documentFor(<ConfidenceChoice value="neutral" onChange={() => {}} variant="proposed" />);
		const group = document.querySelector('[data-testid="confidence-choice"]')!;
		assert.equal(group.getAttribute("data-slot"), "toggle-group");
		const items = [...group.querySelectorAll('[data-slot="toggle-group-item"]')];
		assert.deepEqual(items.map((i) => i.textContent), ["Guessing", "Neutral", "Confident"]);
		assert.equal(items.find((i) => i.getAttribute("data-state") === "on")!.textContent, "Neutral");
	});

	it("the question dock shows the question in prose with no uppercase labels, the answer field and Submit", () => {
		const document = documentFor(
			<QuestionDock toolName="explain" toolCallId="q1" input={{ question: "Why is det zero?", correctAnswer: "kernel", details: "Two sentences." } as never}
				expanded onExpand={() => {}} onSubmit={() => {}} variant="proposed" />,
		);
		const dock = document.querySelector('[data-testid="question-dock"]')!;
		assert.match(dock.textContent!, /Why is det zero\?/);
		assert.match(dock.textContent!, /Two sentences\./);
		assert.doesNotMatch(dock.textContent!, /EXPLAIN|YOUR ANSWER|Your answer:/);
		assert.equal(document.querySelector('textarea[data-testid="answer-field"]')!.getAttribute("placeholder"), "Your answer");
		assert.ok(document.querySelector('[data-testid="confidence-choice"][data-slot="toggle-group"]'));
		assert.equal(dock.querySelector('button[type="submit"]')!.textContent, "Submit");
	});

	it("a check waiting behind its reveal invites in sentence case; the reading field sits on the same dock surface", () => {
		const bar = documentFor(<QuestionDockBar toolName="explain" question="Why is $\\det(A)=0$?" onExpand={() => {}} variant="reveal" design="proposed" />);
		const reveal = bar.querySelector('[data-testid="teach-check-reveal"]')!;
		assert.equal(reveal.querySelectorAll(".katex").length, 1, "the formula is typeset");
		assert.match(reveal.textContent!, /^Check your understandingWhy is /);
		const matrix = "Let $A = \\begin{pmatrix} 4 & 1 \\\\ 2 & 3 \\end{pmatrix}$. Find $\\lambda$ with **one** $$\\dfrac{a+b}{2}$$";
		assert.equal(teaserLine(matrix), "Let $A = \\cdots$. Find $\\lambda$ with one $\\tfrac{a+b}{2}$");
		const collapsed = documentFor(<QuestionDockBar toolName="explain" question={matrix} onExpand={() => {}} variant="reveal" design="proposed" />);
		assert.doesNotMatch(collapsed.body.textContent!, /beginpmatrix|\*\*|\$/);
		const field = documentFor(<ReadingThinkingField value="" revision={0} onChange={() => {}} variant="proposed" />).querySelector('[data-testid="reading-thinking-field"]')!;
		assert.equal(field.getAttribute("data-slot"), "dock-surface");
		assert.match(field.textContent!, /^Thinking while reading$/);
	});

	it("the practice dock has the same anatomy: the problem once, the thinking field, confidence and Submit", () => {
		const document = documentFor(
			<PracticeDock problemCallId="p1" input={{ statement: "Find the rank." }} expanded onExpand={() => {}} onSubmit={() => {}} onRequest={() => {}} variant="proposed" />,
		);
		const dock = document.querySelector('[data-testid="practice-dock"]')!;
		assert.match(dock.textContent!, /Find the rank\./);
		assert.doesNotMatch(dock.textContent!, /PROBLEM|YOUR THINKING/);
		assert.ok(dock.querySelector('textarea[data-testid="practice-thinking-field"]'));
		assert.equal(dock.querySelector('[data-testid="practice-send"]')!.textContent, "Submit");
	});
});

describe("agent chrome out of the Proposed lesson", () => {
	it("a tool call leaves no row in the column", () => {
		const document = documentFor(proposed(<ToolCallCard part={part({ type: "tool-read", state: "output-available", toolCallId: "t", input: { path: "notes.md" } })} />));
		assert.equal(document.body.innerHTML, "");
	});

	it("the prober's hand-off to the teacher stays out: no notes about the learner in the column", () => {
		const input = { assessment: { strands: [{ strand: "Closure", assessment: "FLOOR: one-step proofs. CEILING: he stalls on inverses (o7)." }], summary: "Adult learner. He asked to skip the warm-ups." } };
		for (const state of ["input-streaming", "input-available", "output-available"]) {
			const document = documentFor(proposed(<ProbeDoneCard part={{ state, input, output: { ok: true } }} />));
			assert.equal(document.body.innerHTML, "", state);
		}
	});

	it("a running tool is one muted activity line with no arguments", () => {
		const document = documentFor(<LiveToolCard part={part({ type: "tool-read", state: "input-streaming", toolCallId: "t", input: { path: "secret/notes.md" } })} variant="proposed" />);
		const line = document.querySelector('[data-slot="activity-line"]')!;
		assert.equal(line.textContent, "Reading a file…");
		assert.doesNotMatch(document.body.textContent!, /secret\/notes\.md/);
	});

	it("phase changes are quiet section breaks; compaction leaves only a hairline, no token count", () => {
		const teach = documentFor(<PhaseDivider phase="teach" variant="proposed" />).querySelector('[data-slot="section-break"]')!;
		assert.equal(teach.getAttribute("aria-label"), "Teaching");
		assert.equal(teach.textContent, "Teaching");
		const data = { content: "summary", details: { tokensBefore: 21000 } } as never;
		const cut = documentFor(<CompactionCutDivider data={data} variant="proposed" />);
		assert.equal(cut.body.textContent, "");
		assert.ok(cut.querySelector('[data-slot="section-break"]'));
		assert.equal(documentFor(<CompactionMomentDivider data={data} variant="proposed" />).body.innerHTML, "");
	});
});

describe("Proposed lesson cards", () => {
	it("the active problem reads once: its transcript card stays out while the dock shows it", () => {
		const problem = part({ type: "tool-problem", state: "output-available", toolCallId: "p1", input: { statement: "Find the rank." } });
		assert.equal(documentFor(proposed(<ProblemCard part={problem} />, "p1")).body.innerHTML, "");
		const settled = documentFor(proposed(<ProblemCard part={problem} />, null));
		assert.match(settled.querySelector('[data-slot="lesson-card"]')!.textContent!, /^ProblemFind the rank\./);
	});

	it("a given-up problem says so in plain words, with no tutor bookkeeping under Details", () => {
		const conclude = part({ type: "tool-conclude", state: "output-available", toolCallId: "c2", input: { outcome: "surrendered", verdict: "You read the rows by eye.", rung: "R2", missClass: "execution" }, reveal: "Eliminate." });
		const card = documentFor(proposed(<ConcludeCard part={conclude} />)).querySelector('[data-testid="conclude-card"]')!;
		assert.match(card.textContent!, /^How it went·You gave up/);
		assert.equal(card.querySelector('[data-testid="metadata-toggle"]'), null);
		assert.doesNotMatch(card.textContent!, /Surrendered|Details|rung|Miss class/i);
	});

	it("a conclusion names its outcome in sentence case and shows the model solution", () => {
		const conclude = part({ type: "tool-conclude", state: "output-available", toolCallId: "c1", input: { outcome: "movedOn", verdict: "Pairs are not enough." }, reveal: "The third is the sum." });
		const card = documentFor(proposed(<ConcludeCard part={conclude} />)).querySelector('[data-testid="conclude-card"]')!;
		assert.match(card.textContent!, /^How it went·Moved on/);
		assert.match(card.textContent!, /Model solution/);
		assert.match(card.textContent!, /The third is the sum\./);
	});

	it("the learner's thinking is labelled in sentence case", () => {
		const document = documentFor(<ThinkingCard data={{ problemCallId: "p1", text: "Row 3 is row 1 + row 2?" }} variant="proposed" />);
		assert.match(document.querySelector('[data-testid="thinking-card"]')!.textContent!, /^Your thinkingRow 3 is row 1 \+ row 2\?/);
	});

	it("an answered check shows the question, the answer, the confidence and the committed answer, with no verdict", () => {
		const answer = {
			kind: "explain", tool: "explain", questionText: "Why is det zero?", answers: [], text: "The kernel is nonzero.",
			confidence: "confident", committed: "A nonzero kernel means not invertible.",
		} as unknown as QuestionAnswerData;
		const card = documentFor(<AnsweredCard answer={answer} variant="proposed" />).querySelector('[data-testid="answered-card"]')!;
		assert.match(card.textContent!, /^Explain·Confident/);
		assert.match(card.textContent!, /“The kernel is nonzero\.”/);
		assert.match(card.textContent!, /The answerA nonzero kernel means not invertible\./);
		assert.doesNotMatch(card.textContent!, /EXPLAIN|Correct|Incorrect/);
	});

	it("the learner's own math is typeset, in an answer and in his thinking", () => {
		const answer = { kind: "explain", tool: "explain", questionText: "Why?", answers: [], text: "Because $Av = \\lambda v$ with $v \\neq 0$." } as unknown as QuestionAnswerData;
		const card = documentFor(<AnswerFor answer={answer} />);
		assert.equal(card.querySelectorAll(".katex").length, 2);
		assert.doesNotMatch(card.body.textContent!, /\$/, "no delimiter left as text");
		const thinking = documentFor(<ThinkingCard data={{ problemCallId: "p1", text: "Row 3 is $R_1 + R_2$" }} variant="proposed" />);
		assert.ok(thinking.querySelector(".katex"));
		assert.doesNotMatch(thinking.body.textContent!, /\$/);
	});

	it("the course link banner is one line with one Link action", () => {
		const choice = {
			state: { status: "ready", courses: [{ workspace: "/s", title: "SMM", due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null }], roots: [] },
			workspace: "/s", notice: null, choose: () => {}, add: () => {}, requireCourse: () => "/s",
		} as unknown as CourseChoice;
		const banner = documentFor(<CourseLinkBody choice={choice} busy={false} error={null} onLink={() => {}} variant="proposed" />).querySelector('[data-testid="course-link-banner"]')!;
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
