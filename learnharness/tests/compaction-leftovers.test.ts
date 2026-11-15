/**
 * Round 8 (4 #9): compaction is the tutor's bookkeeping, so it shows only
 * while a message of his waits on it. "Compacting the conversation…" sat
 * for about 20 s under a question waiting on him, and the cut left a bare
 * rule under the last reply.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { waitingLine } from "../components/lesson/working-sign.ts";

const question = [{ id: "a1", role: "assistant" as const, parts: [{ type: "tool-explain", state: "input-available", toolCallId: "q1" }] }];

test("the compaction line shows only while something of his waits on it", () => {
	assert.equal(waitingLine(question as never, { busy: false, compacting: true }), null, "a question waits on him: nothing about compaction");
	assert.equal(waitingLine([] as never, { busy: true, compacting: true }), "compacting", "his message waits on it");
	assert.equal(waitingLine([] as never, { busy: true, compacting: false }), "thinking");
	assert.equal(waitingLine([] as never, { busy: false, compacting: false }), null);
});

test("the compaction cut draws nothing in the lesson", () => {
	const lesson = readFileSync(new URL("../components/chat.tsx", import.meta.url), "utf8");
	assert.doesNotMatch(lesson, /case "data-compaction-cut"/);
});
