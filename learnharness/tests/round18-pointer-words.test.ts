/**
 * Round 18, m14 (4 minor 3): Next problem in Rank practice posed the
 * Homomorphisms review problem, then "This one is your Homomorphisms
 * review.", and a turn later "Your Homomorphisms review is still open
 * above, and your answer goes in its thinking field." The problem was the
 * last thing on his screen, so the pointer told him nothing; the round-15
 * pointer rule let it pass because a message sat under the problem. And
 * "thinking field" is the prompts' name for his box, never his. A pointer
 * "above" with nothing open above is refused too.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { NEXT_PROBLEM_TEXT } from "../src/core/contracts/chat.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};
const problem = (statement: string): ToolCall => ({ type: "toolCall", id: `p-${++n}`, name: "problem", arguments: { statement, mode: "recall", topics: ["rank"], modelSolution: "…" } });

/** Rank practice after Next problem posed the Homomorphisms review. */
function rankPractice(): LhMessage[] {
	const first = problem("Find $\\operatorname{rank} A$.");
	const c: ToolCall = { type: "toolCall", id: `c-${++n}`, name: "conclude", arguments: { outcome: "solvedWithHints", result: "correct" } };
	return [
		newUserMessage("Practice rank, the sheet 4 kind of problems."),
		assistant([first]),
		{ id: `t-${++n}`, role: "custom", customType: "practice-thinking", content: "Your thinking:\nrank A = 2", display: false, details: { problemCallId: first.id }, timestamp: 1 } as LhMessage,
		assistant([c]),
		{ role: "toolResult", toolCallId: c.id, toolName: "conclude", content: [{ type: "text", text: "Problem concluded." }], isError: false, timestamp: 1 } as unknown as LhMessage,
		{ id: `nx-${++n}`, role: "custom", customType: "practice-next", content: NEXT_PROBLEM_TEXT, display: false, details: {}, timestamp: 2 } as LhMessage,
		assistant([problem("A homomorphism $h$ satisfies $h(1,1) = (1,0,2)$ and $h(1,-1) = (3,2,0)$. What is $h(5,1)$?"), send("This one is your Homomorphisms review.")]),
	];
}

describe("a pointer to the open problem he is looking at (round 18, m14)", () => {
	it("lens 4's line is refused, though a message sat under the problem", () => {
		const broke = rules(new VoiceGuard(rankPractice(), undefined, false, true), send("Your Homomorphisms review is still open above, and your answer goes in its thinking field."));
		assert.ok(broke.includes("pointer"), broke.join());
		assert.ok(broke.includes("machinery"), broke.join());
	});

	it("his box is never a thinking field", () => {
		assert.ok(voiceBreaks("Write it in the thinking field.").some((b) => b.rule === "machinery"));
	});

	it("a pointer above with nothing open above is refused", () => {
		const messages = rankPractice().slice(0, 5);
		const guard = new VoiceGuard([...messages, newUserMessage("why do the pivots give the rank?")], undefined, false, true);
		assert.ok(rules(guard, send("Pivot columns are independent. Your problem is still open above.")).includes("nothing-above"));
	});

	it("after his Ask, the open problem may be pointed at", () => {
		const guard = new VoiceGuard([...rankPractice(), newUserMessage("why are (1,1) and (1,-1) a basis?")], undefined, false, true);
		const broke = rules(guard, send("They are not parallel, so they span the plane. Your Homomorphisms review is still open above."));
		assert.ok(!broke.includes("pointer") && !broke.includes("nothing-above"), broke.join());
	});
});
