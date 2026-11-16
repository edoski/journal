/**
 * Round 14, m13 (3 n2, 2 n5): the slots demo landed 53 s after its
 * question, above a reply that never mentioned it, and its "exact for this
 * n" row showed P(X = 0) = 0.0497, the open question's answer; another
 * demo's legend wrapped a lone "v". The turn a built demo opens now starts
 * by sending him into it, the demo doctrine keeps a value a question asks
 * out of the brief, and labels fit one line. When the demo is dispatched is
 * O2's.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { turnInputOf, VoiceGuard } from "../src/agent/voice-guard.ts";
import { buildSubagentSteer } from "../src/core/contracts/jobs.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const demoCall: ToolCall = { type: "toolCall", id: "d-1", name: "demo", arguments: { title: "Calls in an hour cut into slots", brief: "Sliders for the rate and the number of slots." } };
const built = (html: string): LhMessage => buildSubagentSteer({ id: "job_1", kind: "demo", toolCallId: demoCall.id }, { title: "Calls in an hour cut into slots", html, tested: true, notes: "Built and tested." }) as unknown as LhMessage;
const lesson = (html: string): LhMessage[] => [newUserMessage("Poisson distribution"), { ...fauxAssistantMessage(""), content: [demoCall], id: "a-1" } as LhMessage, built(html)];
const rules = (guard: VoiceGuard, call: ToolCall): string | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
};

describe("a built demo is pointed at (round 14, m13)", () => {
	it("the turn a built demo opens knows it", () => {
		assert.equal(turnInputOf(lesson("<html></html>")).demo, true);
		assert.equal(turnInputOf(lesson("")).demo, undefined, "a demo that failed to build is no demo");
	});

	it("a first message that never sends him into it is refused", () => {
		assert.equal(rules(new VoiceGuard(lesson("<html></html>")), send("Each slot holds a call with chance $\\lambda/n$, independently of the others.")), "demo-unused");
	});

	it("one that names what to try goes through", () => {
		assert.equal(rules(new VoiceGuard(lesson("<html></html>")), send("Slide the number of slots up and watch the hollow circles settle.")), null);
	});

	it("the doctrine keeps a value a question asks out of the brief, labels on one line, and the steer asks for one thing to try", () => {
		const teacher = composeInstructions("teacher");
		assert.match(teacher, /no exact \$P\(X=0\)\$ row while he is asked what \$P\(X=0\)\$ approaches/);
		assert.match(teacher, /in a few words that fit one line \("chance per slot", "line along \$v\$"\)/);
		assert.match(String(built("<html></html>").content), /your next message opens on one thing to try in it/);
	});
});
