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
		const lines = new Set(["recall", "explain", "ask_user_question", "probe_done", "demo", "visual", "Grep", "teach"].map((tool) => toolActivityLabel(tool)));
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
		assert.equal(streamingToolActivity([probeEnd, msg("assistant", [toolPart("plan_init", "input-streaming")])]), "Planning the lesson…");
		const firstStep = msg("assistant", [toolPart("plan_init", "output-available"), { type: "text", text: "Picture the hour cut into slots." }]);
		assert.equal(workingLine([probeEnd, firstStep]), "Thinking…", "once his first step arrives, the line is Thinking… again");
		const asked = msg("assistant", [toolPart("explain", "input-available")]);
		assert.equal(planningLesson([probeEnd, asked]), false);
		assert.equal(planningLesson([msg("assistant", [toolPart("probe_done", "input-available")])]), true, "a probe_done still settling keeps the line (live run 3: a 0.3 s Thinking… blink)");
		assert.equal(planningLesson([msg("assistant", [toolPart("probe_done", "output-error")])]), false, "a refused probe_done is not the probe's end");
		assert.equal(planningLesson([msg("user", [{ type: "text", text: "hi" }])]), false);
	});

	it("a question refused beside a refused plan never reached him, so the line stays Planning the lesson… (round 11 integration: Thinking… blinked twice at 225.6 s and 233 s)", () => {
		const probeEnd = msg("assistant", [{ type: "text", text: "That's not right." }, toolPart("probe_done", "output-available")]);
		const refusedPair = msg("assistant", [toolPart("plan_init", "output-error"), toolPart("demo", "output-available"), toolPart("explain", "output-error")]);
		assert.equal(workingLine([probeEnd, refusedPair]), "Planning the lesson…", "thinking after the refusals");
		const replanned = msg("assistant", [toolPart("plan_init", "output-available")]);
		assert.equal(workingLine([probeEnd, refusedPair, replanned]), "Planning the lesson…", "thinking between the saved plan and its first step");
		const asked = msg("assistant", [toolPart("explain", "input-available")]);
		assert.equal(planningLesson([probeEnd, refusedPair, replanned, asked]), false, "the question that reaches him ends the wait");
	});

	it("a problem sheet's turn says one phase at a time: its map of parts is no lesson plan, and a refused question is still being written (round 17, 2 m4)", () => {
		const sheet = [msg("user", [{ type: "text", text: "dim ker A is 2" }]), msg("assistant", [toolPart("course_save", "output-available"), toolPart("send_to_user", "output-available")])];
		const mapping = msg("assistant", [toolPart("lesson_progress", "output-available"), toolPart("plan_init", "input-streaming")]);
		assert.equal(streamingToolActivity([...sheet, mapping]), "Thinking…", "a sheet's parts map is not Planning the lesson…");
		const refused = msg("assistant", [toolPart("explain", "output-error")]);
		assert.equal(workingLine([...sheet, refused]), "Writing a question…", "the refused question is written again");
		const reasking = msg("assistant", [toolPart("explain", "input-streaming")]);
		assert.equal(streamingToolActivity([...sheet, refused, reasking]), "Writing a question…");
		const posed = msg("assistant", [toolPart("explain", "input-available")]);
		assert.equal(workingLine([...sheet, refused, posed]), "Thinking…", "a question that reached him ends the wait");
		const lines: string[] = [];
		for (const step of [[], [mapping], [refused], [refused, reasking]]) {
			const view = [...sheet, ...step];
			const line = streamingToolActivity(view) ?? workingLine(view);
			if (line !== lines.at(-1)) lines.push(line);
		}
		assert.deepEqual(lines, ["Thinking…", "Writing a question…"]);
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
