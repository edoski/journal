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
import { QuestionDock } from "../components/question-dock.tsx";
import { ProbeDoneCard } from "../components/artifacts/probe-done-card.tsx";
import { DispatchCard } from "../components/artifacts/dispatch-card.tsx";
import { JobsContext } from "../components/jobs-context.ts";
import { ChatActionsContext } from "../components/chat.tsx";
import type { JobRecord } from "../src/core/contracts.ts";
import { AnsweredCard } from "../components/answered-card.tsx";
import {
	buildAnswer,
	normalizeOptions,
	questionNeedsReveal,
	type QuestionAnswerData,
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

function renderDock(props: {
	toolName: "ask_user_question" | "explain" | "recall";
	toolCallId: string;
	input: never;
	onSubmit?: () => void;
}) {
	// expanded=true renders the full form (the collapsed bar is covered by the
	// QuestionDockBar test below). No scroll context needed — the DockOverlay
	// in the chat view owns that.
	return renderToStaticMarkup(
		<QuestionDock {...props} expanded={true} onExpand={() => {}} onSubmit={props.onSubmit ?? (() => {})} />,
	);
}

describe("question submission draft restoration", () => {
	const draft = {
		selection: { selected: new Set([0]), otherSelected: true },
		thinking: "preserved reasoning",
		other: "preserved custom answer",
		text: "preserved free-text answer",
		confidence: "confident" as const,
	};

	it("restores a free-response answer and its confidence state when its form remounts", () => {
		const html = renderToStaticMarkup(<QuestionDock toolName="explain" toolCallId="e1" input={explainInput} expanded onExpand={() => {}} onSubmit={() => {}} initialDraft={draft} />);
		assert.ok(html.includes("preserved free-text answer"));
		assert.match(html, /aria-checked="true"[^>]*data-state="confident"/);
	});

	it("restores an ask's custom answer and a free-text answer", () => {
		const custom = renderToStaticMarkup(<QuestionDock toolName="ask_user_question" toolCallId="ask1" input={{ question: "Fixture?", options: [{ label: "Listed answer" }, { label: "Another answer" }], multiSelect: true }} expanded onExpand={() => {}} onSubmit={() => {}} initialDraft={draft} />);
		assert.ok(custom.includes('value="preserved custom answer"'));
		assert.match(custom, /aria-checked="true" data-testid="other-option"/);
		const text = renderToStaticMarkup(<QuestionDock toolName="ask_user_question" toolCallId="ask2" input={{ question: "Fixture?" }} expanded onExpand={() => {}} onSubmit={() => {}} initialDraft={draft} />);
		assert.ok(text.includes("preserved free-text answer"));
	});
});

describe("DispatchCard — the BYOK refusal tone (owner, 2026-09-22)", () => {
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

	it("a models-refused job is INFO: quiet card, 'needs model setup', deep-link to the dialog", () => {
		const html = renderToStaticMarkup(
			inJobs([job({ error: "No model configured — set up your models first (missing: cheap)" })]),
		);
		assert.ok(html.includes('data-testid="dispatch-refused"'));
		assert.ok(html.includes("needs model setup"));
		assert.ok(html.includes('data-testid="dispatch-setup-link"'));
		assert.ok(html.includes("Set up models"));
		assert.ok(!html.includes("failed"));
		assert.ok(!html.includes("text-red-500"));
	});

	it("a key-refused job is INFO: 'needs a provider key', 'Add a key' (zero-keys wave, 66dbea9)", () => {
		const html = renderToStaticMarkup(
			inJobs([job({ error: "No OpenRouter key is set — add one in Settings → Keys" })]),
		);
		assert.ok(html.includes('data-testid="dispatch-refused"'));
		assert.ok(html.includes("needs a provider key"));
		assert.ok(html.includes("Add a key"));
		assert.ok(html.includes('data-testid="dispatch-setup-link"'));
		assert.ok(!html.includes("failed"));
	});

	it("a real failure keeps the honest red failure", () => {
		const html = renderToStaticMarkup(inJobs([job({ error: "FAILED: headless crashed" })]));
		assert.ok(html.includes('data-testid="dispatch-settled"'));
		assert.ok(html.includes("failed"));
		assert.ok(html.includes("text-red-500"));
		assert.ok(!html.includes("dispatch-refused"));
	});

	it("a finished worker reads finished, independently of delivery", () => {
		const html = renderToStaticMarkup(inJobs([job({ status: "done", error: undefined })]));
		assert.ok(html.includes("finished"));
	});
});

describe("render smoke tests", () => {
	it("explain dock renders the question, the answer field, and the three confidence states, neutral preselected", () => {
		const html = renderDock({ toolName: "explain", toolCallId: "e1", input: explainInput as never });
		assert.match(html, /Which planet is closest to the sun/);
		assert.ok(html.includes('data-testid="answer-field"'), "free response is the answer field");
		assert.match(html, /Your answer/);
		assert.match(html, /Submit answer/, "send becomes Submit answer");
		assert.match(html, /↵ submits · ⇧↵ newline/, "the standard chord is discoverable (owner round 5)");
		const doc = parseHTML(`<html><body>${html}</body></html>`).document;
		const group = doc.querySelector('[data-testid="confidence-choice"]');
		assert.ok(group, "the confidence control renders under the answer box");
		assert.equal(group.getAttribute("role"), "radiogroup");
		assert.ok(group.closest('[data-testid="answer-field"]'), "it lives in the answer box's submit row");
		const choices = [...group.querySelectorAll('[role="radio"]')];
		assert.deepEqual(choices.map((c) => c.textContent), ["Guessing", "Neutral", "Confident"]);
		assert.deepEqual(choices.map((c) => c.getAttribute("aria-checked")), ["false", "true", "false"], "neutral is preselected");
		assert.deepEqual(choices.map((c) => c.getAttribute("tabindex")), ["-1", "0", "-1"], "Tab reaches the chosen state");
		assert.ok(!html.includes('type="range"'), "no slider");
		assert.ok(!/\d+%/.test(html), "no percentage");
		assert.ok(!html.includes("I don&#x27;t know"), "no multiple-choice 'I don't know' row");
	});

	it("the recall dock carries the same control; ask questions never do", () => {
		const recall = renderDock({ toolName: "recall", toolCallId: "r1", input: { question: "Explain the chain rule.", correctAnswer: "Outer derivative times inner derivative." } as never });
		assert.ok(recall.includes('data-testid="confidence-choice"'));
		const ask = renderDock({ toolName: "ask_user_question", toolCallId: "a1", input: { question: "Where next?" } as never });
		assert.ok(!ask.includes('data-testid="confidence-choice"'), "ask is ungraded: no confidence");
	});

	it("the explain dock never leaks the committed answer before submit", () => {
		const html = renderDock({ toolName: "explain", toolCallId: "e1", input: explainInput as never });
		assert.ok(!html.includes("innermost orbit"), "the commitment must not render pre-answer");
	});

	it("ask dock renders the editable Other row + thinking field, no grading affordance", () => {
		const html = renderDock({
			toolName: "ask_user_question",
			toolCallId: "a1",
			input: { question: "How confident are you?", options: [{ label: "Very" }, { label: "Somewhat" }] } as never,
		});
		// Other is an editable OPTION ROW — a sibling of the options, with the
		// radio circle + an inline input; picking it never displaces thinking.
		assert.ok(html.includes('data-testid="other-option"'), "Other is an option row");
		assert.match(html, /Type your own answer/, "type directly into the option");
		assert.ok(html.includes('role="radio"'), "Other row keeps the option role");
		assert.match(html, /aria-checked="false"/, "circle starts unfilled");
		assert.ok(html.includes('data-testid="thinking-field"'), "thinking field coexists with Other");
		assert.match(html, /YOUR THINKING/, "ask select-mode also gets the learner's voice");
	});

	it("multi-select ask renders checkbox rows and the select-all hint", () => {
		const html = renderDock({
			toolName: "ask_user_question",
			toolCallId: "m1",
			input: {
				question: "Which topics interest you?",
				multiSelect: true,
				options: [{ label: "Physics" }, { label: "Philosophy" }],
			} as never,
		});
		assert.match(html, /select all that apply/);
		assert.ok(html.includes('role="group"'), "checkbox group");
		assert.ok((html.match(/role="checkbox"/g) ?? []).length >= 3, "options AND the Other row are checkboxes");
		assert.ok(html.includes('data-testid="other-option"'), "Other is still an option row in multi-select");
		// The bigger \u2713 glyph (text-base, 2026-09-24 owner round) only
		// mounts on a CHECKED row — unreachable from the unselected static
		// render, so it's live-verified (Playwright: 14px computed in the
		// 16px box) instead of pinned here.
	});

	it("a malformed question input renders the quiet fallback, never a crash", () => {
		// The seam rule (tool-parts.ts): the dock PARSES the model-authored
		// input instead of casting it. Options the boundary healed from a
		// JSON string render; options no heal can read render the fallback.
		const healed = renderDock({
			toolName: "ask_user_question",
			toolCallId: "stringified",
			input: { question: "q?", options: JSON.stringify([{ label: "a" }, { label: "b" }]) } as never,
		});
		assert.ok(!healed.includes('data-testid="malformed-question"'), "stringified options heal like the boundary");
		const html = renderDock({
			toolName: "ask_user_question",
			toolCallId: "bad",
			input: { question: "q?", options: "[{label: a" } as never,
		});
		assert.ok(html.includes('data-testid="malformed-question"'));
		assert.match(html, /malformed/);
	});

	it("phase scales the thinking field: teaching invites depth, probing stays quick", () => {
		const selectAsk = { question: "Which first?", options: [{ label: "Limits" }, { label: "Series" }] };
		const teach = renderToStaticMarkup(
			<QuestionDock
				toolName="ask_user_question"
				toolCallId="t1"
				input={selectAsk as never}
				expanded={true}
				phase="teach"
				onExpand={() => {}}
				onSubmit={() => {}}
			/>,
		);
		assert.ok(teach.includes("min-h-[4.5rem]"), "teach: a generous dump area");
		const probe = renderDock({ toolName: "ask_user_question", toolCallId: "q1", input: selectAsk as never });
		assert.ok(!probe.includes("min-h-[4.5rem]"), "probe (default): stays compact");
		assert.ok(probe.includes("min-h-10"), "probe: one quiet row");
	});

	it("text-mode asks keep Enter-to-submit and the answer label", () => {
		const html = renderDock({
			toolName: "ask_user_question",
			toolCallId: "a2",
			input: { question: "Explain the chain rule in your own words." } as never,
		});
		assert.ok(html.includes('data-testid="answer-field"'), "text mode is the answer field");
		assert.match(html, /Your answer/, "labeled as the answer");
		assert.ok(!html.includes('data-testid="thinking-field"'), "no thinking field in text mode (v1)");
		assert.ok(!html.includes("⌘/Ctrl"), "no dump shortcut hint — Enter already submits");
	});

	it("AnsweredCard shows the explain answer's confidence as a word, never a rail or percentage", () => {
		const answer = buildAnswer(explainQD(), { text: "Mercury, closest orbit.", confidence: "guessing" });
		const html = renderToStaticMarkup(<AnsweredCard answer={answer} />);
		const doc = parseHTML(`<html><body>${html}</body></html>`).document;
		assert.equal(doc.querySelector('[data-testid="answered-confidence"]')?.textContent, "Guessing");
		assert.ok(!html.includes("confidence-rail") && !/\d+%/.test(html));
	});

	it("AnsweredCard shows no confidence where none exists (ask, older explain records)", () => {
		const ask = buildAnswer(askQD(), { other: "Shaky" });
		assert.ok(!renderToStaticMarkup(<AnsweredCard answer={ask} />).includes("answered-confidence"), "ask never had one");
		const { confidence: _none, ...older } = buildAnswer(explainQD(), { text: "x" });
		assert.ok(!renderToStaticMarkup(<AnsweredCard answer={older} />).includes("answered-confidence"), "pre-7-Nov explain answers");
	});

	it("an old transcript's multiple-choice answer renders as a plain read-only card", () => {
		// A persisted `quiz` answer from before multiple choice was removed:
		// the grading, the explanation and the 0–100 confidence are ignored.
		const legacy = {
			kind: "quiz",
			tool: "probe",
			questionText: "Which planet is closest to the sun?",
			options: [{ index: 1, label: "Venus" }, { index: 2, label: "Mercury" }],
			answers: [{ index: 1, label: "Venus", value: "Venus" }],
			correct: false,
			correctIndices: [2],
			dontKnow: false,
			explanation: "Mercury is the innermost planet.",
			confidence: 70,
			answeredAt: "2026-10-01T00:00:00.000Z",
		} as unknown as QuestionAnswerData;
		const input = { question: "Which planet is closest to the sun?", options: [{ label: "Venus" }, { label: "Mercury" }], correctAnswer: "Mercury", explanation: "Mercury is the innermost planet." };
		const html = renderToStaticMarkup(<AnsweredCard answer={legacy} input={input} />);
		assert.match(html, /Which planet is closest to the sun\?/);
		assert.match(html, /Venus/);
		assert.match(html, /Mercury/);
		assert.match(html, />Question</, "the plain label");
		assert.ok(!/incorrect|70%|innermost|answered-confidence/.test(html), "no grading, explanation or percentage");
	});

	it("AnsweredCard renders the learner's own Other answer AS an option row", () => {
		const answer = buildAnswer(askQD(), { other: "Fairly confident — but shaky on applications" });
		const html = renderToStaticMarkup(<AnsweredCard answer={answer} />);
		assert.ok(html.includes('data-testid="answered-other"'), "the Other answer is an option row");
		assert.match(html, /border-primary bg-accent/, "styled like its selected siblings");
		assert.match(html, /shaky on applications/, "the typed words render");
		// Inside the options container — same list, not a loose quote outside it.
		assert.ok(
			html.indexOf("Very") < html.indexOf("answered-other"),
			"the Other row sits with the listed options",
		);
	});

	it("AnsweredCard promotes the learner's thinking to a first-class block", () => {
		const answer = buildAnswer(askQD(), {
			values: ["Somewhat"],
			thinking: "I picked Venus because it looks brightest — but now I realize brightness isn't distance.",
		});
		const html = renderToStaticMarkup(<AnsweredCard answer={answer} />);
		assert.ok(html.includes('data-testid="your-thinking"'), "the thinking row exists");
		assert.match(html, /YOUR THINKING/, "labeled as the learner's voice (all caps, owner round 3)");
		// COLLAPSED ARRIVAL (owner round 2, 2026-10-05): the SSR output is the
		// trigger row only — the thinking text is one click away, never loud.
		assert.ok(html.includes('data-testid="your-thinking-trigger"'), "the trigger row");
		assert.ok(html.includes('aria-expanded="false"'), "arrives collapsed");
		// ONE GEOMETRY, NO BAND IN CARDS (owner round five, 2026-10-07): the
		// accent lift read too light — rail only, heights match everywhere.
		const yourRow = html.slice(html.indexOf('data-testid="your-thinking"'));
		assert.ok(!yourRow.slice(0, 400).includes("bg-card") && !yourRow.slice(0, 400).includes("bg-accent"), "no band inside the card");
		// THE RAIL GROUPS (owner correction): the label sits INSIDE the rail —
		// ownership readable from the rail alone, collapsed or expanded.
		const railAt = html.indexOf("border-l-[calc(3ch-14px)]");
		const trigAt = html.indexOf("your-thinking-trigger");
		assert.ok(railAt !== -1 && railAt < trigAt, "the rail opens before the label (same quote)");
		assert.ok(!html.includes("brightness isn&#x27;t distance"), "the text is hidden until expanded");
		assert.ok(!html.includes("Note:"), "no longer a muted 'Note:' footnote");
	});

	it("AnsweredCard does NOT grade ask answers", () => {
		const qd: QuestionData = {
			id: "a1",
			kind: "ask",
			question: "How confident are you?",
			mode: "single-select",
			options: normalizeOptions([{ label: "Very" }, { label: "Somewhat" }]),
			createdAt: new Date().toISOString(),
		};
		const answer = buildAnswer(qd, { values: ["Somewhat"] });
		const html = renderToStaticMarkup(<AnsweredCard answer={answer} />);
		assert.ok(!html.includes("incorrect"), "ask answers are never graded");
		assert.match(html, /Somewhat/);
	});

	it("AnsweredCard renders dismissal as skipped", () => {
		const answer = { ...buildAnswer(askQD(), {}), dismissed: true };
		const html = renderToStaticMarkup(<AnsweredCard answer={answer} />);
		assert.match(html, /skipped/);
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

	it("one-line $$...$$ renders inline (micromark behavior — the transform relies on it for \(...\))", () => {
		// micromark treats a one-line $$...$$ inside a paragraph as 2-dollar
		// inline mathText, not flow math. That is exactly how the transformed
		// \(...\) renders inline; pin the behavior so a renderer swap can't
		// silently change it.
		const html = renderToStaticMarkup(<MessageResponse>{"$$\\int_0^1 x^2\\,dx$$"}</MessageResponse>);
		assert.ok(html.includes("katex") && !html.includes("katex-display"), "one-liner should render inline");
	});

	it("does NOT eat escaped currency (\\$5 stays text)", () => {
		// With dollar math enabled, Markdown-escaped dollars remain literal.
		const html = renderToStaticMarkup(<MessageResponse>{"It costs \\$5 and \\$10 more."}</MessageResponse>);
		assert.ok(!html.includes("katex"), "escaped currency must not parse as math");
		assert.match(html, /\$5/);
	});

	it("explain cards render math in the question and the committed answer", () => {
		const mathExplain = {
			question: "What is $\\frac{dy}{dx}$ of $y = x^2$?",
			correctAnswer: "The power rule gives $\\frac{dy}{dx} = 2x$.",
		};
		const pendingHtml = renderDock({ toolName: "recall", toolCallId: "m1", input: mathExplain as never });
		assert.ok(pendingHtml.includes("katex"), "pending dock: question math renders");
		const qd: QuestionData = { ...explainQD(), question: mathExplain.question, committedAnswer: mathExplain.correctAnswer };
		const answeredHtml = renderToStaticMarkup(<AnsweredCard answer={buildAnswer(qd, { text: "2x" })} />);
		assert.ok((answeredHtml.match(/class="katex"/g) ?? []).length >= 2, "answered card: question and commitment math render");
	});
});

describe("teach-check reveal (W5 phase separation)", () => {
	// The collapsed dock renders the bar AND the hidden form (it stays mounted
	// so a half-made selection survives) — assertions target the bar species.
	it("teach-phase check collapses into the invitation bar, not the scroll bar", () => {
		const html = renderToStaticMarkup(
				<QuestionDock
					toolName="explain"
					toolCallId="t1"
					input={explainInput as never}
					expanded={false}
					reveal
					onExpand={() => {}}
					onSubmit={() => {}}
				/>,
		);
		assert.ok(html.includes('data-testid="teach-check-reveal"'), "invitation affordance present");
		assert.match(html, /Check your understanding/);
		assert.match(html, /Which planet is closest/, "question teaser invites, not minimizes");
		assert.match(html, /Open/, "a clear reveal action");
	});

	it("probe questions keep the plain collapsed bar (no invitation copy)", () => {
		const html = renderToStaticMarkup(
				<QuestionDock
					toolName="recall"
					toolCallId="q1"
					input={explainInput as never}
					expanded={false}
					onExpand={() => {}}
					onSubmit={() => {}}
				/>,
		);
		assert.ok(html.includes('data-testid="question-dock-bar"'), "the scroll-collapse strip");
		assert.ok(!html.includes("Check your understanding"), "no invitation copy outside teach phase");
		assert.match(html, /Answer/, "the strip keeps its Answer affordance");
	});

	it("after the reveal, the teach check renders the full form (probe default, unchanged)", () => {
		// Post-click: expanded=true — exactly today's dock. The probe auto-open
		// path renders the identical form; this is also the regression pin for it.
		const html = renderDock({ toolName: "explain", toolCallId: "t1", input: explainInput as never });
		assert.ok(html.includes('data-testid="question-dock"'), "the form is the dock's content once expanded");
		assert.match(html, /Submit answer/);
	});
});

// ─── probe-done card (the malformed-assessment crash) ─────────────────────
// The live bug: the model stringified `assessment` (a rejected input), and
// the card's input-preview fallback trusted the shape — strands died. The
// preview now reads only pending inputs; an errored part renders the quiet
// retry note.
describe("probe-done card", () => {
	const validAssessment = {
		strands: [
			{ strand: "modal logic basics", assessment: "Floor: solid intuition; ceiling: notation." },
			{ strand: "indexical 'actual'", assessment: "Genuine floor — prior exposure likely." },
		],
		summary: "Bracketed: teach the symbols on the intuition he has.",
	};

	it("renders the strand-by-strand assessment — the CALL is its home (context diet 2026-10-09)", () => {
		const html = renderToStaticMarkup(
			<ProbeDoneCard
				part={{ state: "output-available", input: { assessment: validAssessment }, output: { ok: true } } as never}
			/>,
		);
		assert.ok(html.includes('data-testid="probe-done-card"'));
		assert.match(html, /modal logic basics/);
		assert.match(html, /indexical &#x27;actual&#x27;|indexical 'actual'/);
		assert.match(html, /Bracketed/);
		// An ok output alone (the pre-diet echo shape) renders the quiet
		// fallback, never strands: the assessment no longer rides the result.
		const echoless = renderToStaticMarkup(
			<ProbeDoneCard part={{ state: "output-available", output: { ok: true } } as never} />,
		);
		assert.match(echoless, /Writing the assessment…/);
		assert.ok(!echoless.includes("modal logic basics"), "no assessment echo in the result");
	});

	it("previews the assessment from a PENDING (validated) input", () => {
		const html = renderToStaticMarkup(
			<ProbeDoneCard part={{ state: "input-available", input: { assessment: validAssessment } } as never} />,
		);
		assert.match(html, /modal logic basics/);
	});

	it("a REJECTED assessment (the stringified live shape) renders the retry note, never the garbage", () => {
		// The exact live crash: assessment arrived as a string, zod rejected
		// the call, the model retried — this dead part must not explode.
		const html = renderToStaticMarkup(
			<ProbeDoneCard
				part={{
					state: "output-error",
					errorText: "Validation failed",
					input: { assessment: "strands: [{\"strand\": ...stringified garbage" },
				} as never}
			/>,
		);
		assert.match(html, /malformed/);
		assert.match(html, /retried/);
		assert.ok(!html.includes("strands:"), "the rejected input never renders");
	});

	it("a mid-stream partial without strands renders the writing note, not a crash", () => {
		const html = renderToStaticMarkup(
			<ProbeDoneCard part={{ state: "input-streaming", input: { assessment: { summary: "…" } } } as never} />,
		);
		assert.match(html, /Writing the assessment/);
	});
});

// ─── the explain reveal (free-recall, owner 2026-09-27) ────────────────────

describe("AnsweredCard: the explain variant", () => {
	const explainQD = (): QuestionData => ({
		id: "e1",
		kind: "explain",
		question: "Explain why the null result matters.",
		mode: "text",
		options: [],
		committedAnswer: "It ruled out the luminiferous aether — a stationary aether predicts a fringe shift, and none was seen.",
		createdAt: new Date().toISOString(),
	});

	it("reveals the single committed answer (reasoning inside it) with NO verdict chips", () => {
		const html = renderToStaticMarkup(<AnsweredCard answer={buildAnswer(explainQD(), { text: "Something about relativity?" })} />);
		assert.match(html, /Explain/, "labeled as the explain kind");
		assert.match(html, /The answer:/);
		assert.match(html, /luminiferous aether/);
		assert.match(html, /fringe shift/);
		assert.ok(!html.includes("Why:"), "no separate explanation field — one committed answer (owner 2026-09-27)");
		assert.ok(!html.includes("incorrect") && !html.includes("correct</"), "no client grading");
	});

	it("renders his free text as the answer", () => {
		const html = renderToStaticMarkup(<AnsweredCard answer={buildAnswer(explainQD(), { text: "Something about relativity?" })} />);
		assert.match(html, /Something about relativity\?/);
	});

});

// ─── probe-phase naming (owner, 2026-10-09): the probe/recall rename —
//     both surfaces carry the tool's OWN name ────────────────────────────

describe("probe-phase naming: Recall labels", () => {

	it("the dock labels a recall question as Recall", () => {
		const html = renderDock({ toolName: "recall", toolCallId: "r1", input: { question: "Explain the chain rule.", correctAnswer: "Outer function times the derivative of the inner." } as never });
		assert.match(html, /Recall/);
		assert.ok(!html.includes(">Explain<"), "not the teach label");
	});

	it("an answered recall labels Recall", () => {
		const recallQD: QuestionData = {
			id: "r2",
			kind: "explain",
			question: "Explain why the null result matters.",
			mode: "text",
			options: [],
			committedAnswer: "It ruled out the luminiferous aether.",
			createdAt: new Date().toISOString(),
		};
		const html = renderToStaticMarkup(<AnsweredCard answer={buildAnswer(recallQD, { text: "A hand-wave." }, "recall")} />);
		assert.match(html, /Recall/);
		assert.ok(!html.includes(">Explain<"), "not the teach label");
	});

	it("old records (no tool) keep the kind labels", () => {
		const oldQD: QuestionData = {
			id: "o2",
			kind: "explain",
			question: "Explain why the null result matters.",
			mode: "text",
			options: [],
			committedAnswer: "It ruled out the luminiferous aether.",
			createdAt: new Date().toISOString(),
		};
		const html = renderToStaticMarkup(<AnsweredCard answer={buildAnswer(oldQD, { text: "A hand-wave." })} />);
		assert.match(html, /Explain/, "no tool field → the standing kind label");
	});
});

// ─── the two roles in the UI (predict vs check, owner 2026-10-03) ─────────
// Predictions arrive OPEN before the teaching; checks arrive collapsed after
// it.
describe("predict vs check rendering", () => {
	it("a collapsed predict explain renders the 'Prediction' chip", () => {
		const html = renderToStaticMarkup(
			<QuestionDock
				toolName="explain"
				toolCallId="call-p1"
				input={{ ...explainInput, type: "predict" } as never}
				expanded={false}
				onExpand={() => {}}
				onSubmit={() => {}}
			/>,
		);
		assert.ok(html.includes("Prediction"), `chip missing: ${html.slice(0, 200)}`);
	});

	it("an expanded explain reads the 'Explain' eyebrow", () => {
		const html = renderDock({ toolName: "explain", toolCallId: "call-c1", input: explainInput as never });
		assert.ok(html.includes("Explain"));
	});

	it("the reading-thinking channel is LIFTED above the card as its own user-side block", () => {
		const withReading = buildAnswer(explainQD(), {
			text: "Mercury",
			thinking: "answering thought",
			readingThinking: "was unsure mid-paragraph",
		});
		const html = renderToStaticMarkup(<AnsweredCard answer={withReading} />);
		// The unified ThinkingBlock (owner round, 2026-10-05; round two
		// 2026-10-07): the reading thoughts render BEFORE the card as the
		// banded user-thinking row, arriving EXPANDED (clearly sent).
		const blockAt = html.indexOf("reading-thinking-block");
		const cardAt = html.indexOf("answered-card");
		assert.ok(blockAt !== -1, "the lifted block renders");
		assert.ok(blockAt < cardAt, "it sits ABOVE the answered card");
		assert.ok(html.includes("YOUR THINKING"), "the plain label");
		assert.ok(!html.includes("Your thinking while reading"), "the old verbose label is gone");
		assert.ok(!html.includes("your-reading-thinking"), "the in-card inset is gone");
		// EXPANDED ARRIVAL (owner round two, 2026-10-07): transcript rows
		// render their text; the in-card answer thinking stays collapsed.
		assert.ok(html.includes('data-testid="your-thinking-trigger"'), "the answer thinking stays inside the card");
		assert.ok(html.includes("was unsure mid-paragraph"), "the lifted row arrives expanded");
		assert.ok(!html.includes("answering thought"), "the in-card row stays collapsed");
		const legacy = { ...buildAnswer(explainQD(), { text: "Mercury" }), note: "a 2026-09 answer" };
		const legacyHtml = renderToStaticMarkup(<AnsweredCard answer={legacy} />);
		assert.ok(legacyHtml.includes("a 2026-09 answer") || legacyHtml.includes('data-testid="your-thinking-trigger"'), "records from before the rename still render");
	});
});

// ─── details + option descriptions render as markdown (owner, 2026-10-12) ──

describe("question context renders as markdown everywhere (owner, 2026-10-12)", () => {
	it("pending dock: ask option descriptions render LaTeX, not plain text", () => {
		const html = renderDock({
			toolName: "ask_user_question",
			toolCallId: "d1",
			input: {
				question: "Which tool?",
				options: [
					{ label: "Pencil", description: "Wood around $\\text{Pb}_x\\text{C}$ graphite — the classic $x^2$ choice." },
					{ label: "Pen" },
				],
			} as never,
		});
		// The description rides the same MessageResponse path as the label:
		// KaTeX spans render inside the option subtext.
		const katexCount = (html.match(/class="katex"/g) ?? []).length;
		assert.ok(katexCount >= 2, `option description math renders (got ${katexCount})`);
		assert.ok(!html.includes("$\\text"), "raw dollar delimiters do not leak as visible text");
	});

	it("settled ask card keeps the details line and option descriptions — retroactively from the persisted call", () => {
		const input = {
			question: "Which destination?",
			details: "Inline $a^2+b^2=c^2$ and display:\n$$\nE = mc^2\n$$",
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
		const html = renderToStaticMarkup(<AnsweredCard answer={answer} input={input} />);
		const katexCount = (html.match(/class="katex"/g) ?? []).length;
		assert.ok(katexCount >= 3, `details (inline+display) + description math render (got ${katexCount})`);
		assert.match(html, /Entropy/, "the option description text is present");
		assert.ok(html.includes("katex-display"), "display math in the details line renders");
	});

	it("legacy settled records (no input prop) render exactly as before", () => {
		const answer = buildAnswer(askQD(), { values: ["Very"] });
		const html = renderToStaticMarkup(<AnsweredCard answer={answer} />);
		assert.match(html, /Very/, "the card renders");
		assert.equal((html.match(/class="katex"/g) ?? []).length, 0, "no context slot appears from nothing");
		assert.ok(!html.includes("lh-prose block text-xs"), "no description slot without an ask input");
	});
});
