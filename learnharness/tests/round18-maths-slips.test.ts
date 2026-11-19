/**
 * Round 18, m18 (4 m20 row, 3 n4 in part), two maths slips:
 * - A practice problem set h(1,1) = (1,0,2) and h(1,−1) = (3,2,0) as two
 *   displays with "and" alone on a line between them. The inline-vector
 *   rule read lessons' messages and questions, never a problem's statement.
 * - The question's $\dfrac{P(X=k)}{P(X=k-1)}$ showed as
 *   "P(X=k)/(P(X=k−1))": the app's inline slash bracketed a denominator its
 *   own brackets already held.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage } from "../src/core/native-messages.ts";
import { transformMathDelimiters } from "../src/core/math-delims.ts";

const LENS_STATEMENT = "A homomorphism $h \\colon \\mathbb{R}^2 \\to \\mathbb{R}^3$ satisfies\n\n$$\nh(1,1) = (1,0,2)\n$$\n\nand\n\n$$\nh(1,-1) = (3,2,0).\n$$\n\nWhat is $h(5,1)$, and why is it determined by these two values alone?";
const withheld = (statement: string): string | null => {
	const guard = new VoiceGuard([newUserMessage("Practice rank")], undefined, false, true);
	const call: ToolCall = { type: "toolCall", id: "p-1", name: "problem", arguments: { statement, mode: "recall", topics: ["homomorphism"], modelSolution: "(9,4,6)" } };
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

describe("maths set as it reads (round 18, m18)", () => {
	it("lens 4's problem, with \"and\" alone between two displays, is refused", () => {
		const broke = withheld(LENS_STATEMENT) ?? "";
		assert.match(broke, /split-display/);
		assert.match(broke, /vector/);
	});

	it("the same values inline pass, and so does a matrix display", () => {
		assert.equal(withheld("A homomorphism $h$ satisfies $h(1,1) = (1,0,2)$ and $h(1,-1) = (3,2,0)$. What is $h(5,1)$?"), null);
		assert.equal(withheld("Let\n\n$$\nA = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}\n$$\n\nFind $\\det A$."), null);
	});

	it("a denominator its own brackets hold is not bracketed again", () => {
		assert.equal(transformMathDelimiters("what is the ratio $\\dfrac{P(X=k)}{P(X=k-1)}$ in simplest form"), "what is the ratio $P(X=k)/P(X=k-1)$ in simplest form");
		assert.equal(transformMathDelimiters("is $\\frac{3}{\\sin(x)}$ here"), "is $3/\\sin(x)$ here");
		assert.equal(transformMathDelimiters("is $\\frac{1}{(n+1)}$ here"), "is $1/(n+1)$ here");
	});

	it("a denominator of two factors keeps its brackets", () => {
		assert.equal(transformMathDelimiters("is $\\frac{a}{(n+1)(n+2)}$ here"), "is $a/((n+1)(n+2))$ here");
		assert.equal(transformMathDelimiters("is $\\frac{1}{n+1}$ here"), "is $1/(n+1)$ here");
	});
});
