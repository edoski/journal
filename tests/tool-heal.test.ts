/**
 * THE WHITEHEAD INCIDENT PINS (owner, 2026-10-09): glm-5.3 (z-ai via
 * OpenRouter) emitted `type: "\"predict\""` (the literal with quotes baked
 * in; the schema's own description displayed the values quoted+colon),
 * rejected TEN times with byte-identical retries while the lesson never
 * started.
 *
 * The fixes these pins hold:
 *  1. THE STANDARD HEAL EVERYWHERE — healToolRecord wraps every registry
 *     (bareQuestionTools carried NO prepareArguments at all), and the
 *     quote-encoded literal heals before TypeBox validation.
 *  2. THE DEBRIS STRIP AT THE READ SEAM — normalizeQuestionType.
 *  3. THE DISPLAY MIRROR — the record keeps RAW arguments, so the display
 *     parse must still render a wobbled record (an invisible pending
 *     question is a learner lockout).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { healEncodedArguments } from "../src/core/argument-heal.ts";
import { stripModelValueDebris } from "../src/core/value-debris.ts";
import { explainInputObject, normalizeQuestionType } from "../src/core/question-core.ts";
import { parseExplainInput } from "../src/core/tool-parts.ts";
import { bareQuestionTools } from "../src/agent/teacher-agent.ts";

/** The incident's exact encoding: the value wrapped in literal quotes. */
function QUOTED(value: string): string {
	return `"${value}"`;
}

// A complete, well-formed teach explain — every field valid BUT the wobbled one.
function whiteheadExplain(type: unknown) {
	return {
		type,
		nodeId: "experience-first",
		question: "What was Parmenides' claim?",
		correctAnswer: "What truly *is* cannot come to be or pass away — the flux is appearance.",
	};
}

describe("the death-loop shape — type with quotes baked in", () => {
	it("heals the quote-encoded literal (the ten-retry loop)", () => {
		const healed = healEncodedArguments({ type: QUOTED("predict") }, explainInputObject) as { type: unknown };
		assert.equal(healed.type, "predict");
	});

	it("END-TO-END: the healed args pass pi-ai validation where the raw threw", () => {
		const raw = whiteheadExplain(QUOTED("predict"));
		const call = (args: unknown) =>
			validateToolArguments({ name: "explain", parameters: explainInputObject } as never, {
				id: "call_x",
				type: "toolCall",
				name: "explain",
				arguments: args,
			} as never);
		assert.throws(() => call(raw));
		const validated = call(healEncodedArguments(raw, explainInputObject));
		assert.equal((validated as { type: unknown }).type, "predict");
	});

	it("WIRING: bareQuestionTools (the registry with NO prepareArguments) now heals", () => {
		const explain = bareQuestionTools().explain;
		assert.ok(explain?.prepareArguments, "the bare explain must carry the standard heal");
		const healed = explain.prepareArguments!(whiteheadExplain(QUOTED("predict"))) as { type: unknown };
		assert.equal(healed.type, "predict");
	});
});

describe("copy-syntax debris", () => {
	it("stripModelValueDebris: the observed shapes heal, interiors stay", () => {
		assert.equal(stripModelValueDebris(":parmenides"), "parmenides");
		assert.equal(stripModelValueDebris(QUOTED("predict")), "predict");
		assert.equal(stripModelValueDebris(`: "primary-external" `), "primary-external");
		assert.equal(stripModelValueDebris("`value`"), "value");
		assert.equal(stripModelValueDebris("a:b"), "a:b"); // interior colon is content
		assert.equal(stripModelValueDebris('["x"]'), '["x"]'); // interior quotes are content (JSON-array strings)
	});

	it("normalizeQuestionType heals a persisted wobbled record", () => {
		assert.equal(normalizeQuestionType(QUOTED("predict")), "predict");
		assert.equal(normalizeQuestionType('"check"'), "check");
		assert.equal(normalizeQuestionType(undefined), undefined);
		assert.equal(normalizeQuestionType("bogus"), undefined);
	});
});

describe("the display mirror — raw records render on read", () => {
	it("parseExplainInput renders the incident's persisted raw record (no invisible question)", () => {
		const parsed = parseExplainInput(whiteheadExplain(QUOTED("predict")));
		assert.ok(parsed, "the wobbled record must parse — else the question is invisible");
		assert.equal(normalizeQuestionType((parsed as { type?: unknown }).type), "predict");
	});
});
