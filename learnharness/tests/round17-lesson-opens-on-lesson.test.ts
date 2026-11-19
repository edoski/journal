/**
 * Round 17, m15 (3 m2, 4 minor 1): every new lesson, a Linear Algebra one
 * included, opened on "Your Inclusion-exclusion principle review, your
 * Binomial distribution review, your Conditional probability review and
 * your Random variables and distributions review are still due today."
 * It taught nothing, and Home already offers the review. The brief no
 * longer asks for that line, and the guard refuses it in a lesson's
 * opening turn; a close, a review and his own question about the plan may
 * still name what is due.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

const LENS = "Your Inclusion-exclusion principle review, your Binomial distribution review, your Conditional probability review and your Random variables and distributions review are still due today.";
let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};

describe("a new lesson's first message names no review (round 17, m15)", () => {
	it("the lens's opening line is refused in the lesson's first turn, in any wording", () => {
		for (const text of [LENS, "Your Binomial distribution review is still due today.", "Due today: your Kernel review and your Rank review."]) {
			const guard = new VoiceGuard([newUserMessage("Linear maps and their matrices")]);
			assert.ok(rules(guard, send(text)).includes("due-reviews"), text);
		}
	});

	it("the lesson's own first step goes through", () => {
		const guard = new VoiceGuard([newUserMessage("Linear maps and their matrices")]);
		assert.deepEqual(rules(guard, send("A linear map is fixed by what it does to a basis, so two columns are all it takes to write it down.")), []);
	});

	it("a review, his question about the plan and a later turn may name what is due", () => {
		assert.ok(!rules(new VoiceGuard([newUserMessage("Review Binomial distribution")], undefined, true), send("Your Kernel review is still due today.")).includes("due-reviews"));
		const later = new VoiceGuard([newUserMessage("Linear maps"), assistant([send("A linear map is fixed by a basis.")]), newUserMessage("what is still due today?")]);
		assert.ok(!rules(later, send("Your Binomial distribution review is still due today.")).includes("due-reviews"));
	});
});
