/**
 * Round 12, 2 n5: on Problem sheet 4 he typed each part, and the tutor
 * posed it in other words. Part (c), "Show that dim ker A = 2.", came back
 * as "Show that $\dim \ker A = 2$, and why?"; part (d), "Find a basis of
 * ker B … and check it against rank-nullity.", came back without its
 * check, since a question asking two things is refused. A part he typed is
 * the sheet's own, so it is posed in his words, all of it, and a "Show
 * that…" already asks for his reason.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";

let n = 0;
const recall = (question: string): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "recall", arguments: { question } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};
const typed = (words: string) => [newUserMessage("Continue Problem sheet 4: rank and nullity"), assistant([recall("A question.")]), newUserMessage(words)];

describe("a part he typed is posed in his words", () => {
	it("\"Show that …, and why?\" is refused: a show already asks for the reason", () => {
		const guard = new VoiceGuard(typed("part (c) just says: A is a 3x5 matrix with rank A = 3. Show that dim ker A = 2."));
		assert.deepEqual(rules(guard, recall("A $3 \\times 5$ matrix $A$ has $\\operatorname{rank} A = 3$. Show that $\\dim \\ker A = 2$, and why?")), ["reason-twice"]);
	});

	it("his part with its check goes through whole", () => {
		const guard = new VoiceGuard(typed("(d) Find a basis of ker B for B = [[1, 2, 0, -1], [0, 0, 1, 2]] and check it against rank-nullity."));
		assert.deepEqual(rules(guard, recall("Find a basis of $\\ker B$ for\n$$\nB = \\begin{pmatrix} 1 & 2 & 0 & -1 \\\\ 0 & 0 & 1 & 2 \\end{pmatrix}\n$$\nand check it against rank–nullity.")), []);
	});

	it("a question of the tutor's own that asks two things is still refused", () => {
		const guard = new VoiceGuard(typed("what is the kernel used for?"));
		assert.deepEqual(rules(guard, recall("What is the rank of $B$, and what is a basis of $\\ker B$?")), ["compound"]);
	});

	it("\"What is …, and why?\" stays the one way to ask a reason", () => {
		const guard = new VoiceGuard(typed("what next?"));
		assert.deepEqual(rules(guard, recall("What is $\\dim \\ker B$, and why?")), []);
	});
});
