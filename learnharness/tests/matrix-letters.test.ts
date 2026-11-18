/**
 * A letter names one matrix for the whole session (round 10, 3 m7): seven
 * matrices were named A in one lesson, and B named both a rank-2 matrix and
 * the undoing matrix. A message or question that names a new matrix with a
 * letter the session already gave another is rewritten with a free letter.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { reusedLetter } from "../src/core/voice-check.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { sourcePromptTexts } from "../src/agent/prompt-segments.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const A1 = "$$A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$$";
const A2 = "Now take $$A = \\begin{pmatrix} 2 & 0 \\\\ 0 & 3 \\end{pmatrix}$$ and undo it.";

function rulesOf(earlier: string, next: string): string[] {
	const guard = new VoiceGuard([newUserMessage("Invertible matrices"), assistant([send(earlier)]), newUserMessage("go on")]);
	const call = send(next);
	guard.screen(call);
	return (guard as unknown as { decisions: Map<string, { details: { rules?: string[] } } | null> }).decisions.get(call.id)?.details.rules ?? [];
}

describe("a matrix's letter", () => {
	it("is refused when the session already gave it another matrix", () => {
		assert.ok(rulesOf(`Take ${A1}.`, A2).includes("letter"));
		assert.deepEqual(reusedLetter(A2, [A1])?.letter, "A");
	});

	it("passes for a free letter, or the same matrix named again however it is spaced", () => {
		assert.equal(reusedLetter(A2.replace("A =", "B ="), [A1]), null);
		assert.equal(reusedLetter("$$A = \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$$", [A1]), null);
		assert.equal(reusedLetter("$$A^{-1} = \\begin{pmatrix} 4 & -2 \\\\ -3 & 1 \\end{pmatrix}$$", [A1]), null, "A^{-1} is not A");
	});

	it("is the teacher's rule too", () => {
		assert.match(sourcePromptTexts("teacher").join("\n"), /a letter keeps its matrix for the whole session/);
	});
});
