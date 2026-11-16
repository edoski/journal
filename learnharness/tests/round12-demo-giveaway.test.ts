/**
 * Round 12, 3 D1 (root cause 6's giveaway): the Poisson demo, dispatched
 * with the lesson's plan, printed "(1 − λ/n)^n next to e^{−λ}", p = λ/n
 * and P(X=k) = e^{−λ}λ^k/k! while the lesson was about to ask him for each
 * of them. A demo shows what he has been taught and lets him find the
 * rest: a brief that prints the formula a step not yet done is about is
 * refused, and the demo rules say so. The recorded plan and brief are in
 * fixtures/round12/poisson-demo.json.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { demoInputSchema } from "../src/agent/tools/jobs.ts";

const recorded = JSON.parse(fs.readFileSync(new URL("./fixtures/round12/poisson-demo.json", import.meta.url), "utf8")) as { plan_init: { mermaid: string }; demo: { title: string; brief: string } };

let n = 0;
const call = (name: string, args: object): ToolCall => ({ type: "toolCall", id: `c-${++n}`, name, arguments: args as ToolCall["arguments"] });
const ok = (c: ToolCall): LhMessage => ({ id: `r-${++n}`, role: "toolResult", toolCallId: c.id, toolName: c.name, content: [{ type: "text", text: "{\"ok\":true}" }], details: {}, isError: false, timestamp: 1 }) as LhMessage;
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;

function lesson(done: string[]): LhMessage[] {
	const plan = call("plan_init", recorded.plan_init);
	const progress = call("lesson_progress", { done });
	return [newUserMessage("Poisson distribution"), assistant([plan]), ok(plan), assistant([progress]), ok(progress)];
}
const withheld = (guard: VoiceGuard, c: ToolCall) => {
	guard.screen(c);
	return (guard as unknown as { decisions: Map<string, { details: { withheld: string }; content: Array<{ text: string }> } | null> }).decisions.get(c.id) ?? null;
};

describe("a demo never prints what a step not yet done asks him to find", () => {
	it("the recorded brief, dispatched before the limit is taught, is refused", () => {
		const guard = new VoiceGuard(lesson([]));
		const refused = withheld(guard, call("demo", recorded.demo));
		assert.equal(refused?.details.withheld, "demo-gives-away");
		assert.match(refused!.content[0]!.text, /limit of/);
	});

	it("once that step is done, the same brief is built", () => {
		const guard = new VoiceGuard(lesson(["slicing", "rate", "zero-events", "limit-e"]));
		assert.equal(withheld(guard, call("demo", recorded.demo)), null);
	});

	it("the demo rules say a demo prints no result he is still to find", () => {
		const teacher = composeInstructions("teacher");
		assert.match(teacher, /demo[^.]*never (?:prints|shows)[^.]*(?:not yet|still to)/i);
		assert.match(String((demoInputSchema.properties.brief as { description?: string }).description), /never[^.]*(?:not yet|still to)/i);
	});
});
