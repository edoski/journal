/**
 * Render smoke tests — the lesson from the v2 bugs: protocol tests don't see
 * rendering. These render the interaction cards to static HTML and assert on
 * the output. No DOM needed (react-dom/server).
 *
 * tsx note: tsx ignores tsconfig's `jsx` field and uses the CLASSIC JSX
 * transform (React.createElement), so `React` must be a resolvable global.
 * The shim below provides it; Vite/Next use the automatic runtime and don't
 * care.
 */

import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { MessageResponse } from "../components/ai-elements/message.tsx";
import { DispatchCard } from "../components/artifacts/dispatch-card.tsx";
import { JobsContext } from "../components/jobs-context.ts";
import { ChatActionsContext } from "../components/chat.tsx";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { LESSON_WORDS } from "../components/study-words.ts";
import type { JobRecord } from "../src/core/contracts.ts";
import { providerKeyMissing } from "../src/core/settings.ts";
import {
	buildAnswer,
	normalizeOptions,
	type QuestionData,
} from "../src/core/question-core.ts";

const explainInput = {
	type: "check",
	nodeId: "planet-order",
	question: "Which planet is closest to the sun, and why does its year run short?",
	correctAnswer: "Mercury — the innermost orbit is the shortest path around the Sun.",
};

function explainQD(): QuestionData {
	return {
		id: "e1",
		kind: "explain",
		question: explainInput.question,
		mode: "text",
		options: [],
		committedAnswer: explainInput.correctAnswer,
		createdAt: new Date().toISOString(),
	};
}

function askQD(): QuestionData {
	const options = normalizeOptions([{ label: "Very" }, { label: "Somewhat" }]);
	return {
		id: "a1",
		kind: "ask",
		question: "How confident are you?",
		mode: "single-select",
		options,
		createdAt: new Date().toISOString(),
	};
}

describe("DispatchCard — the refusal tone", () => {
	const job = (over: Partial<JobRecord>): JobRecord => ({
		id: "j1",
		kind: "research",
		chatId: "c1",
		toolCallId: "t1",
		status: "error",
		activity: "",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...over,
	});
	const inJobs = (jobs: JobRecord[]) => (
		<JobsContext.Provider value={jobs}>
			<ChatActionsContext.Provider
				value={{ chatId: "c1", syncFromServer: async () => {}, sendText: () => {}, openSetup: () => {} }}
			>
				<DispatchCard toolCallId="t1" kind="research" />
			</ChatActionsContext.Provider>
		</JobsContext.Provider>
	);

	it("a connection-refused job is INFO: quiet card, 'needs a sign-in', deep-link to the dialog", () => {
		const html = renderToStaticMarkup(
			inJobs([job({ error: providerKeyMissing("claude-subscription").error })]),
		);
		assert.ok(html.includes('data-testid="dispatch-refused"'));
		assert.ok(html.includes("needs a sign-in"));
		assert.ok(html.includes(">Sign in<"));
		assert.ok(html.includes('data-testid="dispatch-setup-link"'));
		assert.ok(!html.includes("failed"));
		assert.ok(!html.includes("text-red-500"));
	});

	it("a real failure reads as its plain failure line, not a setup prompt", () => {
		const html = renderToStaticMarkup(inJobs([job({ error: "FAILED: headless crashed" })]));
		assert.ok(html.includes('data-testid="dispatch-settled"'));
		assert.ok(html.includes("The sources couldn&#x27;t be checked"));
		assert.ok(!html.includes("dispatch-refused"));
		assert.ok(!html.includes("dispatch-setup-link"));
	});

	it("the lesson reads a failed helper as one plain line per kind", () => {
		const lines: Record<JobRecord["kind"], string> = {
			research: "The sources couldn't be checked",
			demo: "The demo couldn't be built",
			visual: "The figure couldn't be made",
			pdf: "The PDF couldn't be read",
		};
		for (const [kind, line] of Object.entries(lines) as [JobRecord["kind"], string][]) {
			const html = renderToStaticMarkup(
				<JobsContext.Provider value={[job({ kind, error: "took longer than 8 minutes" })]}>
					<DispatchCard toolCallId="t1" kind={kind} />
				</JobsContext.Provider>,
			);
			assert.ok(html.includes(line.replace("'", "&#x27;")), `${kind}: ${line}`);
			assert.ok(!/agent|failed|uppercase/i.test(html), `${kind}: no agent label, no uppercase failure`);
		}
	});

	it("a working helper is one activity line; a finished one draws nothing, its result arrives in the steer card", () => {
		for (const jobs of [[], [job({ status: "running", error: undefined })]]) {
			const html = renderToStaticMarkup(inJobs(jobs));
			assert.ok(html.includes('data-testid="dispatch-card"') && html.includes('role="status"'), "one status line while it works");
			assert.match(html, /Checking sources…/);
		}
		assert.equal(renderToStaticMarkup(inJobs([job({ status: "done", error: undefined })])), "");
	});
});

describe("math rendering (streamdown + KaTeX)", () => {
	// Standard authoring: $...$ inline and $$ on separate lines for display.
	// The legacy backslash reader remains for existing content.
	// Full coverage: render-markdown.test.tsx.
	it("renders standard $...$ as inline math", () => {
		const html = renderToStaticMarkup(<MessageResponse>{"The map $f(x) = x^2$ is smooth."}</MessageResponse>);
		assert.ok(html.includes("katex"), `$-math must render, got: ${html.slice(0, 300)}`);
		assert.ok(!html.includes("katex-display"), "single-dollar math is inline");
	});

	it("renders display math ($$ fenced on own lines — the transform's target form)", () => {
		const html = renderToStaticMarkup(<MessageResponse>{"$$\n\\int_0^1 x^2\\,dx = \\tfrac{1}{3}\n$$"}</MessageResponse>);
		assert.ok(html.includes("katex-display"), "fenced display math should render as display KaTeX");
	});

	it("one-line $$...$$ inside a sentence renders inline (micromark behavior — the transform relies on it for \(...\))", () => {
		// micromark treats a one-line $$...$$ inside a paragraph as 2-dollar
		// inline mathText, not flow math. That is exactly how the transformed
		// \(...\) renders inline; pin the behavior so a renderer swap can't
		// silently change it. Alone on its line it is a display (math-delims.ts).
		const html = renderToStaticMarkup(<MessageResponse>{"So $$\\int_0^1 x^2\\,dx$$ is small."}</MessageResponse>);
		assert.ok(html.includes("katex") && !html.includes("katex-display"), "one-liner should render inline");
		const inline = renderToStaticMarkup(<MessageResponse>{"So \\(\\int_0^1 x^2\\,dx\\)"}</MessageResponse>);
		assert.ok(inline.includes("katex") && !inline.includes("katex-display"), "\\(...\\) stays inline");
	});

	it("does NOT eat escaped currency (\\$5 stays text)", () => {
		// With dollar math enabled, Markdown-escaped dollars remain literal.
		const html = renderToStaticMarkup(<MessageResponse>{"It costs \\$5 and \\$10 more."}</MessageResponse>);
		assert.ok(!html.includes("katex"), "escaped currency must not parse as math");
		assert.match(html, /\$5/);
	});

	it("a check renders math in its question, open and answered", () => {
		const mathExplain = {
			question: "What is $\\frac{dy}{dx}$ of $y = x^2$?",
			correctAnswer: "The power rule gives $\\frac{dy}{dx} = 2x$.",
		};
		const pendingHtml = renderToStaticMarkup(<ProseQuestion tool="recall" toolCallId="m1" input={mathExplain} open />);
		assert.ok(pendingHtml.includes("katex"), "the open question: its math renders");
		const qd: QuestionData = { ...explainQD(), question: mathExplain.question, committedAnswer: mathExplain.correctAnswer };
		const answeredHtml = renderToStaticMarkup(<ProseQuestion tool="recall" toolCallId="m1" input={mathExplain} output={buildAnswer(qd, { text: "2x" })} open={false} />);
		assert.ok(answeredHtml.includes("katex"), "the answered question: its math renders");
	});
});

describe("a settled question", () => {
	it("a skipped one says so, the question typeset", () => {
		const input = { question: "How confident are you?", options: [{ label: "Very" }, { label: "Somewhat" }] };
		const answer = { ...buildAnswer(askQD(), {}), dismissed: true };
		const card = parseHTML(`<html><body>${renderToStaticMarkup(<ProseQuestion tool="ask_user_question" toolCallId="a1" input={input} output={answer} open={false} />)}</body></html>`).document;
		assert.equal(card.querySelector('[data-testid="prose-question-left"]')?.textContent, LESSON_WORDS.skippedQuestion);
		assert.match(card.body.textContent ?? "", /How confident are you\?/);
	});

	it("his reading thoughts come before his answer, as his own bubble", () => {
		const withReading = buildAnswer(explainQD(), { text: "Mercury", readingThinking: "was unsure mid-paragraph" });
		const html = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="e1" input={explainInput} output={withReading} open={false} />);
		const blockAt = html.indexOf("reading-thinking-bubble");
		assert.ok(blockAt !== -1, "the reading thoughts render");
		assert.ok(blockAt < html.indexOf('data-testid="prose-answer"'), "above his answer");
		assert.ok(html.includes("was unsure mid-paragraph"));
	});
});

describe("question context renders as markdown everywhere (owner, 2026-10-12)", () => {
	it("an open question: ask options draw their labels alone, no description under them (round 8: the goal question's helper lines)", () => {
		const html = renderToStaticMarkup(<ProseQuestion
			tool="ask_user_question"
			toolCallId="d1"
			open
			input={{
				question: "Which tool?",
				options: [
					{ label: "Pencil", description: "Wood around $\\text{Pb}_x\\text{C}$ graphite — the classic $x^2$ choice." },
					{ label: "Pen" },
				],
			}}
		/>);
		assert.match(html, /Pencil/);
		assert.doesNotMatch(html, /graphite|classic/, "the description never renders");
	});

	it("a settled ask draws no option descriptions, and a recorded details line stays off the screen", () => {
		const input = {
			question: "Which destination?",
			details: "A guess with a reason is worth more than a computed answer here.",
			options: [
				{ label: "Classical", description: "Entropy $H(X)$ first." },
				{ label: "ML toolkit" },
			],
		};
		const qd: QuestionData = {
			id: "d2",
			kind: "ask",
			question: input.question,
			mode: "single-select",
			options: normalizeOptions(input.options),
			createdAt: new Date().toISOString(),
		};
		const answer = buildAnswer(qd, { values: ["Classical"] });
		const html = renderToStaticMarkup(<ProseQuestion tool="ask_user_question" toolCallId="d2" input={input} output={answer} open={false} />);
		assert.match(html, /Classical/);
		assert.doesNotMatch(html, /Entropy/, "the option description never renders");
		assert.doesNotMatch(html, /A guess with a reason/, "an old record's helper line never renders");
		const open = renderToStaticMarkup(<ProseQuestion tool="ask_user_question" toolCallId="d2" input={input} open />);
		assert.doesNotMatch(open, /A guess with a reason/, "nor under an open question");
	});

});
