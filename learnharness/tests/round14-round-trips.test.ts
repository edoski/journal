/**
 * Round 14, M9 (3 N2, 2 n3): probe to teaching took 53 to 71 s, and a
 * grading turn that built an unasked demo 64 s. Of the probe's close, two
 * model replies ran one after the other for what one reply can say: the
 * save of his last answer, then probe_done; plan_init, then the first
 * step. Each extra reply re-reads the lesson and costs its own wait
 * (2 to 3 s apiece in the measured runs). A demo's brief, written before
 * the reply, held the reply back by its own length. The prompts now ask
 * for one reply where one does, and the demo after the reply.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HANDOFF_TEXT } from "../src/core/contracts.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the probe's last answer is saved in the reply that concludes it", () => {
	assert.match(read("src/agent/prompts/prober/10-probe-doctrine.md"), /Save his last answer in the same reply: `course_save`, then `probe_done` after it/);
	assert.match(read("src/agent/tools/probe.ts"), /Call it in the same reply as the course_save of his last answer/);
	assert.match(read("src/agent/prompts/course/10-record.md"), /the probe's last save goes in the reply that calls `probe_done`, before it/, "the record's own save rule says so, since it alone read as a reply of its own (one measured run)");
});

test("the plan and the first step are one reply", () => {
	assert.match(HANDOFF_TEXT, /call plan_init and, in that same reply, start teaching with the first step alone[^;]*never waiting for plan_init's result/);
	assert.match(read("src/agent/prompts/teacher/10-planning.md"), /\*\*Then, in the same reply:\*\* `plan_init`, then beside it the first step alone, never in a reply that waits for `plan_init`'s result/);
});

test("a demo goes after the reply to his work, before its question", () => {
	// Round 16, M5: after the reply that grades his work (round16-grade-first.test.ts).
	assert.match(read("src/agent/prompts/teacher/50-demos.md"), /In a turn that answers his work, the demo goes in the reply after the one that grades it, before its question/);
});
