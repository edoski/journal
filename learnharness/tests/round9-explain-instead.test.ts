/**
 * Round 9 (lesson reading m9): after Explain instead, the dropped problem's
 * "Model solution" sat just above the explanation of the same problem, the
 * two saying the same thing one above the other. A problem he asked to be
 * taught instead reveals no model solution; the explanation is the answer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelSolutionForConclude, type LhMessage } from "../src/core/native-messages.ts";

const assistantCall = (id: string, name: string, args: Record<string, unknown>) => ({ role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] });
const result = (id: string, name: string) => ({ role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], isError: false });
const request = (request: string) => ({ role: "custom", customType: "practice-request", content: "", display: false, details: { problemCallId: "p1", request } });

const world = (...between: object[]) => [
	assistantCall("p1", "problem", { statement: "What is dim span{u, v, w}?", modelSolution: "w = 2u + v, so the span has dimension 2." }),
	result("p1", "problem"),
	...between,
	assistantCall("c1", "conclude", { outcome: "movedOn", verdict: "He asked to be taught it instead." }),
	result("c1", "conclude"),
] as unknown as LhMessage[];

describe("Explain instead reveals no model solution above its explanation (round 9 m9)", () => {
	it("a problem he asked to be taught instead has no model solution to open", () => {
		assert.equal(modelSolutionForConclude(world(request("explain")), "c1"), undefined);
	});

	it("a problem he moved on from, or gave up with Show me, keeps its model solution", () => {
		assert.equal(modelSolutionForConclude(world(), "c1"), "w = 2u + v, so the span has dimension 2.");
		assert.equal(modelSolutionForConclude(world(request("hint")), "c1"), "w = 2u + v, so the span has dimension 2.");
		assert.equal(modelSolutionForConclude(world(request("show")), "c1"), "w = 2u + v, so the span has dimension 2.");
	});
});
