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
	assert.match(lesson, /showsWorking\(messages, busy, compacting\)/, "the line reads the session's busy fact, a wake the server is setting up included (round 8/9: about 10 s of nothing before practice woke; handoff-busy.test.tsx)");
	assert.equal(showsWorking([] as never, true), true);
});

test("the compaction cut draws nothing in the lesson", () => {
	const lesson = readFileSync(new URL("../components/chat.tsx", import.meta.url), "utf8");
	assert.doesNotMatch(lesson, /case "data-compaction-cut"/);
});

test("the lesson counts no context of its own: when to compact is Claude Code's call", async () => {
	const { SessionModel } = await import("../components/session-core.ts");
	const state = new SessionModel({ chatId: "fixture", initialMessages: [] }).getState();
	assert.equal("contextTokens" in state, false);
});
