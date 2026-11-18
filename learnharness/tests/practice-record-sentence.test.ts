/**
 * A practice answer reads in the topic's history as a line on what he did,
 * like a lesson's (round 11, 2 n5, shots 29 and 49): Earlier rows were
 * titled with the whole problem ("A matrix E has 5 rows and 3 columns, and
 * its three…"), and a two-try problem's first try was a row with no words
 * ("First try · Sure, but wrong"), since the practice save stored the
 * problem as the record's text.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { practiceObservations, type PracticeConclusion } from "../src/core/practice-attempts.ts";
import { concludeInputObject } from "../src/agent/tools/practice.ts";

const POSE = { statement: "A matrix $E$ has 5 rows and 3 columns, and its three columns are independent. What is $\\dim \\ker E$?", topics: ["kernel"] };

describe("a practice answer's record sentence (2 n5)", () => {
	it("is the line the tutor writes on what he did, for each try, never the problem", () => {
		const c: PracticeConclusion = {
			outcome: "solved",
			rung: null,
			result: "correct",
			response: "$3 - 3 = 0$",
			record: "Subtracted the rank from the columns to get $\\dim \\ker E = 0$",
			firstTry: { result: "incorrect", response: "$5 - 3 = 2$", sure: "confident", record: "Subtracted the rank from the rows instead of the columns" },
		};
		assert.deepEqual(practiceObservations(POSE, c, undefined).map((o) => o.text), ["Subtracted the rank from the rows instead of the columns", "Subtracted the rank from the columns to get $\\dim \\ker E = 0$"]);
	});

	it("is asked of the tutor on the conclusion and on its first try", () => {
		const schema = concludeInputObject as unknown as { properties: Record<string, { description?: string; properties?: Record<string, unknown> }> };
		assert.ok(schema.properties.record, "the conclusion carries the record sentence");
		assert.ok(schema.properties.firstTry?.properties?.record, "so does its first try");
	});
});
