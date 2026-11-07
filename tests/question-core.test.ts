/**
 * Unit tests — question-core (pure logic, no server, no LLM).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Value } from "typebox/value";
import type { TSchema } from "typebox";
import {
	askInputSchema,
	askOptionProblems,
	buildAnswer,
	compactAnswerForModel,
	dismissedAnswer,
	normalizeOptions,
	explainInputBase,
	explainInputObject,
	explainInputProblems,
	explainDisplayInputSchema,
	normalizeQuestionType,
	questionNeedsReveal,
	toggleOption,
	toggleOther,
	emptyDockSelection,
	type QuestionData,
} from "../src/core/question-core.ts";
import { toolQuestionKind } from "../src/core/pending.ts";

// The boundary predicate is BOTH: structural check AND zero authoring problems.
const boundaryOk = (schema: TSchema, input: unknown, problems: string[]): boolean =>
	Value.Check(schema, input) && problems.length === 0;

describe("askInputSchema / askOptionProblems", () => {
	it("accepts a valid ask", () => {
		const ask = {
			question: "Which topic first?",
			options: [{ label: "Limits" }, { label: "Chain rule" }],
		};
		assert.equal(boundaryOk(askInputSchema, ask, askOptionProblems(ask.options ?? [])), true);
	});

	it("rejects duplicate option values and empty labels (they break the dock's keying)", () => {
		const bad = { question: "?", options: [{ label: "A", value: "x" }, { label: "B", value: "x" }] };
		assert.equal(boundaryOk(askInputSchema, bad, askOptionProblems(bad.options ?? [])), false);
		assert.match(askOptionProblems(bad.options).join(" "), /same value/);
		const emptyLabel = { question: "?", options: [{ label: "" }, { label: "B" }] };
		assert.equal(boundaryOk(askInputSchema, emptyLabel, askOptionProblems(emptyLabel.options ?? [])), false);
		assert.match(askOptionProblems(emptyLabel.options).join(" "), /label is empty/);
	});
});

// ─── normalizeOptions ───────────────────────────────────────────────────────

describe("normalizeOptions", () => {
	it("trims labels and defaults value to label", () => {
		const opts = normalizeOptions([{ label: "  Mercury  " }, { label: "Venus", value: " v " }]);
		assert.deepEqual(opts, [
			{ label: "Mercury", value: "Mercury", description: undefined },
			{ label: "Venus", value: "v", description: undefined },
		]);
	});

	it("drops empty labels", () => {
		const opts = normalizeOptions([{ label: "" }, { label: "ok" }]);
		assert.equal(opts.length, 1);
	});

	it("throws on duplicate option values", () => {
		assert.throws(() => normalizeOptions([{ label: "a", value: "x" }, { label: "b", value: "x" }]), /duplicate/);

		// GLM wobble guard (2026-09-26 gradient-descent session): the model
		// sometimes emits `options` as a JSON-encoded string — 6 of 7 quiz
		// validation failures in that session. The dock (and grading) coerce
		// via the same parseOptionsIfString the server's prepareArguments
		// runs pre-validation.
		const asString = JSON.stringify([{ label: "Slope", value: "slope" }, { label: "Value", value: "value" }]);
		const coerced = normalizeOptions(asString);
		assert.deepEqual(coerced, [
			{ label: "Slope", value: "slope", description: undefined },
			{ label: "Value", value: "value", description: undefined },
		], "a JSON-encoded string coerces to the same normalized options");
		// Non-JSON strings pass through and behave like no options (the
		// server's schema validation reports the honest error instead).
		assert.deepEqual(normalizeOptions("not json"), []);
	});

	it("handles undefined input", () => {
		assert.deepEqual(normalizeOptions(undefined), []);
	});
});

// ─── buildAnswer + compactAnswerForModel ────────────────────────────────────

const explainQD = (overrides?: Partial<QuestionData>): QuestionData => ({
	id: "e1",
	kind: "explain",
	question: "Why does the Michelson-Morley null result matter?",
	mode: "text",
	options: [],
	committedAnswer: "It ruled out the luminiferous aether — a stationary aether would produce a fringe shift, none was observed — and set up special relativity.",
	createdAt: new Date().toISOString(),
	...overrides,
});

const askQD = (overrides?: Partial<QuestionData>): QuestionData => ({
	id: "a1",
	kind: "ask",
	question: "Which topic first?",
	mode: "single-select",
	options: normalizeOptions([
		{ label: "Limits", value: "limits" },
		{ label: "Chain rule", value: "chain" },
	]),
	createdAt: new Date().toISOString(),
	...overrides,
});

describe("buildAnswer: explain", () => {
	it("snapshots the commitment; the client NEVER grades free text", () => {
		const ad = buildAnswer(explainQD(), { text: "Something about light speed being constant?" });
		assert.equal((ad as { correct?: unknown }).correct, undefined, "no client verdict — the model grades in its reply");
		assert.equal(ad.committed, explainQD().committedAnswer);
		assert.equal(ad.text, "Something about light speed being constant?");
	});

	it("always carries a confidence state, neutral unless the learner chose another", () => {
		assert.equal(buildAnswer(explainQD(), { text: "x" }).confidence, "neutral");
		assert.equal(buildAnswer(explainQD(), { text: "x", confidence: "guessing" }).confidence, "guessing");
		assert.equal(buildAnswer(explainQD(), { text: "x", confidence: "confident" }).confidence, "confident");
	});

	it("carries both thinking channels, trimmed; empty channels stay absent", () => {
		const a = buildAnswer(explainQD(), { text: "x", thinking: "  guessed  ", readingThinking: "  reading note  " });
		assert.equal(a.thinking, "guessed");
		assert.equal(a.readingThinking, "reading note");
		const b = buildAnswer(explainQD(), { text: "x" });
		assert.equal(b.thinking, undefined);
		assert.equal(b.readingThinking, undefined);
	});
});

describe("buildAnswer: ask", () => {
	it("records the selection in display order and ignores unknown values", () => {
		const ad = buildAnswer(askQD(), { values: ["mars", "chain"] });
		assert.deepEqual(ad.answers, [{ label: "Chain rule", value: "chain", index: 2 }]);
	});

	it("carries no confidence and no grading", () => {
		const ad = buildAnswer(askQD(), { values: ["limits"], confidence: "confident" });
		assert.equal(ad.confidence, undefined);
		assert.equal((ad as { correct?: unknown }).correct, undefined);
	});
});

describe("compactAnswerForModel (the model-visible diet, owner 2026-10-02)", () => {
	it("explain: his words and his confidence as the word — never the model's own commitment", () => {
		const compact = compactAnswerForModel(
			buildAnswer(explainQD(), { text: "No idea about aether.", confidence: "guessing" }),
		);
		assert.deepEqual(compact, { kind: "explain", text: "No idea about aether.", confidence: "guessing" });
		const raw = JSON.stringify(compact);
		assert.ok(!raw.includes("luminiferous"), "the commitment must not ride the result");
		assert.ok(!raw.includes("Michelson"), "no questionText");
	});

	it("explain: the default answer still says neutral", () => {
		const compact = compactAnswerForModel(buildAnswer(explainQD(), { text: "It killed the aether." }));
		assert.equal(compact.confidence, "neutral");
	});

	it("ask: selection or text, no confidence", () => {
		assert.deepEqual(compactAnswerForModel(buildAnswer(askQD({ mode: "text", options: [] }), { text: "lateral thinking" })), {
			kind: "ask",
			text: "lateral thinking",
		});
		assert.deepEqual(compactAnswerForModel(buildAnswer(askQD(), { values: ["limits"] })), {
			kind: "ask",
			answers: [{ index: 1, label: "Limits" }],
		});
	});

	it("distinct keys for the two thinking channels; legacy `note` folds into thinking", () => {
		const a = buildAnswer(explainQD(), { text: "x", thinking: "h", readingThinking: "r" });
		const compact = compactAnswerForModel(a);
		assert.equal(compact.thinking, "h");
		assert.equal(compact.thinkingWhileReading, "r");
		const legacy = compactAnswerForModel({ ...a, thinking: undefined, note: "old note" });
		assert.equal(legacy.thinking, "old note", "records written before the rename still reach the model");
		assert.equal("note" in legacy, false, "the legacy key never re-crosses the wire");
	});
});

// ─── dismissedAnswer / toolQuestionKind (ESC-abort dismissal, 2026-10-02) ──

describe("dismissedAnswer (the ESC-abort record)", () => {
	it("the minimum honest answer: kind, questionText, dismissed — nothing else claimed", () => {
		const ad = dismissedAnswer("explain", "Why?");
		assert.equal(ad.kind, "explain");
		assert.equal(ad.questionText, "Why?");
		assert.equal(ad.dismissed, true);
		assert.equal(ad.confidence, undefined, "a skip claims no confidence");
		assert.deepEqual(ad.answers, []);
		assert.ok(ad.answeredAt);
	});

	it("compacts to the one-field model diet", () => {
		assert.deepEqual(compactAnswerForModel(dismissedAnswer("ask", "Pick one")), { kind: "ask", dismissed: true });
	});
});

describe("toolQuestionKind (tool→kind parity with the dock)", () => {
	it("explain and recall are free response; everything else falls to ask", () => {
		assert.equal(toolQuestionKind("explain"), "explain");
		assert.equal(toolQuestionKind("recall"), "explain");
		assert.equal(toolQuestionKind("ask_user_question"), "ask");
		assert.equal(toolQuestionKind("quiz"), "ask");
	});
});

// ─── the dock selection state machine (multi-select Other coexistence) ──
// The live bug: in a multi-select ask, picking the custom "Other…" row
// cleared every already-picked option (single-select displacement logic
// applied to both modes). The machine lives here, pure and pinned.
describe("dock selection (toggleOption / toggleOther)", () => {
	it("multi-select: options and Other coexist — neither clears the other", () => {
		let sel = emptyDockSelection();
		sel = toggleOption("multi-select", sel, 0);
		sel = toggleOption("multi-select", sel, 1);
		assert.deepEqual([...sel.selected], [0, 1]);
		// Picking Other keeps the sibling selections.
		sel = toggleOther("multi-select", sel);
		assert.deepEqual([...sel.selected], [0, 1], "Other never clears picked options");
		assert.equal(sel.otherSelected, true);
		// Picking another option keeps Other selected.
		sel = toggleOption("multi-select", sel, 2);
		assert.equal(sel.otherSelected, true, "options never clear a typed custom answer");
		assert.deepEqual([...sel.selected], [0, 1, 2]);
		// Deselecting an option toggles it alone.
		sel = toggleOption("multi-select", sel, 0);
		assert.deepEqual([...sel.selected], [1, 2]);
		// Other toggles off alone; the siblings survive.
		sel = toggleOther("multi-select", sel);
		assert.equal(sel.otherSelected, false);
		assert.deepEqual([...sel.selected], [1, 2]);
	});

	it("single-select: displacement semantics are unchanged", () => {
		let sel = emptyDockSelection();
		sel = toggleOption("single-select", sel, 0);
		sel = toggleOther("single-select", sel);
		assert.deepEqual([...sel.selected], [], "Other displaces the picked option");
		assert.equal(sel.otherSelected, true);
		sel = toggleOption("single-select", sel, 1);
		assert.equal(sel.otherSelected, false, "an option displaces Other");
		assert.deepEqual([...sel.selected], [1]);
	});
});

// ─── the explain tool: the commitment contract ─────────────────────────────

describe("explainInputBase / explainInputProblems (the commitment contract)", () => {
	it("has ONE authoring field — no explanation remnant (owner ruling 2026-09-27)", () => {
		const keys = Object.keys(explainInputBase.properties);
		assert.deepEqual(keys, ["question", "correctAnswer", "details"]);
	});

	it("the teach object LEADS with the required pair (type, nodeId) — base fields follow", () => {
		// Owner, 2026-10-09: glm-5.3 dropped `type`/`nodeId` when they trailed
		// the content fields — required fields generated FIRST get dropped
		// least, and the order doubles as the authoring order (role, target,
		// then the question).
		const keys = Object.keys(explainInputObject.properties);
		assert.deepEqual(keys, ["type", "nodeId", ...Object.keys(explainInputBase.properties)]);
	});

	it("an empty commitment is the one authoring problem", () => {
		assert.deepEqual(explainInputProblems({ correctAnswer: "Full speed is c." }), []);
		assert.deepEqual(explainInputProblems({ correctAnswer: "   " }), [
			"correctAnswer is required — commit to the full correct answer BEFORE posing the question.",
		]);
	});
});

// ─── the question's role: predict vs check (owner 2026-10-03) ─────────────
// Teaching units are a predict → teach → check cycle. The teach explain
// carries a REQUIRED `type`; the prober's recall never does. Only CHECKS
// collapse behind "Check your understanding" — predictions arrive open.
describe("the role field (predict | check)", () => {
	const valid = {
		type: "check",
		nodeId: "planet-order",
		question: "Which planet is closest to the Sun, and why does that matter for its year?",
		correctAnswer: "Mercury — the innermost orbit is the shortest, so its year is 88 days.",
	};

	it("the teach schema REQUIRES type; the probe schema has no such field", () => {
		assert.equal(Value.Check(explainInputObject, valid), true, "fixture (type: check) is boundary-valid");
		assert.equal(Value.Check(explainInputObject, { ...valid, type: undefined }), false);
		assert.equal("type" in explainInputBase.properties, false, "the prober's recall stays role-less");
		assert.equal("nodeId" in explainInputBase.properties, false);
	});

	it("normalizeQuestionType: exact literals only — old records and wobble degrade to check-style", () => {
		assert.equal(normalizeQuestionType("predict"), "predict");
		assert.equal(normalizeQuestionType("check"), "check");
		assert.equal(normalizeQuestionType(undefined), undefined);
		assert.equal(normalizeQuestionType("prediction"), undefined);
		assert.equal(normalizeQuestionType(42), undefined);
	});

	it("questionNeedsReveal: teach checks collapse, predictions never do", () => {
		assert.equal(questionNeedsReveal("explain", { type: "check" }, "teach"), true);
		assert.equal(questionNeedsReveal("explain", { type: "predict" }, "teach"), false, "predictions arrive OPEN");
		assert.equal(questionNeedsReveal("explain", undefined, "teach"), true, "pre-type records render check-style");
		assert.equal(questionNeedsReveal("explain", { type: "check" }, "probe"), false);
		assert.equal(questionNeedsReveal("recall", {}, "teach"), false);
		assert.equal(questionNeedsReveal("ask_user_question", {}, "teach"), false);
	});

	it("the display parse KEEPS the role", () => {
		const cleaned = Value.Clean(explainDisplayInputSchema, { ...valid }) as Record<string, unknown>;
		assert.equal(cleaned.type, "check");
		assert.equal("nodeId" in cleaned, false);
	});
});
