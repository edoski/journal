/**
 * Round 8 (4 #9): compaction is the tutor's bookkeeping. The cut left a
 * bare rule under the last reply. Claude Code compacts inside a turn, so
 * the lesson says "Thinking…" while it runs, as for any turn.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { showsWorking } from "../components/lesson/working-sign.ts";

test("the lesson has no compaction line of its own: a turn that compacts shows Thinking like any turn", () => {
	const lesson = readFileSync(new URL("../components/chat.tsx", import.meta.url), "utf8");
	assert.doesNotMatch(lesson, /Compacting the conversation/);
	assert.match(lesson, /showsWorking\(messages, busy \|\| waking\)/, "a wake the server is setting up counts as running (round 8/9: about 10 s of nothing before practice woke)");
	assert.equal(showsWorking([] as never, true), true);
});

test("the compaction cut draws nothing in the lesson", () => {
	const lesson = readFileSync(new URL("../components/chat.tsx", import.meta.url), "utf8");
	assert.doesNotMatch(lesson, /case "data-compaction-cut"/);
});
