/**
 * "Here is the question again." with no question (round 11, 4 minor 6):
 * asked "hello? did that go through?", the tutor replied "Yes, it came
 * through. Here is the question again." and nothing followed, since the app
 * no longer reprints an unchanged question. The voice refuses a promise to
 * give the open question again, naming the fix: it is still open above.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { fixFor } from "../src/agent/voice-guard.ts";

const rules = (text: string) => voiceBreaks(text, "direct").map((b) => b.rule);

describe("a promise to give the open question again", () => {
	it("is refused in every wording the tutor reached for", () => {
		for (const text of ["Yes, it came through. Here is the question again.", "It arrived. Here's that question again.", "Got it. I'll repeat the question below.", "Here it is again."]) {
			assert.ok(rules(text).includes("reprint"), text);
		}
	});

	it("is refused when it puts the open question below him (round 13, 4 minor 1: \"the question is still open below\" over \"Your turn, on the question above\")", () => {
		for (const text of ["Yes, your message came through, and the question is still open below.", "It arrived; your question stays below.", "Your check is open below."]) {
			const found = voiceBreaks(text, "direct").find((b) => b.rule === "reprint");
			assert.ok(found, text);
			assert.match(fixFor(found, "direct", text), /still open above/);
		}
		assert.equal(rules("Answer the question below in one line.").includes("reprint"), false, "a question posed under the message is below it");
	});

	it("leaves a message that says the question is still open above, and a new question in its own words", () => {
		assert.equal(rules("Yes, it came through. Your question is still open above.").includes("reprint"), false);
		assert.equal(rules("Try the same idea again with a 3 by 3 matrix.").includes("reprint"), false);
	});
});

/**
 * "Below" for a question already posed (round 14, 4 minor 1; round 13,
 * minor 1): after a restart he sent "hello? did that go through?", and the
 * tutor replied "…the question about P is ready for your answer below."
 * over "Your turn, on the question above". The guard knows the question is
 * already posed, so any "below" for it is refused; a turn that poses a new
 * question may still say "below".
 */
describe("a question already posed is never below (round 14, 4 minor 1)", async () => {
	const { VoiceGuard } = await import("../src/agent/voice-guard.ts");
	const { SEND_TO_USER_TOOL, newUserMessage } = await import("../src/core/native-messages.ts");
	type Guard = InstanceType<typeof VoiceGuard>;
	let n = 0;
	const send = (guard: Guard, message: string): string[] => {
		const call = { type: "toolCall" as const, id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } };
		guard.screen(call);
		const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(call.id);
		return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
	};
	const question = { question: "Write $P$ for the eigenbasis $b_1 = (1,1)$, $b_2 = (1,-1)$.", correctAnswer: "$P = [b_1\\ b_2]$", type: "check", nodeId: "eigenbasis" };
	const asked = (answer: unknown) => [
		newUserMessage("teach me diagonalisation"),
		{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: question }], stopReason: "toolUse", timestamp: 1 },
		...(answer ? [{ id: "r1", role: "toolResult", toolCallId: "q1", toolName: "explain", content: [{ type: "text", text: "set aside" }], details: answer, isError: false, timestamp: 2 }] : []),
	] as never;

	it("is refused in the words the lens saw, while his question is open or set aside", () => {
		for (const messages of [[...asked(null), newUserMessage("hello? did that go through?")], [...asked({ dismissed: true, reason: "asked", question: question.question }), newUserMessage("ok I am back, can we do the diagonalisation step now?")]]) {
			for (const text of ["Yes, everything you sent has arrived, and the question about P is ready for your answer below.", "Yes, once you have answered the closing question below, we move to the diagonalisation step."]) {
				const guard = new VoiceGuard(messages as never);
				assert.deepEqual(send(guard, text), ["below"], text);
			}
		}
	});

	it("names the fix: the question is above", async () => {
		const { fixFor } = await import("../src/agent/voice-guard.ts");
		assert.match(fixFor({ rule: "below", excerpt: "the question about P is ready for your answer below." }, "direct", ""), /above/);
	});

	it("leaves \"below\" alone once he answered it, and words that say \"above\"", () => {
		const answered = new VoiceGuard([...asked({ text: "P = [b1 b2]", confidence: "neutral" })] as never);
		assert.deepEqual(send(answered, "Answer the question below in one line."), []);
		const open = new VoiceGuard([...asked(null), newUserMessage("hello? did that go through?")] as never);
		assert.deepEqual(send(open, "Yes, it arrived, and your question about P is still open above."), []);
	});
});
