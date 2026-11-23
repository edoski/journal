/**
 * Round 20, m13 (4 minor 4). After a restart with compaction, "hello? did
 * that go through?" got the mark under his answer and a reply that went
 * straight to part (e), with no word that the answer was saved; on the
 * plain path the same hello got "It went through, and your proof … is
 * saved once." The tutor is told to answer such a message in a sentence
 * (shared/20-question-tools.md), but the voice guard refuses "Your answer
 * went through" (`arrival`), and its fix told the tutor to leave the line
 * out even when he asked. Now the fix says to answer him on the answer
 * itself, in a sentence the guard keeps.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixFor } from "../src/agent/voice-guard.ts";
import { voiceBreaks } from "../src/core/voice-check.ts";

describe("his 'did that go through?' answered in words", () => {
	it("the compacted path's reply is refused, and the fix asks for the answer to his question, not silence", () => {
		const draft = "Your answer went through and is saved. Part (e) is the last part of the further problem.";
		const broken = voiceBreaks(draft).find((b) => b.rule === "arrival");
		assert.ok(broken, "the arrival line is refused");
		const fix = fixFor(broken!, undefined, draft);
		assert.doesNotMatch(fix, /mark under his answer says so/, "never told to leave his question unanswered");
		assert.match(fix, /unless he asked whether it went through/);
		const example = /"([^"]+)"[^"]*$/.exec(fix)?.[1];
		assert.equal(example, "It is saved, marked right with help.");
		assert.deepEqual(voiceBreaks(example!).map((b) => b.rule), [], "the sentence it asks for is kept");
	});
});
