import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatContextMeasurement } from "../components/usage-format.ts";

describe("formatContextMeasurement", () => {
	it("unknown context is explicit; changing the selected limit preserves the measurement", () => {
		assert.equal(formatContextMeasurement(null, 100_000), "? / 100k");
		assert.equal(formatContextMeasurement(83_000, 100_000), "83k / 100k");
		assert.equal(formatContextMeasurement(83_000, 200_000), "83k / 200k");
		assert.equal(formatContextMeasurement(83_000, null), "83k");
	});
});
