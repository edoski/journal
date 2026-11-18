/**
 * A question he can work out is never a prediction (round 13, 3 N5): the
 * Poisson lesson opened two steps with questions he worked out, "What
 * chance p per slot would match that rate?" and "How could you rewrite
 * (1 + x/n)^n so that this fact gives its limit?", posed as predictions,
 * so both worked answers read "Prediction, not counted". The type field
 * the tutor fills said only that a prediction comes before the teaching.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explainInputObject, PREDICT_RULE } from "../src/core/question-core.ts";

const typeField = (explainInputObject.properties.type as { description?: string }).description ?? "";

describe("a prediction is a guess he cannot yet work out (3 N5)", () => {
	it("says so where the tutor writes the question's type", () => {
		assert.ok(typeField.includes(PREDICT_RULE), "the rule is in the field's own words");
		assert.match(PREDICT_RULE, /guess he cannot yet work out/);
		assert.match(PREDICT_RULE, /compute or derive/);
		assert.match(PREDICT_RULE, /even one that opens a step/);
	});

	it("tells the tutor which one counts", () => {
		assert.match(typeField, /predict = a guess[^=]*kept, never counted/);
		assert.match(typeField, /check = a question he can work out[^=]*; counted/);
	});
});
