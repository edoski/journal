/**
 * streamingToolActivity (2026-09-19, the "Writing a question…" fix): a
 * tool part stays input-streaming for its WHOLE execution (the bridge
 * defers input-available to tool_execution_end), so the transcript
 * activity line must name the ACTUAL running tool — the old code shimmered
 * "Writing a question…" over minutes-long greps.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LhViewMessage } from "../src/core/view.ts";
import { planningLesson, streamingToolActivity, toolActivityLabel, workingLine } from "../src/core/pending.ts";

function msg(role: string, parts: unknown[]): LhViewMessage {
	return { id: "m1", role, parts } as unknown as LhViewMessage;
}

function toolPart(tool: string, state: string) {
	return { type: `tool-${tool}`, toolCallId: "c1", state, input: {} };
}

describe("streamingToolActivity (the turn-activity label)", () => {
	it("question tools keep their question shimmer", () => {
		assert.equal(streamingToolActivity([msg("assistant", [toolPart("recall", "input-streaming")])]), "Writing a question…");
		assert.equal(
			streamingToolActivity([msg("assistant", [toolPart("ask_user_question", "input-streaming")])]),
			"Writing a question…",
		);
	});

	it("a tool whose work he never sees says only Thinking… (round 11, 3 n9)", () => {
		// "Searching file contents…", "Moving to teaching…" and "Moving to
		// practice…" named the tutor's machinery, not what he waits for.
		for (const tool of ["Grep", "Read", "Glob", "pdf", "research", "course_save", "course_show", "lesson_progress", "teach", "practice", "mystery_tool"]) {
			assert.equal(streamingToolActivity([msg("assistant", [toolPart(tool, "input-streaming")])]), "Thinking…", tool);
		}
	});

	it("every line names what he waits for: a question, the lesson's plan, a demo or a visual", () => {
		const lines = new Set(["recall", "explain", "ask_user_question", "probe_done", "plan_init", "demo", "visual", "Grep", "teach"].map((tool) => toolActivityLabel(tool)));
		assert.deepEqual([...lines].sort(), ["Building a demo…", "Making a visual…", "Planning the lesson…", "Thinking…", "Writing a question…"]);
	});

	it("from the probe's end to the lesson's first step, every wait reads Planning the lesson…", () => {
		// Round 11, 3 M1: 51 s of "Planning the lesson…", then "Searching
		// file contents…", then "Drawing up the plan…" for one wait.
		const probeEnd = msg("assistant", [{ type: "text", text: "That's not right." }, toolPart("probe_done", "output-available")]);
		assert.equal(planningLesson([probeEnd]), true);
		assert.equal(workingLine([probeEnd]), "Planning the lesson…");
		const searching = msg("assistant", [toolPart("Grep", "input-streaming")]);
		assert.equal(streamingToolActivity([probeEnd, searching]), "Planning the lesson…");
		assert.equal(toolActivityLabel("plan_init"), "Planning the lesson…");
		const firstStep = msg("assistant", [toolPart("plan_init", "output-available"), { type: "text", text: "Picture the hour cut into slots." }]);
		assert.equal(workingLine([probeEnd, firstStep]), "Thinking…", "once his first step arrives, the line is Thinking… again");
		const asked = msg("assistant", [toolPart("explain", "input-available")]);
		assert.equal(planningLesson([probeEnd, asked]), false);
		assert.equal(planningLesson([msg("assistant", [toolPart("probe_done", "input-streaming")])]), false, "a probe_done still being written is its own card");
		assert.equal(planningLesson([msg("user", [{ type: "text", text: "hi" }])]), false);
	});

	it("no activity once the call settles or the turn ends", () => {
		// output-available = done executing → no shimmer (the transcript
		// shows the settled card instead).
		assert.equal(streamingToolActivity([msg("assistant", [toolPart("Grep", "output-available")])]), null);
		// the last message being the user's = nothing running.
		assert.equal(streamingToolActivity([msg("user", [{ type: "text", text: "hi" }])]), null);
		assert.equal(streamingToolActivity([]), null);
	});

	it("the SECOND streaming part wins only if the first settles — parts scan forward", () => {
		// A settled call followed by a live one: the live one is the activity.
		const parts = [toolPart("Read", "output-available"), toolPart("demo", "input-streaming")];
		assert.equal(streamingToolActivity([msg("assistant", parts)]), "Building a demo…");
	});
});
