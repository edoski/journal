/**
 * The line that says a new course's map is ready names no counts (round 6,
 * new course m5: "Its topic map is ready: 16 new topics, 17 prerequisites,
 * 3 pairs of competing methods, 34 references"); it still says which
 * material could not be read, since that is his to fix.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapStatusWords } from "../components/course-map-status.tsx";

describe("the map-ready line", () => {
	it("says the map is ready, with no counts", () => {
		const { text } = mapStatusWords({ state: "built", outcome: "16 new topics, 17 prerequisites, 3 pairs of competing methods, 34 references" });
		assert.equal(text, "Its topic map is ready.");
	});

	it("names the material it could not read", () => {
		const { text } = mapStatusWords({ state: "built", outcome: "2 new topics; could not read notes.pdf (scanned)", unread: ["notes.pdf (scanned)"] });
		assert.equal(text, "Its topic map is ready. It could not read notes.pdf (scanned).");
	});
});
