/**
 * The close's own save is not Background work: no Stop row after every
 * close (round 8, 1 §6).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runShows, toBlobs } from "../components/activity-dock.tsx";

describe("Background work (1 §6)", () => {
	it("leaves out the close's own save, and keeps a course-map build he waits on", () => {
		assert.equal(runShows({ phase: "digesting" }), false);
		assert.equal(runShows({ phase: "mapping" }), true);
		const blobs = toBlobs({ jobs: [], runs: [{ id: "c#digest", chatId: "c", title: "Eigen", phase: "digesting", startedAt: 1 }] });
		assert.deepEqual(blobs, []);
	});
});
